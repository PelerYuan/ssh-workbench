import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-workbench-backend-'));
process.env.APP_PASSWORD = 'integration-password';
process.env.CREDENTIAL_ENCRYPTION_KEY = 'integration-encryption-key-that-is-long-enough';
process.env.DATA_DIR = testDataDirectory;
process.env.COOKIE_SECURE = 'false';
process.env.NODE_ENV = 'test';

let baseUrl: string;
let origin: string;
let closeServer: () => Promise<void>;
let dbModule: typeof import('../server/db.js');
let cryptoModule: typeof import('../server/crypto.js');
let validationModule: typeof import('../server/validation.js');
let sshModule: typeof import('../server/ssh.js');
let securityModule: typeof import('../server/security.js');
let authenticatedSocketsModule: typeof import('../server/authenticatedSockets.js');

beforeAll(async () => {
  const serverModule = await import('../server/index.js');
  dbModule = await import('../server/db.js');
  cryptoModule = await import('../server/crypto.js');
  validationModule = await import('../server/validation.js');
  sshModule = await import('../server/ssh.js');
  securityModule = await import('../server/security.js');
  authenticatedSocketsModule = await import('../server/authenticatedSockets.js');
  const { server, websocketServer } = serverModule.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  origin = baseUrl;
  closeServer = async () => {
    for (const client of websocketServer.clients) client.terminate();
    await new Promise<void>((resolve) => websocketServer.close(() => resolve()));
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  };
});

afterAll(async () => {
  await closeServer?.();
  dbModule?.db.close();
  fs.rmSync(testDataDirectory, { recursive: true, force: true });
});

async function jsonRequest(pathname: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      Origin: origin,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

async function login(): Promise<string> {
  const response = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'integration-password' }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('SameSite=Strict');
  return setCookie!.split(';', 1)[0];
}

function tokenHashFromCookie(cookie: string): string {
  return securityModule.hashToken(cookie.slice(cookie.indexOf('=') + 1));
}

class RevocationTestSocket extends EventEmitter {
  readonly closeCalls: Array<{ code: number | undefined; reason: string | undefined }> = [];

  close(code?: number, reason?: string | Buffer): void {
    this.closeCalls.push({ code, reason: reason?.toString() });
    this.emit('close', code, Buffer.from(reason ?? ''));
  }
}

describe('credential encryption', () => {
  it('does not expose plaintext and rejects authentication-tag tampering', () => {
    const encrypted = cryptoModule.encrypt({ password: 'not-in-the-database' });
    expect(encrypted).not.toContain('not-in-the-database');
    expect(cryptoModule.decrypt(encrypted)).toEqual({ password: 'not-in-the-database' });

    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64url');
    const tampered = parts.join('.');
    expect(() => cryptoModule.decrypt(tampered)).toThrow();
  });
});

describe('strict validation', () => {
  it('rejects command-like hosts and credentials missing for the auth type', () => {
    expect(validationModule.createSourceSchema.safeParse({
      name: 'invalid',
      host: 'host; touch /tmp/injected',
      port: 22,
      username: 'root',
      authType: 'password',
      password: 'secret',
    }).success).toBe(false);

    expect(validationModule.createSourceSchema.safeParse({
      name: 'missing key',
      host: '192.168.1.10',
      port: 22,
      username: 'root',
      authType: 'privateKey',
    }).success).toBe(false);

    expect(() => sshModule.sshInternals.assertTmuxName('name; touch /tmp/injected')).toThrow();
    expect(() => sshModule.sshInternals.assertTmuxName('sshwb_0123456789abcdef0123456789abcdef')).not.toThrow();
  });

  it('formats ssh2 verifier hashes as OpenSSH SHA256 fingerprints', () => {
    const digest = Buffer.alloc(32, 0xab);
    expect(sshModule.sshInternals.fingerprintFromVerifierKey(digest.toString('hex')))
      .toBe(`SHA256:${digest.toString('base64').replace(/=+$/, '')}`);
  });
});

