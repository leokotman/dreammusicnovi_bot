import { createHash, createHmac } from "node:crypto";

export const PAIRING_PREFIX = "dmn1_";
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/** Canonical encoding prevents aliases for one attempt bypassing deduplication. */
export function validAttempt(value: unknown): value is string {
  if (typeof value !== "string" || !/^dmn1_[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const encoded = value.slice(PAIRING_PREFIX.length);
  return Buffer.from(encoded, "base64url").toString("base64url") === encoded;
}

export function attemptHash(attempt: string): string {
  if (!validAttempt(attempt)) throw new Error("invalid-attempt");
  return createHash("sha256").update(attempt).digest("hex");
}

/** Only call after transport authentication; shape validation cannot authenticate Telegram. */
export function privateIdentity(value: unknown): { userId: string; username: string } {
  const message = value as { from?: { id?: unknown; is_bot?: unknown; username?: unknown };
    chat?: { id?: unknown; type?: unknown } } | null;
  const user = message?.from, chat = message?.chat;
  if (!user || !chat || user.is_bot !== false || chat.type !== "private" ||
      typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0 ||
      chat.id !== user.id) throw new Error("invalid-private-identity");
  if (typeof user.username !== "string" || !USERNAME.test(user.username)) throw new Error("username-required");
  return { userId: String(user.id), username: user.username };
}

/** Deterministic across duplicate Start updates. Never persist or log the plaintext code. */
export function pairingCode(botToken: string, attempt: string, userId: string): string {
  if (!validAttempt(attempt) || !/^[1-9][0-9]{0,15}$/.test(userId) ||
      !/^[1-9][0-9]*:[A-Za-z0-9_-]+$/.test(botToken)) throw new Error("invalid-pairing-input");
  const digest = createHmac("sha256", botToken)
    .update(JSON.stringify(["dmn-telegram-pairing-code-v1", attempt, userId])).digest();
  // A 48-bit value is exactly representable; modulo bias is negligible at this size.
  return String(digest.readUIntBE(0, 6) % 1_000_000).padStart(6, "0");
}

export function codeHash(attempt: string, code: string): string {
  if (!validAttempt(attempt) || !/^[0-9]{6}$/.test(code)) throw new Error("invalid-pairing-input");
  return createHash("sha256").update(JSON.stringify(["dmn-telegram-pairing-code-hash-v1", attempt, code])).digest("hex");
}
