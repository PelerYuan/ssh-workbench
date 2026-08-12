import fs from 'node:fs';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config, paths } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
try {
  fs.chmodSync(config.dataDir, 0o700);
} catch {
  // Some mounted filesystems do not support chmod; SQLite will still apply file modes below.
}

export const db: InstanceType<typeof Database> = new Database(paths.database);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ssh_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    auth_type TEXT NOT NULL CHECK (auth_type IN ('password', 'privateKey')),
    credential TEXT NOT NULL,
    host_fingerprint TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS terminal_sessions (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES ssh_sources(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    tmux_name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
    created_at INTEGER NOT NULL,
    last_connected_at INTEGER,
    ended_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_terminal_status ON terminal_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_terminal_source_status ON terminal_sessions(source_id, status);
  CREATE INDEX IF NOT EXISTS idx_auth_expiry ON auth_sessions(expires_at);
`);

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('terminal_sessions', 'updated_at', 'INTEGER');
ensureColumn('terminal_sessions', 'last_error', 'TEXT');
db.prepare('UPDATE terminal_sessions SET updated_at = COALESCE(updated_at, created_at)').run();

try {
  fs.chmodSync(paths.database, 0o600);
} catch {
  // See the data-directory chmod note above.
}

const passwordHash = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'")
  .get() as { value: string } | undefined;
if (!passwordHash || !bcrypt.compareSync(config.appPassword, passwordHash.value)) {
  const replacePassword = db.transaction(() => {
    db.prepare(`
      INSERT INTO settings(key, value) VALUES ('password_hash', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(bcrypt.hashSync(config.appPassword, 12));
    db.prepare('DELETE FROM auth_sessions').run();
  });
  replacePassword();
}

db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Date.now());

export type PasswordCredential = { password: string };
export type PrivateKeyCredential = { privateKey: string; passphrase?: string };
export type Credential = PasswordCredential | PrivateKeyCredential;

export type SourceRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'privateKey';
  credential: string;
  host_fingerprint: string | null;
  created_at: number;
  updated_at: number;
};

export type TerminalSessionRow = {
  id: string;
  source_id: string;
  name: string;
  tmux_name: string;
  status: 'active' | 'ended';
  created_at: number;
  last_connected_at: number | null;
  ended_at: number | null;
  updated_at: number;
  last_error: string | null;
};

export function verifyApplicationPassword(password: string): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'")
    .get() as { value: string } | undefined;
  return Boolean(row && bcrypt.compareSync(password, row.value));
}

export function createAuthSession(tokenHash: string, expiresAt: number): void {
  db.prepare('INSERT INTO auth_sessions(token_hash, expires_at) VALUES (?, ?)').run(tokenHash, expiresAt);
}

export function deleteAuthSession(tokenHash: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}

export function authSessionExists(tokenHash: string, now = Date.now()): boolean {
  const result = db.prepare('SELECT 1 FROM auth_sessions WHERE token_hash = ? AND expires_at > ?')
    .get(tokenHash, now);
  return Boolean(result);
}

export function removeExpiredAuthSessions(now = Date.now()): void {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
}

export function listSources(): SourceRow[] {
  return db.prepare('SELECT * FROM ssh_sources ORDER BY name COLLATE NOCASE, created_at').all() as SourceRow[];
}

export function getSource(id: string): SourceRow | undefined {
  return db.prepare('SELECT * FROM ssh_sources WHERE id = ?').get(id) as SourceRow | undefined;
}

export function insertSource(source: SourceRow): void {
  db.prepare(`
    INSERT INTO ssh_sources(
      id, name, host, port, username, auth_type, credential, host_fingerprint, created_at, updated_at
    ) VALUES (
      @id, @name, @host, @port, @username, @auth_type, @credential,
      @host_fingerprint, @created_at, @updated_at
    )
  `).run(source);
}

export function updateSource(source: SourceRow): void {
  db.prepare(`
    UPDATE ssh_sources SET
      name = @name,
      host = @host,
      port = @port,
      username = @username,
      auth_type = @auth_type,
      credential = @credential,
      host_fingerprint = @host_fingerprint,
      updated_at = @updated_at
    WHERE id = @id
  `).run(source);
}

export function updateSourceFingerprint(id: string, fingerprint: string, now = Date.now()): void {
  db.prepare('UPDATE ssh_sources SET host_fingerprint = ?, updated_at = ? WHERE id = ?')
    .run(fingerprint, now, id);
}

export function sourceHasActiveSessions(id: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM terminal_sessions WHERE source_id = ? AND status = 'active' LIMIT 1").get(id));
}

export function deleteSource(id: string): boolean {
  return db.transaction(() => {
    db.prepare("DELETE FROM terminal_sessions WHERE source_id = ? AND status = 'ended'").run(id);
    return db.prepare('DELETE FROM ssh_sources WHERE id = ?').run(id).changes > 0;
  })();
}

export function listActiveTerminalSessions(): TerminalSessionRow[] {
  return db.prepare("SELECT * FROM terminal_sessions WHERE status = 'active' ORDER BY updated_at DESC")
    .all() as TerminalSessionRow[];
}

export function listEndedTerminalSessionsWithSources(): Array<TerminalSessionRow & { source_name: string }> {
  return db.prepare(`
    SELECT terminal_sessions.*, ssh_sources.name AS source_name
    FROM terminal_sessions
    JOIN ssh_sources ON ssh_sources.id = terminal_sessions.source_id
    WHERE terminal_sessions.status = 'ended'
    ORDER BY terminal_sessions.updated_at DESC
  `).all() as Array<TerminalSessionRow & { source_name: string }>;
}

export function getTerminalSession(id: string): TerminalSessionRow | undefined {
  return db.prepare('SELECT * FROM terminal_sessions WHERE id = ?').get(id) as TerminalSessionRow | undefined;
}

export function insertTerminalSession(session: TerminalSessionRow): void {
  db.prepare(`
    INSERT INTO terminal_sessions(
      id, source_id, name, tmux_name, status, created_at, last_connected_at,
      ended_at, updated_at, last_error
    ) VALUES (
      @id, @source_id, @name, @tmux_name, @status, @created_at,
      @last_connected_at, @ended_at, @updated_at, @last_error
    )
  `).run(session);
}

export function touchTerminalSession(id: string, now = Date.now()): void {
  db.prepare(`
    UPDATE terminal_sessions
    SET last_connected_at = ?, updated_at = ?, last_error = NULL
    WHERE id = ? AND status = 'active'
  `).run(now, now, id);
}

export function endTerminalSession(id: string, reason: string | null = null, now = Date.now()): void {
  db.prepare(`
    UPDATE terminal_sessions
    SET status = 'ended', ended_at = ?, updated_at = ?, last_error = ?
    WHERE id = ?
  `).run(now, now, reason, id);
}

export function databaseIsHealthy(): boolean {
  return (db.prepare('SELECT 1 AS ok').get() as { ok: number }).ok === 1;
}
