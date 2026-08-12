const pendingConnectionUses = new Map<string, number>();

export function beginSourceConnectionUse(sourceId: string): () => void {
  pendingConnectionUses.set(sourceId, (pendingConnectionUses.get(sourceId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (pendingConnectionUses.get(sourceId) ?? 1) - 1;
    if (remaining > 0) pendingConnectionUses.set(sourceId, remaining);
    else pendingConnectionUses.delete(sourceId);
  };
}

export function sourceConnectionUsePending(sourceId: string): boolean {
  return (pendingConnectionUses.get(sourceId) ?? 0) > 0;
}
