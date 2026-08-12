import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { StringDecoder } from 'node:string_decoder';
import { WebSocket, WebSocketServer } from 'ws';
import {
  AUTH_SESSION_REVOKED_CLOSE_CODE,
  AUTH_SESSION_REVOKED_CLOSE_REASON,
  registerAuthenticatedSocket,
} from './authenticatedSockets.js';
import {
  endTerminalSession,
  getSource,
  touchTerminalSession,
  type SourceRow,
  type TerminalSessionRow,
} from './db.js';
import { AppError } from './errors.js';
import { authenticatedTokenHash, originIsAllowed } from './security.js';
import { terminalSessionOrThrow } from './sessions.js';
import { attachTmuxSession, verifyTmuxSession } from './ssh.js';
import { startMonitoring } from './systemMonitor.js';
import { idParameterSchema, websocketClientMessageSchema } from './validation.js';

type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'output'; data: string }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string; details?: unknown }
  | { type: 'ended'; reason: string };

type HeartbeatWebSocket = WebSocket & { isAlive: boolean };

const outboundHighWaterMark = 1024 * 1024;
const outboundLowWaterMark = 256 * 1024;
const outboundHardLimit = 8 * 1024 * 1024;

function send(socket: WebSocket, message: ServerMessage): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function closeReason(code: string): string {
  return code.slice(0, 123);
}

function rejectUpgrade(socket: import('node:stream').Duplex, status: number, message: string): void {
  const reason = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Bad Request';
  const body = JSON.stringify({ error: { code: message, message: reason } });
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\n`
    + 'Connection: close\r\n'
    + 'Content-Type: application/json\r\n'
    + `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
    + body,
  );
  socket.destroy();
}

function websocketSessionId(request: IncomingMessage): string | undefined {
  let url: URL;
  try {
    url = new URL(request.url ?? '/', 'http://localhost');
  } catch {
    return undefined;
  }
  const match = /^\/ws\/sessions\/([^/]+)$/.exec(url.pathname);
  if (!match) return undefined;
  try {
    return idParameterSchema.parse({ id: decodeURIComponent(match[1]) }).id;
  } catch {
    return undefined;
  }
}

function websocketMonitorId(request: IncomingMessage): string | undefined {
  let url: URL;
  try {
    url = new URL(request.url ?? '/', 'http://localhost');
  } catch {
    return undefined;
  }
  const match = /^\/ws\/monitor\/([^/]+)$/.exec(url.pathname);
  if (!match) return undefined;
  try {
    return idParameterSchema.parse({ id: decodeURIComponent(match[1]) }).id;
  } catch {
    return undefined;
  }
}

function sourceForSession(session: TerminalSessionRow): SourceRow {
  const source = getSource(session.source_id);
  if (!source) throw new AppError(500, 'SESSION_SOURCE_MISSING', '会话关联的 SSH 源不存在');
  return source;
}

