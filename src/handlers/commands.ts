import type { Context } from "telegraf";
import { getVisibleSectionIds, getSectionLabel } from "../content/loader";
import { getMainMenu, mainMenuMessage } from "../menus/main.menu";
import { withErrorHandling } from "../middleware/errorHandler";
import { escapeForTelegramHtml } from "../utils/html";

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
      const sectionIds = getVisibleSectionIds();
      const sectionList = sectionIds
        .map((id) => {
          const label = getSectionLabel(id);
          return `• <b>${escapeForTelegramHtml(label)}</b>`;
        })
        .join("\n");
      const helpText =
        "👋 <b>Здравствуйте!</b>\n\n" +
        "Это бот для тех, кто интересуется занятиями по вокалу и фортепиано. " +
        "Здесь можно узнать о формате уроков, стоимости и ответы на частые вопросы.\n\n" +
        "<b>Что есть в боте:</b>\n" +
        (sectionList ? sectionList + "\n\n" : "\n") +
        "Выберите пункт в меню ниже 👇";
      await ctx.replyWithHTML(helpText, getMainMenu());
    });
  });
}
