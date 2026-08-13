import type { SourceInput, SshSource, TerminalSession } from './types';

// Mock data for UI testing
const mockSources: SshSource[] = [
  {
    id: '1',
    name: 'Production Server',
    host: '192.168.1.100',
    port: 22,
    username: 'admin',
    authType: 'privateKey',
    hasPassword: false,
    hasPrivateKey: true,
    hasPassphrase: false,
    hostFingerprint: 'SHA256:abc123...',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '2',
    name: 'Development Server',
    host: 'dev.example.com',
    port: 22,
    username: 'developer',
    authType: 'password',
    hasPassword: true,
    hasPrivateKey: false,
    hasPassphrase: false,
    hostFingerprint: 'SHA256:def456...',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockSessions: TerminalSession[] = [
  {
    id: 's1',
    sourceId: '1',
    sourceName: 'Production Server',
    title: 'Production Shell',
    status: 'active',
    tmuxName: 'tmux-s1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastError: null,
  },
  {
    id: 's2',
    sourceId: '2',
    sourceName: 'Development Server',
    title: 'Dev Environment',
    status: 'active',
    tmuxName: 'tmux-s2',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastError: null,
  },
];

export const mockApi = {
  getAuthSession: () => Promise.resolve({ authenticated: true }),
  login: () => Promise.resolve({ authenticated: true as const }),
  logout: () => Promise.resolve(),

  listSources: () => Promise.resolve({ sources: mockSources }),
  createSource: (source: SourceInput) => {
    const now = Date.now();
    const newSource: SshSource = {
      id: String(now),
      name: source.name,
      host: source.host,
      port: source.port,
      username: source.username,
      authType: source.authType,
      hasPassword: Boolean(source.password),
      hasPrivateKey: Boolean(source.privateKey),
      hasPassphrase: Boolean(source.passphrase),
      hostFingerprint: null,
      createdAt: now,
      updatedAt: now,
    };
    mockSources.push(newSource);
    return Promise.resolve({ source: newSource });
  },
  updateSource: (id: string, source: Partial<SourceInput>) => {
    const existing = mockSources.find((s) => s.id === id);
    if (!existing) throw new Error('Source not found');
    Object.assign(existing, source, { updatedAt: Date.now() });
    return Promise.resolve({ source: existing });
  },
  deleteSource: (id: string) => {
    const index = mockSources.findIndex((s) => s.id === id);
    if (index !== -1) mockSources.splice(index, 1);
    return Promise.resolve();
  },
  testSource: () => Promise.resolve({ ok: true as const, fingerprint: 'SHA256:test123...' }),
  trustSource: (id: string, fingerprint: string) => {
    const source = mockSources.find((s) => s.id === id);
    if (!source) throw new Error('Source not found');
    source.hostFingerprint = fingerprint;
    return Promise.resolve({ source });
  },

  listSessions: () => Promise.resolve({ sessions: mockSessions }),
  createSession: (sourceId: string, title?: string) => {
    const source = mockSources.find((s) => s.id === sourceId);
    if (!source) throw new Error('Source not found');
    const now = Date.now();
    const session: TerminalSession = {
      id: 's' + now,
      sourceId,
      sourceName: source.name,
      title: title || `${source.name} Shell`,
      status: 'active',
      tmuxName: 'tmux-' + now,
      createdAt: now,
      updatedAt: now,
      lastError: null,
    };
    mockSessions.push(session);
    return Promise.resolve({ session });
  },
  terminateSession: (id: string) => {
    const session = mockSessions.find((s) => s.id === id);
    if (session) session.status = 'ended';
    return Promise.resolve();
  },
};
