/**
 * In-memory user state for "ask your question" and admin edit flows.
 * Optional TTL to avoid unbounded growth (e.g. 10 min).
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PendingState =
  | { type: "awaiting_question" }
  | { type: "awaiting_edit_lesson"; key: string }
  | { type: "awaiting_edit_faq"; key: string };

const store = new Map<number, { state: PendingState; at: number }>();

function prune(userId: number): void {
  const entry = store.get(userId);
  if (entry && Date.now() - entry.at > TTL_MS) store.delete(userId);
}

export function setState(userId: number, state: PendingState): void {
  store.set(userId, { state, at: Date.now() });
}

export function getState(userId: number): PendingState | null {
  prune(userId);
  return store.get(userId)?.state ?? null;
}

export function clearState(userId: number): void {
  store.delete(userId);
}
