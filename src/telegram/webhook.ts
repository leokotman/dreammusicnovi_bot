import { timingSafeEqual } from "node:crypto";
import type { Telegram } from "telegraf";

const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;

/** Fail closed before loading content, creating a bot or accepting identity evidence. */
export function webhookAuthorization(secret: unknown, header: unknown): 200 | 403 | 503 {
  if (typeof secret !== "string" || !TOKEN.test(secret)) return 503;
  if (typeof header !== "string" || !TOKEN.test(header)) return 403;
  const expected = Buffer.from(secret), actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? 200 : 403;
}

export function setupAuthorized(secret: unknown, supplied: unknown): boolean {
  return webhookAuthorization(secret, supplied) === 200;
}

/** Explicit administrative operation only; never called during bot startup or an update. */
export async function configureWebhook(telegram: Pick<Telegram, "getWebhookInfo" | "setWebhook">,
  secret: unknown, initialUrl: unknown) {
  if (webhookAuthorization(secret, secret) !== 200) throw new Error("webhook-unconfigured");
  const current = await telegram.getWebhookInfo();
  // Existing routing wins over request Host and environment overrides.
  const target = current.url || initialUrl;
  if (typeof target !== "string") throw new Error("webhook-unconfigured");
  const url = new URL(target);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search ||
      url.pathname !== "/api/webhook") throw new Error("invalid-webhook-url");
  // Empty/absent means Telegram's default subscription, which already includes my_chat_member.
  // Omitting allowed_updates preserves that default and any newer Telegram update types.
  // Telegram may report types newer than this installed Telegraf's type union.
  // Preserve them verbatim rather than filtering the live subscription.
  type Allowed = NonNullable<Parameters<Telegram["setWebhook"]>[1]>["allowed_updates"];
  const allowed = current.allowed_updates;
  await telegram.setWebhook(target, {
    secret_token: secret as string,
    drop_pending_updates: false,
    ...(allowed?.length ? { allowed_updates: [...new Set([...allowed, "my_chat_member"])] as Allowed } : {}),
    ...(current.max_connections ? { max_connections: current.max_connections } : {}),
  });
}
