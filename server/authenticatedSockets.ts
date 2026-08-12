import type { WebSocket } from 'ws';

export const AUTH_SESSION_REVOKED_CLOSE_CODE = 4401;
export const AUTH_SESSION_REVOKED_CLOSE_REASON = 'AUTH_SESSION_REVOKED';

const socketsByTokenHash = new Map<string, Set<WebSocket>>();

export function registerAuthenticatedSocket(tokenHash: string, socket: WebSocket): () => void {
  let sockets = socketsByTokenHash.get(tokenHash);
  if (!sockets) {
    sockets = new Set();
    socketsByTokenHash.set(tokenHash, sockets);
  }
  sockets.add(socket);

  let registered = true;
  const unregister = () => {
    if (!registered) return;
    registered = false;
    socket.off('close', unregister);
    const currentSockets = socketsByTokenHash.get(tokenHash);
    currentSockets?.delete(socket);
    if (currentSockets?.size === 0) socketsByTokenHash.delete(tokenHash);
  };
  socket.once('close', unregister);
  return unregister;
}

export function revokeAuthenticatedSockets(tokenHash: string): void {
  const sockets = socketsByTokenHash.get(tokenHash);
  if (!sockets) return;
  socketsByTokenHash.delete(tokenHash);
  for (const socket of sockets) {
    socket.close(AUTH_SESSION_REVOKED_CLOSE_CODE, AUTH_SESSION_REVOKED_CLOSE_REASON);
  }
}
