import { randomBytes, randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import {
  endTerminalSession,
  getSource,
  getTerminalSession,
  insertTerminalSession,
  listActiveTerminalSessions,
  listEndedTerminalSessionsWithSources,
  type SourceRow,
  type TerminalSessionRow,
} from './db.js';
import { AppError, asyncRoute } from './errors.js';
import { beginSourceConnectionUse } from './sourceUsage.js';
import { createTmuxSession, terminateTmuxSession } from './ssh.js';
import { createSessionSchema, idParameterSchema } from './validation.js';

function sessionSource(session: TerminalSessionRow): SourceRow {
  const source = getSource(session.source_id);
  if (!source) throw new AppError(500, 'SESSION_SOURCE_MISSING', '会话关联的 SSH 源不存在');
  return source;
}

export function publicSession(session: TerminalSessionRow) {
  const source = sessionSource(session);
  return {
    id: session.id,
    sourceId: session.source_id,
    sourceName: source.name,
    title: session.name,
    status: session.status,
    tmuxName: session.tmux_name,
    lastError: session.last_error,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

export function terminalSessionOrThrow(id: string): TerminalSessionRow {
  const session = getTerminalSession(id);
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', '终端会话不存在');
  return session;
}

export const sessionRouter = Router();

sessionRouter.get('/', ((_request, response) => {
  response.json({ sessions: listActiveTerminalSessions().map(publicSession) });
}) as RequestHandler);

sessionRouter.get('/history', ((_request, response) => {
  response.json({
    sessions: listEndedTerminalSessionsWithSources().map((session) => ({
      id: session.id,
      sourceId: session.source_id,
      sourceName: session.source_name,
      title: session.name,
      status: session.status,
      tmuxName: session.tmux_name,
      lastError: session.last_error,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    })),
  });
}) as RequestHandler);

sessionRouter.post('/', asyncRoute(async (request, response) => {
  const input = createSessionSchema.parse(request.body);
  const source = getSource(input.sourceId);
  if (!source) throw new AppError(404, 'SOURCE_NOT_FOUND', 'SSH 源不存在');
  if (!source.host_fingerprint) {
    throw new AppError(409, 'HOST_NOT_TRUSTED', '请先测试连接并确认主机指纹');
  }

  const now = Date.now();
  const id = randomUUID();
  const tmuxName = `sshwb_${randomBytes(16).toString('hex')}`;
  const session: TerminalSessionRow = {
    id,
    source_id: source.id,
    name: input.title ?? source.name,
    tmux_name: tmuxName,
    status: 'active',
    created_at: now,
    last_connected_at: null,
    ended_at: null,
    updated_at: now,
    last_error: null,
  };

  const releaseSource = beginSourceConnectionUse(source.id);
  try {
    try {
      await createTmuxSession(source, tmuxName);
      insertTerminalSession(session);
    } catch (error) {
      await terminateTmuxSession(source, tmuxName).catch((cleanupError) => {
        console.error(`Could not clean up tmux session ${tmuxName}`, cleanupError);
      });
      throw error;
    }
  } finally {
    releaseSource();
  }
  response.status(201).json({ session: publicSession(session) });
}));

sessionRouter.delete('/:id', asyncRoute(async (request, response) => {
  const { id } = idParameterSchema.parse(request.params);
  const session = terminalSessionOrThrow(id);
  if (session.status === 'ended') {
    response.status(204).end();
    return;
  }
  await terminateTmuxSession(sessionSource(session), session.tmux_name);
  endTerminalSession(session.id);
  response.status(204).end();
}));
