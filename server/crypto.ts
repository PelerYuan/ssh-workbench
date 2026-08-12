import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config.js';

const VERSION = 'v1';

export function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => typeof part === 'string' ? part : part.toString('base64url'))
    .join('.');
}

export function decrypt<T>(encoded: string): T {
  const parts = encoded.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Stored credential has an unsupported format');
  }

  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Stored credential is invalid');
  }

  const decipher = createDecipheriv('aes-256-gcm', config.encryptionKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext) as T;
}
