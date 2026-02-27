import type { Context } from "telegraf";
import { Markup } from "telegraf";
import { env } from "../config/env";
import { loadAdmins, isAdmin, addAdmin, hasAnyAdmin } from "../config/admins";
import {
  getLesson,
  getFaq,
  setSavedLessonContent,
  setSavedFaqContent,
  setSavedLessonLabel,
  setSavedFaqLabel,
  getAllLessonKeys,
  getAllFaqKeys,
  getLessonLabel,
  getFaqLabel,
  addCustomLesson,
  addCustomFaq,
  type LessonKey,
  type FaqKey,
} from "../content/loader";
import { getState, clearState, setState } from "../state/userState";
import { withErrorHandling } from "../middleware/errorHandler";
import { stripHtml } from "../utils/html";
import { setCommandsForNewAdmin } from "../botCommands";

const ADM_MAIN = "adm_main";
const ADM_LESSONS = "adm_lessons";
const ADM_FAQ = "adm_faq";
const ADM_ADD_LESSON = "adm_add_lesson";
const ADM_ADD_FAQ = "adm_add_faq";
const ADM_LESSON_PREFIX = "adm_lesson:";
const ADM_LESSON_SEL_PREFIX = "adm_lesson_sel:";
const ADM_LESSON_LABEL_PREFIX = "adm_lesson_label:";
const ADM_FAQ_PREFIX = "adm_faq:";
const ADM_FAQ_SEL_PREFIX = "adm_faq_sel:";
const ADM_FAQ_LABEL_PREFIX = "adm_faq_label:";
const ADM_FAQ_ANS_PREFIX = "adm_faq_ans:";
const MAX_PREVIEW_LEN = 2800; // leave room for instruction (Telegram limit 4096)


function canUseAdmin(ctx: Context): boolean {
  const id = ctx.from?.id?.toString();
  return id !== undefined && isAdmin(id);
}

function truncateForPreview(text: string): string {
  const plain = stripHtml(text);
  if (plain.length <= MAX_PREVIEW_LEN) return plain;
  return plain.slice(0, MAX_PREVIEW_LEN) + "\n\n... (текст обрезан)";
}

function getAdminMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📝 Редактировать «Об уроках»", ADM_LESSONS)],
    [Markup.button.callback("❓ Редактировать «Задать вопрос»", ADM_FAQ)],
  ]);
}

function getAdminLessonsMenu() {
  const keys = getAllLessonKeys();
  const buttons = keys.map((key) =>
    Markup.button.callback(getLessonLabel(key), `${ADM_LESSON_SEL_PREFIX}${key}`)
  );
  return Markup.inlineKeyboard([
    ...buttons.map((b) => [b]),
    [Markup.button.callback("➕ Добавить раздел", ADM_ADD_LESSON)],
    [Markup.button.callback("◀️ Назад", ADM_MAIN)],
  ]);
}

