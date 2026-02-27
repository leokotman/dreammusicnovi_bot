/**
 * Vercel serverless handler for Telegram webhook.
 * Telegram sends POST with Update; we pass it to Telegraf and return 200.
 * Set the webhook once after deploy: GET /api/webhook?set=YOUR_SECRET (set WEBHOOK_SET_SECRET in env).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createBot } from "../src/bot";

let botInstance: ReturnType<typeof createBot> | null = null;

function getBot() {
  if (!botInstance) botInstance = createBot();
  return botInstance;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Optional: one-time webhook setup. GET /api/webhook?set=SECRET sets the webhook URL.
  if (req.method === "GET" && req.query.set) {
    const secret = process.env.WEBHOOK_SET_SECRET;
    if (secret && req.query.set === secret) {
      // Use the Host header so the webhook is set to the URL you actually opened (e.g. production domain).
      const host = req.headers.host;
      if (host) {
        const url = `https://${host}/api/webhook`;
        await getBot().telegram.setWebhook(url);
        return res.status(200).send(`Webhook set to ${url}`);
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
    await getBot().handleUpdate(body);
    return res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).end();
  }
}
