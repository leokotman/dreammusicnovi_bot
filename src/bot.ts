import { Telegraf } from "telegraf";
import { env } from "./config/env";
import { initContent } from "./content/loader";
import { registerCommands } from "./handlers/commands";
import { registerCallbacks } from "./handlers/callbacks";
import { registerAdmin } from "./handlers/admin";
import { handleText } from "./handlers/text";

export function createBot(): Telegraf {
  initContent();

  const bot = new Telegraf(env.BOT_TOKEN);

  registerCommands(bot);
  registerCallbacks(bot);
  registerAdmin(bot);

  bot.on("text", async (ctx, next) => {
    await handleText(ctx);
    return next();
  });

  return bot;
}
