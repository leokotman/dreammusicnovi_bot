import type { Context } from "telegraf";
import { getSectionLabel } from "../content/loader";
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
      const lessonsLabel = getSectionLabel("lessons");
      const askLabel = getSectionLabel("ask");
      const contactLabel = getSectionLabel("contact");
      const helpText =
        "👋 <b>Здравствуйте!</b>\n\n" +
        "Это бот для тех, кто интересуется занятиями по вокалу и фортепиано. " +
        "Здесь можно узнать о формате уроков, стоимости и ответы на частые вопросы.\n\n" +
        "<b>Что есть в боте:</b>\n" +
        `• <b>${lessonsLabel}</b> — стоимость, как проходят занятия, вокал, фортепиано, упражнения.\n` +
        `• <b>${askLabel}</b> — готовые ответы на частые вопросы или отправить свой вопрос преподавателю.\n` +
        `• <b>${contactLabel}</b> — ссылки на Telegram, Instagram и email.\n\n` +
        "Выберите пункт в меню ниже 👇";
      await ctx.replyWithHTML(helpText, getMainMenu());
    });
  });
}
