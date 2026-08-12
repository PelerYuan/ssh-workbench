import fs from 'node:fs';
import WebSocket from 'ws';

const baseUrl = (process.env.BASE_URL ?? 'http://127.0.0.1:5234').replace(/\/$/, '');
const origin = (process.env.ORIGIN ?? baseUrl).replace(/\/$/, '');
const appPassword = process.env.APP_PASSWORD;
const sshHost = process.env.TEST_SSH_HOST ?? '127.0.0.1';
const sshPort = Number(process.env.TEST_SSH_PORT ?? 2222);
const sshUsername = process.env.TEST_SSH_USERNAME ?? 'workbench';
const sshPassword = process.env.TEST_SSH_PASSWORD ?? 'test-password';
const sshKeyPath = process.env.TEST_SSH_KEY_PATH ?? '/fixture/id_ed25519';

if (!appPassword) throw new Error('APP_PASSWORD is required');

let cookie = '';
const sourceIds = [];
const sessionIds = [];

async function request(pathname, init = {}, expected = [200]) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      Origin: origin,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!expected.includes(response.status)) {
    throw new Error(`${init.method ?? 'GET'} ${pathname}: ${response.status} ${JSON.stringify(body)}`);
  }
  return { response, body };
}

async function login() {
  const { response } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password: appPassword }),
  });
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie?.includes('HttpOnly') || !setCookie.includes('SameSite=Strict')) {
    throw new Error('Login cookie is missing HttpOnly or SameSite=Strict');
  }
  cookie = setCookie.split(';', 1)[0];
}

async function createAndTrustSource(input) {
  const { body: created } = await request('/api/sources', {
    method: 'POST',
    body: JSON.stringify(input),
  }, [201]);
  const source = created.source;
  sourceIds.push(source.id);
  const serialized = JSON.stringify(created);
  for (const secret of [input.password, input.privateKey, input.passphrase]) {
    if (secret && serialized.includes(secret)) throw new Error('Source response exposed a saved credential');
  }

  const { body: discovery } = await request(`/api/sources/${source.id}/test`, { method: 'POST' }, [409]);
  if (discovery.error?.code !== 'FINGERPRINT_REQUIRED' || !discovery.error.details?.fingerprint?.startsWith('SHA256:')) {
    throw new Error(`Unexpected SSH fingerprint discovery response: ${JSON.stringify(discovery)}`);
  }
  const fingerprint = discovery.error.details.fingerprint;
  await request(`/api/sources/${source.id}/trust`, {
    method: 'POST',
    body: JSON.stringify({ fingerprint }),
  });
  const { body: tested } = await request(`/api/sources/${source.id}/test`, { method: 'POST' });
  if (!tested.ok || tested.fingerprint !== fingerprint || !tested.tmuxVersion?.startsWith('tmux ')) {
    throw new Error(`Unexpected authenticated SSH test response: ${JSON.stringify(tested)}`);
  }
  return source;
}

function websocketUrl(sessionId) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/sessions/${encodeURIComponent(sessionId)}`;
  return url.toString();
}

async function terminalRoundTrip(sessionId, marker) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`Timed out waiting for terminal marker ${marker}`));
    }, 15_000);
    const socket = new WebSocket(websocketUrl(sessionId), {
      origin,
      headers: { Cookie: cookie },
    });
    let output = '';
    let commandSent = false;

    const finish = (error) => {
      clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'acceptance_complete');
      if (error) reject(error); else resolve(output);
    };

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        finish(new Error(`Invalid WebSocket JSON: ${raw.toString()}`));
        return;
      }
      if (message.type === 'error') {
        finish(new Error(`WebSocket ${message.code}: ${message.message}`));
        return;
      }
      if (message.type === 'connected' && !commandSent) {
        commandSent = true;
        socket.send(JSON.stringify({ type: 'resize', cols: 92, rows: 28 }));
        socket.send(JSON.stringify({ type: 'ping' }));
        socket.send(JSON.stringify({ type: 'input', data: `printf '${marker}\\n'\n` }));
      }
      if (message.type === 'output') {
        output += message.data;
        if (output.includes(marker)) finish();
      }
    });
    socket.on('error', (error) => finish(error));
  });
}

async function cleanup() {
  for (const sessionId of sessionIds.splice(0).reverse()) {
    await request(`/api/sessions/${sessionId}`, { method: 'DELETE' }, [204, 404]).catch(() => undefined);
  }
  for (const sourceId of sourceIds.splice(0).reverse()) {
    await request(`/api/sources/${sourceId}`, { method: 'DELETE' }, [204, 404]).catch(() => undefined);
  }
}

try {
  const { body: health } = await request('/api/health');
  if (health.status !== 'ok') throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  await login();

  const passwordSource = await createAndTrustSource({
    name: `Acceptance password ${Date.now()}`,
    host: sshHost,
    port: sshPort,
    username: sshUsername,
    authType: 'password',
    password: sshPassword,
  });

  const { body: createdSession } = await request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ sourceId: passwordSource.id, title: 'Acceptance terminal', cols: 92, rows: 28 }),
  }, [201]);
  const sessionId = createdSession.session.id;
  sessionIds.push(sessionId);
  await terminalRoundTrip(sessionId, `SSHWB_FIRST_${Date.now()}`);

  const { body: afterDisconnect } = await request('/api/sessions');
  if (!afterDisconnect.sessions.some((session) => session.id === sessionId && session.status === 'active')) {
    throw new Error('Browser disconnect incorrectly ended the terminal session');
  }
  await terminalRoundTrip(sessionId, `SSHWB_REATTACH_${Date.now()}`);

  await request(`/api/sessions/${sessionId}`, { method: 'DELETE' }, [204]);
  sessionIds.splice(sessionIds.indexOf(sessionId), 1);
  const { body: afterTerminate } = await request('/api/sessions');
  if (afterTerminate.sessions.some((session) => session.id === sessionId)) {
    throw new Error('Terminated terminal session remains active');
  }

  const privateKey = fs.readFileSync(sshKeyPath, 'utf8');
  await createAndTrustSource({
    name: `Acceptance private key ${Date.now()}`,
    host: sshHost,
    port: sshPort,
    username: sshUsername,
    authType: 'privateKey',
    privateKey,
  });

  console.log('ACCEPTANCE PASSED: login, password/key SSH, fingerprint, tmux, WebSocket reconnect and termination');
} finally {
  await cleanup();
}