describe('HTTP security and source storage', () => {
  it('keeps the health endpoint minimal and blocks unauthenticated API access', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    const sources = await jsonRequest('/api/sources');
    expect(sources.status).toBe(401);
    expect(await sources.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects state-changing requests from an untrusted origin', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'integration-password' }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'ORIGIN_REJECTED' } });
  });

  it('uses an opaque secure-cookie session and never returns saved credentials', async () => {
    const cookie = await login();

    const create = await jsonRequest('/api/sources', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({
        name: 'Lab server',
        host: '192.168.1.101',
        port: 22,
        username: 'peler',
        authType: 'password',
        password: 'saved-ssh-password',
      }),
    });
    expect(create.status).toBe(201);
    const payload = await create.json() as { source: Record<string, unknown> };
    expect(payload.source).toMatchObject({
      name: 'Lab server',
      hasPassword: true,
      hasPrivateKey: false,
      hostFingerprint: null,
    });
    expect(JSON.stringify(payload)).not.toContain('saved-ssh-password');
    expect(payload.source).not.toHaveProperty('credential');

    const row = dbModule.getSource(payload.source.id as string)!;
    expect(row.credential).not.toContain('saved-ssh-password');
    expect(cryptoModule.decrypt(row.credential)).toEqual({ password: 'saved-ssh-password' });

    const session = await jsonRequest('/api/auth/session', { headers: { Cookie: cookie } });
    expect(await session.json()).toEqual({ authenticated: true });

    const logout = await jsonRequest('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
    expect(logout.status).toBe(204);
    const afterLogout = await jsonRequest('/api/sources', { headers: { Cookie: cookie } });
    expect(afterLogout.status).toBe(401);
  });

  it('revokes only WebSockets authenticated by the logged-out token without ending tmux sessions', async () => {
    const firstCookie = await login();
    const secondCookie = await login();
    const firstSocket = new RevocationTestSocket();
    const secondSocket = new RevocationTestSocket();
    authenticatedSocketsModule.registerAuthenticatedSocket(
      tokenHashFromCookie(firstCookie),
      firstSocket as unknown as WebSocket,
    );
    const unregisterSecond = authenticatedSocketsModule.registerAuthenticatedSocket(
      tokenHashFromCookie(secondCookie),
      secondSocket as unknown as WebSocket,
    );

    const sourceId = randomUUID();
    const sessionId = randomUUID();
    const now = Date.now();
    dbModule.insertSource({
      id: sourceId,
      name: 'Logout isolation source',
      host: '192.168.1.120',
      port: 22,
      username: 'peler',
      auth_type: 'password',
      credential: cryptoModule.encrypt({ password: 'saved-password' }),
      host_fingerprint: 'SHA256:test-fingerprint',
      created_at: now,
      updated_at: now,
    });
    dbModule.insertTerminalSession({
      id: sessionId,
      source_id: sourceId,
      name: 'Persistent tmux session',
      tmux_name: `sshwb_${randomUUID().replaceAll('-', '')}`,
      status: 'active',
      created_at: now,
      last_connected_at: null,
      ended_at: null,
      updated_at: now,
      last_error: null,
    });

    const logout = await jsonRequest('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: firstCookie },
    });
    expect(logout.status).toBe(204);
    expect(firstSocket.closeCalls).toEqual([{
      code: authenticatedSocketsModule.AUTH_SESSION_REVOKED_CLOSE_CODE,
      reason: authenticatedSocketsModule.AUTH_SESSION_REVOKED_CLOSE_REASON,
    }]);
    expect(secondSocket.closeCalls).toEqual([]);
    expect(dbModule.getTerminalSession(sessionId)).toMatchObject({ status: 'active', ended_at: null });

    const firstAccess = await jsonRequest('/api/sources', { headers: { Cookie: firstCookie } });
    const secondAccess = await jsonRequest('/api/sources', { headers: { Cookie: secondCookie } });
    expect(firstAccess.status).toBe(401);
    expect(secondAccess.status).toBe(200);
    unregisterSecond();
  });

  it('can explicitly clear a saved private-key passphrase without exposing it', async () => {
    const cookie = await login();
    const create = await jsonRequest('/api/sources', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({
        name: 'Key source',
        host: '192.168.1.102',
        port: 22,
        username: 'peler',
        authType: 'privateKey',
        privateKey: 'test-private-key-material',
        passphrase: 'saved-key-passphrase',
      }),
    });
    expect(create.status).toBe(201);
    const created = await create.json() as { source: { id: string; hasPassphrase: boolean } };
    expect(created.source.hasPassphrase).toBe(true);
    expect(JSON.stringify(created)).not.toContain('saved-key-passphrase');

    const update = await jsonRequest(`/api/sources/${created.source.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie },
      body: JSON.stringify({ passphrase: '' }),
    });
    expect(update.status).toBe(200);
    const updated = await update.json() as { source: { hasPassphrase: boolean } };
    expect(updated.source.hasPassphrase).toBe(false);
    expect(cryptoModule.decrypt(dbModule.getSource(created.source.id)!.credential)).toEqual({
      privateKey: 'test-private-key-material',
    });
  });
});
