import type { Context } from "telegraf";
import { getMainMenu, mainMenuMessage } from "../menus/main.menu";
import { withErrorHandling } from "../middleware/errorHandler";

export function registerCommands(bot: {
  start: (fn: (ctx: Context) => Promise<unknown>) => void;
  help: (fn: (ctx: Context) => Promise<unknown>) => void;
}) {
  bot.start(async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.replyWithHTML(mainMenuMessage, getMainMenu());
    });
  });

  bot.help(async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.replyWithHTML(
        "Используйте меню ниже: об уроках, задать вопрос или связаться с преподавателем.",
        getMainMenu()
      );
    });
  });
}
