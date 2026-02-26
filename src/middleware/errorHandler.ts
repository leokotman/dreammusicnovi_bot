/**
 * Catches errors in handlers, logs them, and replies with a friendly message.
 * Treats Telegram "message is not modified" (same content on edit) as non-fatal — no log, no reply.
 */

import type { Context } from "telegraf";

const FALLBACK_MESSAGE =
  "Произошла ошибка. Попробуйте позже или напишите преподавателю через меню.";

export function isMessageNotModified(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { response?: { description?: string }; description?: string };
  const desc = e.response?.description ?? e.description ?? "";
  return typeof desc === "string" && desc.includes("message is not modified");
}

export async function withErrorHandling(
  ctx: Context,
  handler: () => Promise<void>
): Promise<void> {
  try {
    await handler();
  } catch (err) {
    if (isMessageNotModified(err)) return;
    console.error("Handler error:", err);
    try {
      await ctx.replyWithHTML(FALLBACK_MESSAGE).catch((e) => console.error("Reply failed:", e));
    } catch {
      // ignore
    }
  }
}
