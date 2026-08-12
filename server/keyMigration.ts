import { createHash } from 'node:crypto';
import { db } from './db.js';
import { decrypt } from './crypto.js';
import { config } from './config.js';

export function detectKeyMismatch(): {
  hasIssues: boolean;
  corruptedSources: string[];
} {
  const sources = db.prepare('SELECT id, credential FROM ssh_sources').all() as Array<{ id: string; credential: string }>;
  const corrupted: string[] = [];

  for (const source of sources) {
    try {
      decrypt(source.credential);
    } catch {
      corrupted.push(source.id);
    }
  }

  return {
    hasIssues: corrupted.length > 0,
    corruptedSources: corrupted,
  };
}

export function getKeyFingerprint(): string {
  return createHash('sha256').update(config.encryptionKey).digest('hex').substring(0, 16);
}

export function logKeyWarning(): void {
  const keyCheck = detectKeyMismatch();
  if (keyCheck.hasIssues) {
    console.warn('⚠️  WARNING: Some SSH sources cannot be decrypted with the current encryption key');
    console.warn(`   Key fingerprint: ${getKeyFingerprint()}`);
    console.warn(`   Affected sources: ${keyCheck.corruptedSources.length}`);
    console.warn('   These sources will be marked as corrupted and cannot be used.');
    console.warn('   If you recently changed CREDENTIAL_ENCRYPTION_KEY, restore the original key to recover them.');
  }
}
