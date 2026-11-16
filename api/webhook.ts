/** Authenticated Telegram webhook. Registration is an explicit administrative operation. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createBot } from "../src/bot";
import { ensureSavedContentLoaded } from "../src/content/loader";
import { ensureAdminsLoaded } from "../src/config/admins";
import { env } from "../src/config/env";
import { configureWebhook, setupAuthorized, webhookAuthorization } from "../src/telegram/webhook";

let botInstance: ReturnType<typeof createBot> | null = null;
function getBot() {
  if (!botInstance) botInstance = createBot();
  return botInstance;
}
function getEnvAdminIds(): string[] {
  return [env.TEACHER_USER_ID, env.DEV_ID, ...env.ADMIN_IDS].filter(
    (id): id is string => typeof id === "string"
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.query.set) {
    if (!setupAuthorized(process.env.WEBHOOK_SET_SECRET, req.query.set))
      return res.status(403).send("Forbidden");
    if (webhookAuthorization(process.env.TELEGRAM_WEBHOOK_SECRET, process.env.TELEGRAM_WEBHOOK_SECRET) !== 200)
      return res.status(503).send("Webhook unconfigured");
    try {
      await configureWebhook(getBot().telegram, process.env.TELEGRAM_WEBHOOK_SECRET, process.env.TELEGRAM_WEBHOOK_URL);
      await ensureAdminsLoaded(getEnvAdminIds());
      const { updateBotCommands } = await import("../src/botCommands");
      const { getAdminIds } = await import("../src/config/admins");
      await updateBotCommands(getBot().telegram as Parameters<typeof updateBotCommands>[0], getAdminIds());
      return res.status(200).send("Webhook configured. Commands updated.");
    } catch {
      // Telegram errors may contain URLs, tokens and update payloads.
      return res.status(503).send("Webhook setup failed");
    }
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method not allowed");
  }
  const authorization = webhookAuthorization(process.env.TELEGRAM_WEBHOOK_SECRET,
    req.headers["x-telegram-bot-api-secret-token"]);
  if (authorization !== 200)
    return res.status(authorization).send(authorization === 503 ? "Webhook unconfigured" : "Forbidden");
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Number.isSafeInteger(body.update_id) || body.update_id < 0)
    return res.status(400).send("Invalid update");
  try {
    await ensureSavedContentLoaded();
    await ensureAdminsLoaded(getEnvAdminIds());
    await getBot().handleUpdate(body);
    return res.status(200).end();
  } catch {
    console.error("telegram-webhook-failure");
    return res.status(500).end();
  }
}
