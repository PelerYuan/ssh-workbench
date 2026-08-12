import type { ApiErrorBody, SourceInput, SshSource, TerminalSession } from './types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let error: ApiErrorBody = {
      code: 'REQUEST_FAILED',
      message: `请求失败（${response.status}）`,
    };
    try {
      const payload = (await response.json()) as { error?: ApiErrorBody };
      if (payload.error?.message) error = payload.error;
    } catch {
      // The fallback above is intentionally usable for non-JSON proxy errors.
    }
    if (response.status === 401) window.dispatchEvent(new Event('workbench:unauthorized'));
    throw new ApiError(response.status, error);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  getAuthSession: () => request<{ authenticated: boolean }>('/api/auth/session'),
  login: (password: string) =>
    request<{ authenticated: true }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  listSources: () => request<{ sources: SshSource[] }>('/api/sources'),
  createSource: (source: SourceInput) =>
    request<{ source: SshSource }>('/api/sources', {
      method: 'POST',
      body: JSON.stringify(source),
    }),
  updateSource: (id: string, source: Partial<SourceInput>) =>
    request<{ source: SshSource }>(`/api/sources/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(source),
    }),
  deleteSource: (id: string) =>
    request<void>(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testSource: (id: string) =>
    request<{ ok: true; fingerprint: string }>(`/api/sources/${encodeURIComponent(id)}/test`, {
      method: 'POST',
    }),
  trustSource: (id: string, fingerprint: string) =>
    request<{ source: SshSource }>(`/api/sources/${encodeURIComponent(id)}/trust`, {
      method: 'POST',
      body: JSON.stringify({ fingerprint }),
    }),

  listSessions: () => request<{ sessions: TerminalSession[] }>('/api/sessions'),
  createSession: (sourceId: string, title?: string, cols = 100, rows = 30) =>
    request<{ session: TerminalSession }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ sourceId, title: title || undefined, cols, rows }),
    }),
  terminateSession: (id: string) =>
    request<void>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}
