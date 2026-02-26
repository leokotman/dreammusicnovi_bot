/**
 * Rate limit: 5 text messages per minute per user.
 * Only applied to text messages (not callback_query / button clicks).
 */

const MAX_PER_MINUTE = 5;
const WINDOW_MS = 60 * 1000;

const timestampsByUser = new Map<number, number[]>();

function prune(userId: number): void {
  const list = timestampsByUser.get(userId);
  if (!list) return;
  const cutoff = Date.now() - WINDOW_MS;
  const kept = list.filter((t) => t > cutoff);
  if (kept.length === 0) timestampsByUser.delete(userId);
  else timestampsByUser.set(userId, kept);
}

export function checkTextRateLimit(userId: number): boolean {
  prune(userId);
  const list = timestampsByUser.get(userId) ?? [];
  if (list.length >= MAX_PER_MINUTE) return false;
  list.push(Date.now());
  timestampsByUser.set(userId, list);
  return true;
}
