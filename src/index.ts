import { createBot } from "./bot";

// Content is loaded inside createBot() via initContent()
const bot = createBot();

bot.launch().then(() => {
  console.log("DreamMusic bot is running (long polling).");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
