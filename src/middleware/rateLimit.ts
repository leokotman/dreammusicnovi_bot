/**
 * Rate limit: N text messages per minute per user (N from env RATE_LIMIT_MAX_PER_MINUTE, default 5).
 * Only applied to text messages (not callback_query / button clicks).
 * Callers should skip this for admins (e.g. in text handler).
 */

const WINDOW_MS = 60 * 1000;

function getMaxPerMinute(): number {
  const v = process.env.RATE_LIMIT_MAX_PER_MINUTE;
  if (v === undefined || v === "") return 5;
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n < 1 ? 5 : n;
}

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
  if (list.length >= getMaxPerMinute()) return false;
  list.push(Date.now());
  timestampsByUser.set(userId, list);
  return true;
}