async function handleConnection(socket: WebSocket, sessionId: string): Promise<void> {
  let browserClosed = socket.readyState !== WebSocket.OPEN;
  let activeClient: Awaited<ReturnType<typeof attachTmuxSession>>['client'] | undefined;
  let activeStream: Awaited<ReturnType<typeof attachTmuxSession>>['stream'] | undefined;
  let stopActiveOutputTimer: (() => void) | undefined;
  const closeResources = () => {
    browserClosed = true;
    stopActiveOutputTimer?.();
    activeStream?.close();
    activeClient?.end();
  };
  socket.once('close', closeResources);
  socket.once('error', closeResources);

  let session: TerminalSessionRow;
  try {
    session = terminalSessionOrThrow(sessionId);
    if (session.status !== 'active') throw new AppError(410, 'SESSION_ENDED', '终端会话已结束');
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError(500, 'INTERNAL_ERROR', '服务器内部错误');
    send(socket, { type: 'error', code: appError.code, message: appError.message, details: appError.details });
    socket.close(4404, closeReason(appError.code));
    return;
  }

  if (browserClosed) return;

  let connection: Awaited<ReturnType<typeof attachTmuxSession>>;
  const source = sourceForSession(session);
  try {
    const exists = await verifyTmuxSession(source, session.tmux_name);
    if (browserClosed) return;
    if (!exists) {
      endTerminalSession(session.id, '远程 tmux 会话已不存在');
      throw new AppError(410, 'TMUX_SESSION_MISSING', '远程 tmux 会话已不存在');
    }
    connection = await attachTmuxSession(source, session.tmux_name, 100, 30);
    activeClient = connection.client;
    activeStream = connection.stream;
    if (browserClosed) {
      closeResources();
      return;
    }
    touchTerminalSession(session.id);
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError(502, 'SSH_CONNECTION_FAILED', 'SSH 连接失败');
    if (appError.code === 'TMUX_MISSING') endTerminalSession(session.id, appError.message);
    send(socket, { type: 'error', code: appError.code, message: appError.message, details: appError.details });
    socket.close(4502, closeReason(appError.code));
    return;
  }

  const { client, stream } = connection;
  send(socket, { type: 'connected', sessionId: session.id });

  let outputPaused = false;
  let outputResumeTimer: NodeJS.Timeout | undefined;
  const stdoutDecoder = new StringDecoder('utf8');
  const stderrDecoder = new StringDecoder('utf8');
  const stopOutputResumeTimer = () => {
    if (!outputResumeTimer) return;
    clearInterval(outputResumeTimer);
    outputResumeTimer = undefined;
  };
  stopActiveOutputTimer = stopOutputResumeTimer;
  const pauseOutputUntilBrowserCatchesUp = () => {
    if (outputPaused) return;
    outputPaused = true;
    stream.pause();
    outputResumeTimer = setInterval(() => {
      if (browserClosed || socket.readyState !== WebSocket.OPEN) {
        stopOutputResumeTimer();
        return;
      }
      if (socket.bufferedAmount <= outboundLowWaterMark) {
        stopOutputResumeTimer();
        outputPaused = false;
        stream.resume();
      }
    }, 50);
    outputResumeTimer.unref();
  };
  const forwardOutput = (decoder: StringDecoder, chunk: Buffer) => {
    const data = decoder.write(chunk);
    if (!data || !send(socket, { type: 'output', data })) return;
    if (socket.bufferedAmount > outboundHardLimit) {
      closeResources();
      socket.close(1013, 'browser_too_slow');
      return;
    }
    if (socket.bufferedAmount > outboundHighWaterMark) pauseOutputUntilBrowserCatchesUp();
  };

  stream.on('data', (chunk: Buffer) => forwardOutput(stdoutDecoder, chunk));
  stream.stderr.on('data', (chunk: Buffer) => forwardOutput(stderrDecoder, chunk));
  stream.once('close', () => {
    stopOutputResumeTimer();
    const finalOutput = `${stdoutDecoder.end()}${stderrDecoder.end()}`;
    if (finalOutput) send(socket, { type: 'output', data: finalOutput });
    client.end();
    if (browserClosed) return;
    void verifyTmuxSession(source, session.tmux_name).then((exists) => {
      if (!exists) {
        endTerminalSession(session.id, '远程 tmux 会话已结束');
        send(socket, { type: 'ended', reason: 'remote_tmux_ended' });
        socket.close(1000, 'remote_tmux_ended');
        return;
      }
      send(socket, { type: 'error', code: 'SSH_CONNECTION_LOST', message: 'SSH 连接已中断，将自动重连' });
      socket.close(1012, 'ssh_connection_lost');
    }).catch((error) => {
      console.warn(`Could not reconcile tmux session ${session.id}`, error);
      send(socket, { type: 'error', code: 'SSH_CONNECTION_LOST', message: 'SSH 连接已中断，将自动重连' });
      socket.close(1012, 'ssh_connection_lost');
    });
  });
  stream.once('error', (error: Error) => {
    console.warn(`SSH stream error for session ${session.id}: ${error.message}`);
  });
  client.once('error', (error: Error) => {
    console.warn(`SSH client error for session ${session.id}: ${error.message}`);
  });

  socket.on('message', (raw, isBinary) => {
    if (isBinary) {
      send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: '不支持二进制 WebSocket 消息' });
      return;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', code: 'INVALID_JSON', message: 'WebSocket 消息不是有效 JSON' });
      return;
    }
    const parsed = websocketClientMessageSchema.safeParse(decoded);
    if (!parsed.success) {
      send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'WebSocket 消息无效' });
      return;
    }
    if (parsed.data.type === 'input' && !stream.write(parsed.data.data)) {
      socket.pause();
      stream.once('drain', () => {
        if (!browserClosed && socket.readyState === WebSocket.OPEN) socket.resume();
      });
    }
    if (parsed.data.type === 'resize') stream.setWindow(parsed.data.rows, parsed.data.cols, 0, 0);
    if (parsed.data.type === 'ping') send(socket, { type: 'pong' });
  });

}

export function configureWebSocket(server: HttpServer): WebSocketServer {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  const heartbeatTimer = setInterval(() => {
    for (const client of websocketServer.clients) {
      const socket = client as HeartbeatWebSocket;
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeatTimer.unref();
  websocketServer.once('close', () => clearInterval(heartbeatTimer));

  server.on('upgrade', (request, socket, head) => {
    const sessionId = websocketSessionId(request);
    const monitorId = websocketMonitorId(request);

    if (!sessionId && !monitorId) {
      rejectUpgrade(socket, 400, 'INVALID_WEBSOCKET_PATH');
      return;
    }
    if (!originIsAllowed(request)) {
      rejectUpgrade(socket, 403, 'ORIGIN_REJECTED');
      return;
    }
    const tokenHash = authenticatedTokenHash(request);
    if (!tokenHash) {
      rejectUpgrade(socket, 401, 'UNAUTHENTICATED');
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      registerAuthenticatedSocket(tokenHash, websocket);
      if (authenticatedTokenHash(request) !== tokenHash) {
        websocket.close(AUTH_SESSION_REVOKED_CLOSE_CODE, AUTH_SESSION_REVOKED_CLOSE_REASON);
        return;
      }

      if (monitorId) {
        // System monitoring WebSocket
        startMonitoring(websocket);
        return;
      }

      const heartbeatSocket = websocket as HeartbeatWebSocket;
      heartbeatSocket.isAlive = true;
      heartbeatSocket.on('pong', () => { heartbeatSocket.isAlive = true; });
      void handleConnection(websocket, sessionId!).catch((error) => {
        console.error('Unhandled WebSocket connection error', error);
        send(websocket, { type: 'error', code: 'INTERNAL_ERROR', message: '服务器内部错误' });
        websocket.close(4500, 'INTERNAL_ERROR');
      });
    });
  });

  return websocketServer;
}
