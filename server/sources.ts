import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { decrypt, encrypt } from './crypto.js';
import {
  deleteSource,
  getSource,
  insertSource,
  listSources,
  sourceHasActiveSessions,
  updateSource,
  updateSourceFingerprint,
  type Credential,
  type SourceRow,
} from './db.js';
import { AppError, asyncRoute } from './errors.js';
import { beginSourceConnectionUse, sourceConnectionUsePending } from './sourceUsage.js';
import { testSshSource } from './ssh.js';
import {
  createSourceSchema,
  idParameterSchema,
  trustFingerprintSchema,
  updateSourceSchema,
  type CreateSourceInput,
  type UpdateSourceInput,
} from './validation.js';

function publicSource(source: SourceRow) {
  let credential: Credential;
  try {
    credential = decrypt<Credential>(source.credential);
  } catch (error) {
    console.error(`Could not inspect credential for source ${source.id}`, error);
    throw new AppError(500, 'CREDENTIAL_DECRYPTION_FAILED', '无法解密已保存的 SSH 凭据');
  }
  return {
    id: source.id,
    name: source.name,
    host: source.host,
    port: source.port,
    username: source.username,
    authType: source.auth_type,
    hasPassword: 'password' in credential && credential.password.length > 0,
    hasPrivateKey: 'privateKey' in credential && credential.privateKey.length > 0,
    hasPassphrase: 'passphrase' in credential && Boolean(credential.passphrase),
    hostFingerprint: source.host_fingerprint,
    createdAt: source.created_at,
    updatedAt: source.updated_at,
  };
}

function credentialFromCreate(input: CreateSourceInput): Credential {
  if (input.authType === 'password') return { password: input.password! };
  return {
    privateKey: input.privateKey!,
    ...(input.passphrase ? { passphrase: input.passphrase } : {}),
  };
}

function credentialFromUpdate(existing: SourceRow, input: UpdateSourceInput): Credential {
  let stored: Credential;
  try {
    stored = decrypt<Credential>(existing.credential);
  } catch (error) {
    console.error(`Could not decrypt credential for source ${existing.id}`, error);
    throw new AppError(500, 'CREDENTIAL_DECRYPTION_FAILED', '无法解密已保存的 SSH 凭据');
  }

  const authType = input.authType ?? existing.auth_type;
  if (authType === 'password') {
    if (input.password !== undefined) {
      if (!input.password) throw new AppError(400, 'PASSWORD_REQUIRED', 'SSH 密码不能为空');
      return { password: input.password };
    }
    if (existing.auth_type !== 'password' || !('password' in stored)) {
      throw new AppError(400, 'PASSWORD_REQUIRED', '切换到密码认证时必须提供 SSH 密码');
    }
    return stored;
  }

  const key = input.privateKey !== undefined
    ? input.privateKey
    : existing.auth_type === 'privateKey' && 'privateKey' in stored
      ? stored.privateKey
      : undefined;
  if (!key?.trim()) throw new AppError(400, 'PRIVATE_KEY_REQUIRED', '切换到密钥认证时必须提供私钥');

  let resolvedPassphrase: string | undefined;
  if (input.passphrase !== undefined) {
    resolvedPassphrase = input.passphrase || undefined;
  } else if (existing.auth_type === 'privateKey' && 'privateKey' in stored) {
    resolvedPassphrase = stored.passphrase;
  }
  return { privateKey: key, ...(resolvedPassphrase ? { passphrase: resolvedPassphrase } : {}) };
}

function sourceOrThrow(id: string): SourceRow {
  const source = getSource(id);
  if (!source) throw new AppError(404, 'SOURCE_NOT_FOUND', 'SSH 源不存在');
  return source;
}

export const sourceRouter = Router();

sourceRouter.get('/', ((_request, response) => {
  response.json({ sources: listSources().map(publicSource) });
}) as RequestHandler);

sourceRouter.post('/', ((request, response) => {
  const input = createSourceSchema.parse(request.body);
  const now = Date.now();
  const source: SourceRow = {
    id: randomUUID(),
    name: input.name,
    host: input.host,
    port: input.port,
    username: input.username,
    auth_type: input.authType,
    credential: encrypt(credentialFromCreate(input)),
    host_fingerprint: null,
    created_at: now,
    updated_at: now,
  };
  insertSource(source);
  response.status(201).json({ source: publicSource(source) });
}) as RequestHandler);

sourceRouter.patch('/:id', ((request, response) => {
  const { id } = idParameterSchema.parse(request.params);
  const input = updateSourceSchema.parse(request.body);
  const existing = sourceOrThrow(id);
  const endpointChanged = (input.host !== undefined && input.host !== existing.host)
    || (input.port !== undefined && input.port !== existing.port)
    || (input.username !== undefined && input.username !== existing.username);
  if (endpointChanged && (sourceHasActiveSessions(id) || sourceConnectionUsePending(id))) {
    throw new AppError(409, 'SOURCE_IN_USE', '请先终止该 SSH 源的活动会话，再修改主机、端口或用户名');
  }
  const identityChanged = (input.host !== undefined && input.host !== existing.host)
    || (input.port !== undefined && input.port !== existing.port);
  const source: SourceRow = {
    ...existing,
    name: input.name ?? existing.name,
    host: input.host ?? existing.host,
    port: input.port ?? existing.port,
    username: input.username ?? existing.username,
    auth_type: input.authType ?? existing.auth_type,
    credential: encrypt(credentialFromUpdate(existing, input)),
    host_fingerprint: identityChanged ? null : existing.host_fingerprint,
    updated_at: Date.now(),
  };
  updateSource(source);
  response.json({ source: publicSource(source) });
}) as RequestHandler);

sourceRouter.delete('/:id', ((request, response) => {
  const { id } = idParameterSchema.parse(request.params);
  sourceOrThrow(id);
  if (sourceHasActiveSessions(id) || sourceConnectionUsePending(id)) {
    throw new AppError(409, 'SOURCE_IN_USE', '请先终止该 SSH 源的活动会话');
  }
  deleteSource(id);
  response.status(204).end();
}) as RequestHandler);

sourceRouter.post('/:id/test', asyncRoute(async (request, response) => {
  const { id } = idParameterSchema.parse(request.params);
  const source = sourceOrThrow(id);
  const releaseSource = beginSourceConnectionUse(id);
  try {
    const result = await testSshSource(source, source.host_fingerprint ?? undefined);
    response.json({ ok: true, ...result });
  } finally {
    releaseSource();
  }
}));

sourceRouter.post('/:id/trust', asyncRoute(async (request, response) => {
  const { id } = idParameterSchema.parse(request.params);
  const { fingerprint } = trustFingerprintSchema.parse(request.body);
  const source = sourceOrThrow(id);
  const releaseSource = beginSourceConnectionUse(id);
  try {
    await testSshSource(source, fingerprint);
    updateSourceFingerprint(source.id, fingerprint);
    response.json({ source: publicSource(sourceOrThrow(source.id)) });
  } finally {
    releaseSource();
  }
}));
