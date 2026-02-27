/**
 * Vercel serverless handler for Telegram webhook.
 * Telegram sends POST with Update; we pass it to Telegraf and return 200.
 * Set the webhook once after deploy: GET /api/webhook?set=YOUR_SECRET (set WEBHOOK_SET_SECRET in env).
 * When BLOB_READ_WRITE_TOKEN is set, saved content and admins are loaded from Vercel Blob at the start of each request so admin edits persist.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createBot } from "../src/bot";
import { ensureSavedContentLoaded } from "../src/content/loader";
import { ensureAdminsLoaded } from "../src/config/admins";
import { env } from "../src/config/env";

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
  // Optional: one-time webhook setup. GET /api/webhook?set=SECRET sets the webhook URL.
  if (req.method === "GET" && req.query.set) {
    const secret = process.env.WEBHOOK_SET_SECRET;
    if (secret && req.query.set === secret) {
      const host = req.headers.host;
      if (host) {
        const url = `https://${host}/api/webhook`;
        await getBot().telegram.setWebhook(url);
        await ensureAdminsLoaded(getEnvAdminIds());
        const { updateBotCommands } = await import("../src/botCommands");
        const { getAdminIds } = await import("../src/config/admins");
        await updateBotCommands(getBot().telegram as Parameters<typeof updateBotCommands>[0], getAdminIds());
        return res.status(200).send(`Webhook set to ${url}. Commands updated.`);
      }
    }
    return res.status(400).send("Missing Host header or wrong secret");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const body = req.body;
  if (!body) {
    return res.status(400).send("No body");
  }

  try {
    // Load saved content and admins from Blob (or keep in-memory from init/load) so admin edits persist on Vercel
    await ensureSavedContentLoaded();
    await ensureAdminsLoaded(getEnvAdminIds());
    await getBot().handleUpdate(body);
    return res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).end();
  }
}
