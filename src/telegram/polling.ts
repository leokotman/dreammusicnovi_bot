import type { Telegraf } from "telegraf";

/** Telegraf launch deletes an existing webhook; refuse that implicit mode switch. */
export async function launchPolling(bot: Pick<Telegraf, "telegram" | "launch">): Promise<void> {
  const info = await bot.telegram.getWebhookInfo();
  if (info.url) throw new Error("active-webhook-polling-refused");
  await bot.launch();
}
