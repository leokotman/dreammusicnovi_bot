import { createBot } from "./bot";
import { updateBotCommands, type TelegramLike } from "./botCommands";
import { getAdminIds } from "./config/admins";

// Content is loaded inside createBot() via initContent()
const bot = createBot();

bot.launch().then(async () => {
  await updateBotCommands(bot.telegram as TelegramLike, getAdminIds());
  console.log("DreamMusic bot is running (long polling).");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
