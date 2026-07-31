export type UserAuthorityChangeReason = "updated" | "deleted";

type UserAuthorityChangeListener = (userId: string, reason: UserAuthorityChangeReason) => void;

const listeners = new Set<UserAuthorityChangeListener>();

export function emitUserAuthorityChanged(userId: string, reason: UserAuthorityChangeReason): void {
  if (!userId) return;
  for (const listener of listeners) {
    listener(userId, reason);
  }
}

export function onUserAuthorityChanged(listener: UserAuthorityChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
