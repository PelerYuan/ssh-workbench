import { createHash } from 'node:crypto';
import path from 'node:path';

function requiredSecret(name: string, minimumLength: number): string {
  const value = process.env[name];
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must contain at least ${minimumLength} characters`);
  }
  return value;
}

function integerSetting(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

const appPassword = requiredSecret('APP_PASSWORD', 8);
const encryptionSecret = requiredSecret('CREDENTIAL_ENCRYPTION_KEY', 32);
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

for (const origin of allowedOrigins) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`ALLOWED_ORIGIN contains an invalid origin: ${origin}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error(`ALLOWED_ORIGIN must contain origins only: ${origin}`);
  }
}

const trustProxyRaw = process.env.TRUST_PROXY;
const trustProxy = trustProxyRaw === undefined
  ? false
  : /^\d+$/.test(trustProxyRaw)
    ? Number(trustProxyRaw)
    : trustProxyRaw === 'true';

export const config = Object.freeze({
  host: '0.0.0.0',
  port: integerSetting('PORT', 5234, 1, 65_535),
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  appPassword,
  encryptionKey: createHash('sha256').update(encryptionSecret, 'utf8').digest(),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  allowedOrigins,
  trustProxy,
  sessionDays: integerSetting('SESSION_DAYS', 30, 1, 365),
  sshReadyTimeoutMs: integerSetting('SSH_READY_TIMEOUT_MS', 12_000, 1_000, 120_000),
  sshCommandTimeoutMs: integerSetting('SSH_COMMAND_TIMEOUT_MS', 10_000, 1_000, 120_000),
  isProduction: process.env.NODE_ENV === 'production',
});

export const paths = Object.freeze({
  database: path.join(config.dataDir, 'workbench.sqlite'),
  staticFiles: path.resolve('dist'),
});