function getAdminFaqMenu() {
  const keys = getAllFaqKeys();
  const buttons = keys.map((key) =>
    Markup.button.callback(getFaqLabel(key), `${ADM_FAQ_SEL_PREFIX}${key}`)
  );
  return Markup.inlineKeyboard([
    ...buttons.map((b) => [b]),
    [Markup.button.callback("➕ Добавить вопрос", ADM_ADD_FAQ)],
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

  bot.action(new RegExp(`^${ADM_LESSON_SEL_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_LESSON_SEL_PREFIX.length);
    if (!getAllLessonKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const label = getLessonLabel(key);
      await ctx.editMessageText(`Раздел «${label}». Что редактировать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📝 Редактировать название", `${ADM_LESSON_LABEL_PREFIX}${key}`)],
          [Markup.button.callback("📄 Редактировать текст", `${ADM_LESSON_PREFIX}${key}`)],
          [Markup.button.callback("◀️ Назад", ADM_LESSONS)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_LESSON_LABEL_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_LESSON_LABEL_PREFIX.length);
    if (!getAllLessonKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_lesson_label", key });
      const currentLabel = getLessonLabel(key);
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новое <b>название раздела</b> (только текст).\n\nТекущее название — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(currentLabel);
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
    if (!getAllLessonKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_lesson", key });
      const label = getLessonLabel(key);
      const current = getLesson(key as LessonKey);
      const plainForCopy = truncateForPreview(current);
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новый текст для раздела «${label}» (только текст, без разметки).\n\nТекущий текст — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(plainForCopy);
    });
  });

  bot.action(ADM_ADD_LESSON, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_new_lesson_label" });
      await ctx.editMessageText(
        "Отправьте в следующем сообщении <b>название раздела</b> (например: Расписание). Затем отправьте текст раздела.",
        { parse_mode: "HTML" }
      );
    });
  });

  bot.action(ADM_ADD_FAQ, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_new_faq_label" });
      await ctx.editMessageText(
        "Отправьте в следующем сообщении <b>текст вопроса</b> (как его увидят пользователи). Затем отправьте текст ответа.",
        { parse_mode: "HTML" }
      );
    });
  });

  bot.action(new RegExp(`^${ADM_FAQ_SEL_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_FAQ_SEL_PREFIX.length);
    if (!getAllFaqKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const label = getFaqLabel(key);
      await ctx.editMessageText(`Вопрос «${label}». Что редактировать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📝 Редактировать формулировку вопроса", `${ADM_FAQ_LABEL_PREFIX}${key}`)],
          [Markup.button.callback("📄 Редактировать ответ", `${ADM_FAQ_ANS_PREFIX}${key}`)],
          [Markup.button.callback("◀️ Назад", ADM_FAQ)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_FAQ_LABEL_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_FAQ_LABEL_PREFIX.length);
    if (!getAllFaqKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_faq_label", key });
      const currentLabel = getFaqLabel(key);
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новый текст <b>вопроса</b> (как его увидят пользователи). Только текст.\n\nТекущая формулировка — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(currentLabel);
    });
  });

  bot.action(new RegExp(`^(${ADM_FAQ_PREFIX}|${ADM_FAQ_ANS_PREFIX})`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.startsWith(ADM_FAQ_ANS_PREFIX)
      ? data.slice(ADM_FAQ_ANS_PREFIX.length)
      : data.slice(ADM_FAQ_PREFIX.length);
    if (!getAllFaqKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_faq", key });
      const label = getFaqLabel(key);
      const current = getFaq(key as FaqKey);
      const plainForCopy = truncateForPreview(current);
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новый текст для ответа «${label}» (только текст, без разметки).\n\nТекущий текст — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(plainForCopy);
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
      if (!key || !getAllLessonKeys().includes(key)) {
        await ctx.reply("Использование: /edit_lesson <key>\nКлючи: " + getAllLessonKeys().join(", "));
        return;
      }
      setState(ctx.from!.id, { type: "awaiting_edit_lesson", key });
      await ctx.reply(`Отправьте новый текст для раздела «${getLessonLabel(key)}» (только текст, без разметки).`);
    });
  });

  bot.command("edit_faq", async (ctx) => {
    if (!canUseAdmin(ctx)) return;
    await withErrorHandling(ctx, async () => {
      const key = ctx.message && "text" in ctx.message ? ctx.message.text?.split(/\s+/)[1] : undefined;
      if (!key || !getAllFaqKeys().includes(key)) {
        await ctx.reply("Использование: /edit_faq <key>\nКлючи: " + getAllFaqKeys().join(", "));
        return;
      }
      setState(ctx.from!.id, { type: "awaiting_edit_faq", key });
      await ctx.reply(`Отправьте новый текст для ответа «${getFaqLabel(key)}» (только текст, без разметки).`);
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
    await setSavedLessonContent(state.key, stripHtml(text));
    clearState(userId);
    const label = getLessonLabel(state.key);
    await reply(`Раздел «${label}» обновлён.`);
    return true;
  }
  if (state.type === "awaiting_edit_lesson_label") {
    await setSavedLessonLabel(state.key, stripHtml(text));
    clearState(userId);
    await reply(`Название раздела обновлено.`);
    return true;
  }
  if (state.type === "awaiting_edit_faq") {
    await setSavedFaqContent(state.key, stripHtml(text));
    clearState(userId);
    const label = getFaqLabel(state.key);
    await reply(`Ответ «${label}» обновлён.`);
    return true;
  }
  if (state.type === "awaiting_edit_faq_label") {
    await setSavedFaqLabel(state.key, stripHtml(text));
    clearState(userId);
    await reply(`Формулировка вопроса обновлена.`);
    return true;
  }
  if (state.type === "awaiting_new_lesson_label") {
    setState(userId, { type: "awaiting_new_lesson_content", label: text.trim() });
    await reply(`Название раздела: «${text.trim()}». Теперь отправьте текст раздела.`);
    return true;
  }
  if (state.type === "awaiting_new_lesson_content") {
    const key = await addCustomLesson(state.label, stripHtml(text));
    clearState(userId);
    await reply(`Раздел «${state.label}» добавлен (ключ: ${key}).`);
    return true;
  }
  if (state.type === "awaiting_new_faq_label") {
    setState(userId, { type: "awaiting_new_faq_content", label: text.trim() });
    await reply(`Вопрос: «${text.trim()}». Теперь отправьте текст ответа.`);
    return true;
  }
  if (state.type === "awaiting_new_faq_content") {
    const key = await addCustomFaq(state.label, stripHtml(text));
    clearState(userId);
    await reply(`Вопрос «${state.label}» добавлен (ключ: ${key}).`);
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
    await addAdmin(num);
    await setCommandsForNewAdmin(num);
    await reply(`Пользователь ${num} добавлен в админы.`);
    return true;
  }
  return false;
}
