import { createBot } from "./bot";
import { launchPolling } from "./telegram/polling";
import { updateBotCommands, type TelegramLike } from "./botCommands";
import { getAdminIds } from "./config/admins";

// Content is loaded inside createBot() via initContent()
const bot = createBot();

launchPolling(bot).then(async () => {
  await updateBotCommands(bot.telegram as TelegramLike, getAdminIds());
  console.log("DreamMusic bot is running (long polling).");
}).catch(() => {
  console.error("telegram-polling-start-failed");
  process.exitCode = 1;
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
