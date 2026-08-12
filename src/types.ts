export type AuthType = 'password' | 'privateKey';

export interface SshSource {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasPassphrase: boolean;
  hostFingerprint: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SourceInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export type SessionStatus = 'active' | 'ended' | 'error';

export interface TerminalSession {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  status: SessionStatus;
  tmuxName: string;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

