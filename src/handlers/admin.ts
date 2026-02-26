import type { Context } from "telegraf";
import { Markup } from "telegraf";
import { env } from "../config/env";
import { loadAdmins, isAdmin, addAdmin, hasAnyAdmin } from "../config/admins";
import {
  LESSON_KEYS,
  FAQ_KEYS,
  getLesson,
  getFaq,
  setLessonOverride,
  setFaqOverride,
  type LessonKey,
  type FaqKey,
} from "../content/loader";
import { getState, clearState, setState } from "../state/userState";
import { withErrorHandling } from "../middleware/errorHandler";
import { getLessonLabel } from "../menus/lessons.menu";
import { FAQ_LABELS } from "../menus/ask.menu";

const ADM_MAIN = "adm_main";
const ADM_LESSONS = "adm_lessons";
const ADM_FAQ = "adm_faq";
const ADM_LESSON_PREFIX = "adm_lesson:";
const ADM_FAQ_PREFIX = "adm_faq:";
const MAX_PREVIEW_LEN = 2800; // leave room for instruction + "Текущий текст" (Telegram limit 4096)

function canUseAdmin(ctx: Context): boolean {
  const id = ctx.from?.id?.toString();
  return id !== undefined && isAdmin(id);
}

function truncateForPreview(text: string): string {
  const plain = text.replace(/<[^>]+>/g, "").trim();
  if (plain.length <= MAX_PREVIEW_LEN) return text;
  return text.slice(0, MAX_PREVIEW_LEN) + "\n\n... (текст обрезан)";
}

function getAdminMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📝 Редактировать «Об уроках»", ADM_LESSONS)],
    [Markup.button.callback("❓ Редактировать «Задать вопрос»", ADM_FAQ)],
  ]);
}

function getAdminLessonsMenu() {
  const buttons = (LESSON_KEYS as readonly string[]).map((key) =>
    Markup.button.callback(getLessonLabel(key as LessonKey), `${ADM_LESSON_PREFIX}${key}`)
  );
  return Markup.inlineKeyboard([
    ...buttons.map((b) => [b]),
    [Markup.button.callback("◀️ Назад", ADM_MAIN)],
  ]);
}

function getAdminFaqMenu() {
  const buttons = (FAQ_KEYS as readonly string[]).map((key) =>
    Markup.button.callback(FAQ_LABELS[key as FaqKey], `${ADM_FAQ_PREFIX}${key}`)
  );
  return Markup.inlineKeyboard([
    ...buttons.map((b) => [b]),
    [Markup.button.callback("◀️ Назад", ADM_MAIN)],
  ]);
}

