import type { Context } from "telegraf";
import { Markup } from "telegraf";
import {
  getLesson,
  getFaq,
  getMainSectionLabel,
  getCustomMainSectionContent,
} from "../content/loader";
import { stripHtml, escapeForTelegramHtml } from "../utils/html";
import {
  getMainMenu,
  mainMenuMessage,
  MAIN,
  LESSONS,
  ASK,
  CONTACT,
  MAIN_CUSTOM_PREFIX,
} from "../menus/main.menu";
import {
  getLessonsMenu,
  getLessonsMenuForTopic,
  getLessonLabel,
  getLessonsMenuMessage,
  parseLessonCallback,
  LESSONS_BACK,
} from "../menus/lessons.menu";
import {
  getAskMenu,
  getAskMenuForTopic,
  getAskMenuMessage,
  parseFaqCallback,
  getFaqLabel,
  ASK_CUSTOM,
  ASK_BACK,
} from "../menus/ask.menu";
import { contact } from "../config/env";
import { setState } from "../state/userState";
import { withErrorHandling } from "../middleware/errorHandler";

export function registerCallbacks(bot: {
  action: (pattern: string | RegExp, fn: (ctx: Context) => Promise<unknown>) => void;
}) {
  bot.action(MAIN, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(mainMenuMessage, {
        parse_mode: "HTML",
        ...getMainMenu(),
      });
    });
  });

  bot.action(LESSONS, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(getLessonsMenuMessage(), {
        parse_mode: "HTML",
        ...getLessonsMenu(),
      });
    });
  });

  bot.action(/^lesson:/, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
      const data = cq && "data" in cq ? cq.data : undefined;
      if (!data) return;
      const key = parseLessonCallback(data);
      if (!key) {
        await ctx.answerCbQuery();
        return;
      }
      await ctx.answerCbQuery();
      const raw = getLesson(key);
      const content = escapeForTelegramHtml(stripHtml(raw));
      const breadcrumb = `🎶 ${getMainSectionLabel("lessons")} → ${getLessonLabel(key)}`;
      await ctx.editMessageText(`${breadcrumb}\n\n${content}`, {
        parse_mode: "HTML",
        ...getLessonsMenuForTopic(),
      });
    });
  });

  bot.action(LESSONS_BACK, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(getLessonsMenuMessage(), {
        parse_mode: "HTML",
        ...getLessonsMenu(),
      });
    });
  });

  // —— Задать вопрос (преопределённые + свой вопрос) ——
  bot.action(ASK, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(getAskMenuMessage(), {
        parse_mode: "HTML",
        ...getAskMenu(),
      });
    });
  });

  bot.action(/^faq:/, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
      const data = cq && "data" in cq ? cq.data : undefined;
      if (!data) return;
      const key = parseFaqCallback(data);
      if (!key) {
        await ctx.answerCbQuery();
        return;
      }
      await ctx.answerCbQuery();
      const raw = getFaq(key);
      const content = escapeForTelegramHtml(stripHtml(raw));
      const breadcrumb = `❓ ${getMainSectionLabel("ask")} → ${getFaqLabel(key)}`;
      await ctx.editMessageText(`${breadcrumb}\n\n${content}`, {
        parse_mode: "HTML",
        ...getAskMenuForTopic(),
      });
    });
  });

  bot.action(ASK_CUSTOM, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const userId = ctx.from?.id;
      if (userId) setState(userId, { type: "awaiting_question" });
      await ctx.editMessageText(
        "✏️ <b>Задать свой вопрос</b>\n\nОтправьте ваш вопрос в следующем сообщении. Преподаватель получит его и свяжется с вами.",
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Назад к меню", MAIN)]]),
        }
      );
    });
  });

  bot.action(ASK_BACK, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(getAskMenuMessage(), {
        parse_mode: "HTML",
        ...getAskMenu(),
      });
    });
  });

  bot.action(CONTACT, async (ctx) => {
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const telegramUrl = `https://t.me/${contact.telegramUsername}`;
      const emailText = `📧 <b>Email</b>\n${contact.email}`;
      const contactTitle = getMainSectionLabel("contact");
      await ctx.editMessageText(
        `👋 <b>${contactTitle}</b>\n\n` +
          `• <a href="${telegramUrl}">Telegram</a>\n` +
          `• <a href="${contact.instagramUrl}">Instagram</a>\n\n` +
          emailText,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Назад", MAIN)]]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${MAIN_CUSTOM_PREFIX}`), async (ctx) => {
    await withErrorHandling(ctx, async () => {
      const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
      const data = cq && "data" in cq ? cq.data : undefined;
      if (!data) return;
      const key = data.slice(MAIN_CUSTOM_PREFIX.length);
      const content = getCustomMainSectionContent(key);
      if (!content) {
        await ctx.answerCbQuery();
        return;
      }
      await ctx.answerCbQuery();
      const plain = escapeForTelegramHtml(stripHtml(content));
      await ctx.editMessageText(plain, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Назад", MAIN)]]),
      });
    });
  });
}