export function registerAdmin(bot: {
  command: (name: string, handler: (ctx: Context) => Promise<unknown>) => void;
  action: (pattern: string | RegExp, handler: (ctx: Context) => Promise<unknown>) => void;
}) {
  const envAdminIds = [
    env.TEACHER_USER_ID,
    env.DEV_ID,
    ...env.ADMIN_IDS,
  ].filter((id): id is string => typeof id === "string");
  loadAdmins(envAdminIds);
  if (!hasAnyAdmin()) return;

  // /admin — show clickable menu
  bot.command("admin", async (ctx) => {
    if (!canUseAdmin(ctx)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.replyWithHTML(
        "<b>Админ</b>\n\nВыберите, что редактировать:",
        getAdminMainMenu()
      );
    });
  });

  // Admin callbacks: only for admin users
  bot.action(ADM_MAIN, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText("<b>Админ</b>\n\nВыберите, что редактировать:", {
        parse_mode: "HTML",
        ...getAdminMainMenu(),
      });
    });
  });

  bot.action(ADM_LESSONS, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText("Выберите раздел для редактирования:", {
        parse_mode: "HTML",
        ...getAdminLessonsMenu(),
      });
    });
  });

  bot.action(ADM_FAQ, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText("Выберите ответ для редактирования:", {
        parse_mode: "HTML",
        ...getAdminFaqMenu(),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_LESSON_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_LESSON_PREFIX.length);
    if (!LESSON_KEYS.includes(key as LessonKey)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_lesson", key });
      const label = getLessonLabel(key as LessonKey);
      const current = getLesson(key as LessonKey);
      const preview = truncateForPreview(current);
      const msg =
        `Отправьте в следующем сообщении новый текст для раздела «${label}» (можно с HTML: <b>, <i>).\n\n` +
        `———\n<b>Текущий текст:</b>\n\n${preview}`;
      await ctx.editMessageText(msg, { parse_mode: "HTML" });
    });
  });

  bot.action(new RegExp(`^${ADM_FAQ_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_FAQ_PREFIX.length);
    if (!FAQ_KEYS.includes(key as FaqKey)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_faq", key });
      const label = FAQ_LABELS[key as FaqKey];
      const current = getFaq(key as FaqKey);
      const preview = truncateForPreview(current);
      const msg =
        `Отправьте в следующем сообщении новый текст для ответа «${label}» (можно с HTML: <b>, <i>).\n\n` +
        `———\n<b>Текущий текст:</b>\n\n${preview}`;
      await ctx.editMessageText(msg, { parse_mode: "HTML" });
    });
  });

  // Add admin via Telegram (no env/server edit)
  bot.command("add_admin", async (ctx) => {
    if (!canUseAdmin(ctx)) return;
    await withErrorHandling(ctx, async () => {
      setState(ctx.from!.id, { type: "awaiting_add_admin" });
      await ctx.reply(
        "Отправьте в следующем сообщении <b>user ID</b> (число) пользователя, которого нужно сделать админом. " +
          "Узнать ID можно через @userinfobot.",
        { parse_mode: "HTML" }
      );
    });
  });

  // Legacy text commands (optional; can be removed if you only want buttons)
  bot.command("edit_lesson", async (ctx) => {
    if (!canUseAdmin(ctx)) return;
    await withErrorHandling(ctx, async () => {
      const key = ctx.message && "text" in ctx.message ? ctx.message.text?.split(/\s+/)[1] : undefined;
      if (!key || !LESSON_KEYS.includes(key as LessonKey)) {
        await ctx.reply("Использование: /edit_lesson <key>\nКлючи: " + LESSON_KEYS.join(", "));
        return;
      }
      setState(ctx.from!.id, { type: "awaiting_edit_lesson", key });
      await ctx.reply(`Отправьте новый HTML-текст для раздела «${getLessonLabel(key as LessonKey)}».`);
    });
  });

  bot.command("edit_faq", async (ctx) => {
    if (!canUseAdmin(ctx)) return;
    await withErrorHandling(ctx, async () => {
      const key = ctx.message && "text" in ctx.message ? ctx.message.text?.split(/\s+/)[1] : undefined;
      if (!key || !FAQ_KEYS.includes(key as FaqKey)) {
        await ctx.reply("Использование: /edit_faq <key>\nКлючи: " + FAQ_KEYS.join(", "));
        return;
      }
      setState(ctx.from!.id, { type: "awaiting_edit_faq", key });
      await ctx.reply(`Отправьте новый HTML-текст для ответа «${FAQ_LABELS[key as FaqKey]}».`);
    });
  });
}

/** Handle admin's next message: edit content or add_admin (called from text handler) */
export async function handleAdminEdit(
  userId: number,
  text: string,
  reply: (msg: string) => Promise<unknown>
): Promise<boolean> {
  const state = getState(userId);
  if (!state) return false;
  if (state.type === "awaiting_edit_lesson") {
    setLessonOverride(state.key, text);
    clearState(userId);
    const label = getLessonLabel(state.key as LessonKey);
    await reply(`Раздел «${label}» обновлён.`);
    return true;
  }
  if (state.type === "awaiting_edit_faq") {
    setFaqOverride(state.key, text);
    clearState(userId);
    const label = FAQ_LABELS[state.key as FaqKey];
    await reply(`Ответ «${label}» обновлён.`);
    return true;
  }
  if (state.type === "awaiting_add_admin") {
    clearState(userId);
    const id = text.trim().replace(/\s+/g, "");
    const num = parseInt(id, 10);
    if (Number.isNaN(num) || num.toString() !== id) {
      await reply("Нужно отправить одно число (user ID). Попробуйте снова или отправьте /add_admin.");
      return true;
    }
    addAdmin(num);
    await reply(`Пользователь ${num} добавлен в админы.`);
    return true;
  }
  return false;
}
