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
  setSavedMainSectionLabel,
  getAllLessonKeys,
  getAllFaqKeys,
  getLessonLabel,
  getFaqLabel,
  getMainSectionLabel,
  getCustomMainSections,
  getCustomMainSectionSubIds,
  getCustomMainSectionSubItem,
  isCustomSectionNested,
  MAIN_SECTION_IDS,
  isLessonKeyFixed,
  isFaqKeyFixed,
  addCustomLesson,
  addCustomFaq,
  addCustomMainSection,
  createCustomMainSectionNested,
  addCustomMainSectionSubItem,
  removeCustomMainSection,
  removeCustomMainSectionSubItem,
  setSavedCustomMainSectionLabel,
  addHiddenLessonKey,
  removeCustomLesson,
  addHiddenFaqKey,
  removeCustomFaq,
  addHiddenMainSectionId,
  removeHiddenMainSectionId,
  removeHiddenLessonKey,
  removeHiddenFaqKey,
  getHiddenMainSectionIds,
  getHiddenLessonKeys,
  getHiddenFaqKeys,
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
const ADM_MAIN_MENU = "adm_main_menu";
const ADM_MAIN_SECTION_PREFIX = "adm_main_sec:";
const ADM_MAIN_SECTION_EDIT_PREFIX = "adm_main_sec_edit:";
const ADM_ADD_MAIN_SECTION = "adm_add_main_section";
const ADM_NEW_SEC_FLAT = "adm_new_sec_flat";
const ADM_NEW_SEC_NESTED = "adm_new_sec_nested";
const ADM_NEW_SEC_DONE_PREFIX = "adm_new_sec_done:";
const ADM_CUSTOM_SEC_PREFIX = "adm_custom_sec:";
const ADM_DEL_SEC_PREFIX = "adm_del_sec:";
const ADM_CONFIRM_DEL_SEC_PREFIX = "adm_confirm_del_sec:";
const ADM_DEL_LESSON_PREFIX = "adm_del_lesson:";
const ADM_CONFIRM_DEL_LESSON_PREFIX = "adm_confirm_del_lesson:";
const ADM_DEL_FAQ_PREFIX = "adm_del_faq:";
const ADM_CONFIRM_DEL_FAQ_PREFIX = "adm_confirm_del_faq:";
const ADM_DEL_MAIN_SEC_PREFIX = "adm_del_main_sec:";
const ADM_CONFIRM_DEL_MAIN_SEC_PREFIX = "adm_confirm_del_main_sec:";
const ADM_CUSTOM_SUB_PREFIX = "adm_custom_sub:";
const ADM_DEL_CUSTOM_SUB_PREFIX = "adm_del_custom_sub:";
const ADM_CONFIRM_DEL_CUSTOM_SUB_PREFIX = "adm_confirm_del_custom_sub:";
const ADM_RESTORE = "adm_restore";
const ADM_RESTORE_MAIN_PREFIX = "adm_restore_main:";
const ADM_RESTORE_LESSON_PREFIX = "adm_restore_lesson:";
const ADM_RESTORE_FAQ_PREFIX = "adm_restore_faq:";
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
    [Markup.button.callback("📋 Редактировать главное меню", ADM_MAIN_MENU)],
    [Markup.button.callback("📝 Редактировать «Об уроках»", ADM_LESSONS)],
    [Markup.button.callback("❓ Редактировать «Задать вопрос»", ADM_FAQ)],
    [Markup.button.callback("↩️ Восстановить удалённые разделы", ADM_RESTORE)],
  ]);
}

function getAdminRestoreMenu() {
  const hiddenMain = getHiddenMainSectionIds();
  const hiddenLessons = getHiddenLessonKeys();
  const hiddenFaq = getHiddenFaqKeys();
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
  hiddenMain.forEach((id) => {
    const label = getMainSectionLabel(id);
    buttons.push([Markup.button.callback(`📌 ${label} (главное меню)`, `${ADM_RESTORE_MAIN_PREFIX}${id}`)]);
  });
  const lessonsLabel = getMainSectionLabel("lessons");
  hiddenLessons.forEach((key) => {
    const label = getLessonLabel(key);
    buttons.push([Markup.button.callback(`📝 ${label} (${lessonsLabel})`, `${ADM_RESTORE_LESSON_PREFIX}${key}`)]);
  });
  const askLabel = getMainSectionLabel("ask");
  hiddenFaq.forEach((key) => {
    const label = getFaqLabel(key);
    buttons.push([Markup.button.callback(`❓ ${label} (${askLabel})`, `${ADM_RESTORE_FAQ_PREFIX}${key}`)]);
  });
  buttons.push([Markup.button.callback("◀️ Назад", ADM_MAIN)]);
  return Markup.inlineKeyboard(buttons);
}

function getAdminRestoreMessage(): string {
  const hiddenMain = getHiddenMainSectionIds();
  const hiddenLessons = getHiddenLessonKeys();
  const hiddenFaq = getHiddenFaqKeys();
  const total = hiddenMain.length + hiddenLessons.length + hiddenFaq.length;
  if (total === 0) {
    return "Нет удалённых разделов для восстановления.";
  }
  return "<b>Восстановить удалённые разделы</b>\n\nВыберите раздел или подраздел для восстановления:";
}

function getAdminMainMenuSubmenu() {
  const sectionButtons = MAIN_SECTION_IDS.map((id) =>
    Markup.button.callback(getMainSectionLabel(id), `${ADM_MAIN_SECTION_PREFIX}${id}`)
  );
  const customSections = getCustomMainSections();
  const customButtons = customSections.map((s) =>
    Markup.button.callback("📌 " + s.label, `${ADM_CUSTOM_SEC_PREFIX}${s.key}`)
  );
  return Markup.inlineKeyboard([
    ...sectionButtons.map((b) => [b]),
    ...customButtons.map((b) => [b]),
    [Markup.button.callback("➕ Добавить раздел в главное меню", ADM_ADD_MAIN_SECTION)],
    [Markup.button.callback("◀️ Назад", ADM_MAIN)],
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

  bot.action(ADM_MAIN_MENU, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        "<b>Главное меню</b>\n\nРедактируйте названия пунктов или добавьте новый раздел:",
        {
          parse_mode: "HTML",
          ...getAdminMainMenuSubmenu(),
        }
      );
    });
  });

  bot.action(ADM_RESTORE, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...getAdminRestoreMenu(),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_RESTORE_MAIN_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const id = data.slice(ADM_RESTORE_MAIN_PREFIX.length);
    if (!MAIN_SECTION_IDS.includes(id as (typeof MAIN_SECTION_IDS)[number])) return;
    const label = getMainSectionLabel(id);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeHiddenMainSectionId(id);
      await ctx.editMessageText(getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...getAdminRestoreMenu(),
      });
      await ctx.reply(`Пункт «${label}» восстановлен в главное меню.`);
    });
  });

  bot.action(new RegExp(`^${ADM_RESTORE_LESSON_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_RESTORE_LESSON_PREFIX.length);
    const label = getLessonLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeHiddenLessonKey(key);
      await ctx.editMessageText(getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...getAdminRestoreMenu(),
      });
      await ctx.reply(`Раздел «${label}» восстановлен в список тем.`);
    });
  });

  bot.action(new RegExp(`^${ADM_RESTORE_FAQ_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_RESTORE_FAQ_PREFIX.length);
    const label = getFaqLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeHiddenFaqKey(key);
      await ctx.editMessageText(getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...getAdminRestoreMenu(),
      });
      await ctx.reply(`Вопрос «${label}» восстановлен в список.`);
    });
  });

  bot.action(new RegExp(`^${ADM_MAIN_SECTION_PREFIX}[^:]+$`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_MAIN_SECTION_PREFIX.length);
    if (!MAIN_SECTION_IDS.includes(key as (typeof MAIN_SECTION_IDS)[number])) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const label = getMainSectionLabel(key);
      await ctx.editMessageText(`Пункт «${label}». Что сделать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✏️ Редактировать название", `${ADM_MAIN_SECTION_EDIT_PREFIX}${key}`)],
          [Markup.button.callback("🗑 Удалить из главного меню", `${ADM_DEL_MAIN_SEC_PREFIX}${key}`)],
          [Markup.button.callback("◀️ Назад", ADM_MAIN_MENU)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_MAIN_SECTION_EDIT_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_MAIN_SECTION_EDIT_PREFIX.length);
    if (!MAIN_SECTION_IDS.includes(key as (typeof MAIN_SECTION_IDS)[number])) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_main_section_label", key });
      const currentLabel = getMainSectionLabel(key);
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новое <b>название пункта главного меню</b> (только текст).\n\nТекущее название — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(currentLabel);
    });
  });

  bot.action(new RegExp(`^${ADM_DEL_MAIN_SEC_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const id = data.slice(ADM_DEL_MAIN_SEC_PREFIX.length);
    if (!MAIN_SECTION_IDS.includes(id as (typeof MAIN_SECTION_IDS)[number])) return;
    const label = getMainSectionLabel(id);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить пункт «${label}» из главного меню? Пользователи больше не увидят его в меню.`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${ADM_CONFIRM_DEL_MAIN_SEC_PREFIX}${id}`)],
            [Markup.button.callback("Нет, оставляем", ADM_MAIN_MENU)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${ADM_CONFIRM_DEL_MAIN_SEC_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const id = data.slice(ADM_CONFIRM_DEL_MAIN_SEC_PREFIX.length);
    if (!MAIN_SECTION_IDS.includes(id as (typeof MAIN_SECTION_IDS)[number])) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await addHiddenMainSectionId(id);
      const label = getMainSectionLabel(id);
      await ctx.editMessageText(
        `<b>Главное меню</b>\n\nПункт «${label}» удалён из главного меню.`,
        {
          parse_mode: "HTML",
          ...getAdminMainMenuSubmenu(),
        }
      );
    });
  });

  bot.action(new RegExp(`^${ADM_CUSTOM_SEC_PREFIX}label:`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(`${ADM_CUSTOM_SEC_PREFIX}label:`.length);
    const sections = getCustomMainSections();
    const section = sections.find((s) => s.key === sectionKey);
    if (!section) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_custom_section_label", sectionKey });
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новое <b>название раздела</b> (только текст).\n\nТекущее название — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(section.label);
    });
  });

  bot.action(new RegExp(`^${ADM_CUSTOM_SEC_PREFIX}(?!label:).+`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(ADM_CUSTOM_SEC_PREFIX.length);
    const sections = getCustomMainSections();
    const section = sections.find((s) => s.key === sectionKey);
    if (!section) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const buttons: ReturnType<typeof Markup.button.callback>[][] = [
        [Markup.button.callback("✏️ Редактировать название", `${ADM_CUSTOM_SEC_PREFIX}label:${sectionKey}`)],
        [Markup.button.callback("🗑 Удалить раздел", `${ADM_DEL_SEC_PREFIX}${sectionKey}`)],
      ];
      if (isCustomSectionNested(sectionKey)) {
        buttons.unshift([Markup.button.callback("📋 Подпункты", `${ADM_CUSTOM_SUB_PREFIX}list:${sectionKey}`)]);
      }
      buttons.push([Markup.button.callback("◀️ Назад", ADM_MAIN_MENU)]);
      await ctx.editMessageText(`Раздел «${section.label}». Что сделать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(buttons),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_CUSTOM_SUB_PREFIX}list:`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(`${ADM_CUSTOM_SUB_PREFIX}list:`.length);
    const sections = getCustomMainSections();
    const section = sections.find((s) => s.key === sectionKey);
    if (!section || !isCustomSectionNested(sectionKey)) return;
    const subIds = getCustomMainSectionSubIds(sectionKey);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const subButtons = subIds.map((itemKey) => {
        const item = getCustomMainSectionSubItem(sectionKey, itemKey);
        const label = item?.label ?? itemKey;
        return [Markup.button.callback(label, `${ADM_CUSTOM_SUB_PREFIX}${sectionKey}:${itemKey}`)];
      });
      const keyboard = [
        ...subButtons,
        [Markup.button.callback("◀️ Назад", `${ADM_CUSTOM_SEC_PREFIX}${sectionKey}`)],
      ];
      await ctx.editMessageText(`Подпункты раздела «${section.label}»:`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(keyboard),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_CUSTOM_SUB_PREFIX}[^l]`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const rest = data.slice(ADM_CUSTOM_SUB_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon === -1) return;
    const sectionKey = rest.slice(0, colon);
    const itemKey = rest.slice(colon + 1);
    const item = getCustomMainSectionSubItem(sectionKey, itemKey);
    if (!item) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(`Подпункт «${item.label}». Что сделать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🗑 Удалить подпункт", `${ADM_DEL_CUSTOM_SUB_PREFIX}${sectionKey}:${itemKey}`)],
          [Markup.button.callback("◀️ Назад", `${ADM_CUSTOM_SUB_PREFIX}list:${sectionKey}`)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_DEL_CUSTOM_SUB_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const rest = data.slice(ADM_DEL_CUSTOM_SUB_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon === -1) return;
    const sectionKey = rest.slice(0, colon);
    const itemKey = rest.slice(colon + 1);
    const item = getCustomMainSectionSubItem(sectionKey, itemKey);
    if (!item) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить подпункт «${item.label}»?`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${ADM_CONFIRM_DEL_CUSTOM_SUB_PREFIX}${sectionKey}:${itemKey}`)],
            [Markup.button.callback("Нет, оставляем", `${ADM_CUSTOM_SUB_PREFIX}${sectionKey}:${itemKey}`)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${ADM_CONFIRM_DEL_CUSTOM_SUB_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const rest = data.slice(ADM_CONFIRM_DEL_CUSTOM_SUB_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon === -1) return;
    const sectionKey = rest.slice(0, colon);
    const itemKey = rest.slice(colon + 1);
    const sections = getCustomMainSections();
    const section = sections.find((s) => s.key === sectionKey);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeCustomMainSectionSubItem(sectionKey, itemKey);
      const label = section?.label ?? sectionKey;
      await ctx.editMessageText(`Подпункт удалён.`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ К подпунктам", `${ADM_CUSTOM_SUB_PREFIX}list:${sectionKey}`)]]),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_DEL_SEC_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(ADM_DEL_SEC_PREFIX.length);
    const sections = getCustomMainSections();
    const section = sections.find((s) => s.key === sectionKey);
    if (!section) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        "Вы уверены, что хотите удалить целиком эту секцию меню? Все дочерние секции с описаниями будут также удалены.",
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${ADM_CONFIRM_DEL_SEC_PREFIX}${sectionKey}`)],
            [Markup.button.callback("Нет, оставляем", ADM_MAIN_MENU)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${ADM_CONFIRM_DEL_SEC_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(ADM_CONFIRM_DEL_SEC_PREFIX.length);
    const sections = getCustomMainSections();
    const section = sections.find((s) => s.key === sectionKey);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeCustomMainSection(sectionKey);
      const label = section?.label ?? sectionKey;
      await ctx.editMessageText(
        `<b>Главное меню</b>\n\nРаздел «${label}» удалён.`,
        {
          parse_mode: "HTML",
          ...getAdminMainMenuSubmenu(),
        }
      );
    });
  });

  bot.action(ADM_ADD_MAIN_SECTION, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_new_main_section_label" });
      await ctx.editMessageText(
        "Отправьте в следующем сообщении <b>название нового раздела</b> (как он будет отображаться в главном меню). Затем выберите: один блок текста или раздел с подпунктами.",
        { parse_mode: "HTML" }
      );
    });
  });

  bot.action(ADM_NEW_SEC_FLAT, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const state = getState(ctx.from!.id);
    if (state?.type !== "awaiting_new_main_section_choice") return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_new_main_section_content", label: state.label });
      await ctx.editMessageText("Отправьте текст раздела (один блок).");
    });
  });

  bot.action(ADM_NEW_SEC_NESTED, async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const state = getState(ctx.from!.id);
    if (state?.type !== "awaiting_new_main_section_choice") return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const sectionKey = await createCustomMainSectionNested(state.label);
      setState(ctx.from!.id, { type: "awaiting_new_main_section_sub_label", sectionKey });
      await ctx.editMessageText(
        "Отправьте название первого подпункта (или нажмите Готово, чтобы завершить без подпунктов).",
        Markup.inlineKeyboard([[Markup.button.callback("✅ Готово", `${ADM_NEW_SEC_DONE_PREFIX}${sectionKey}`)]])
      );
    });
  });

  bot.action(new RegExp(`^${ADM_NEW_SEC_DONE_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(ADM_NEW_SEC_DONE_PREFIX.length);
    const state = getState(ctx.from!.id);
    if (state?.type !== "awaiting_new_main_section_sub_more" && state?.type !== "awaiting_new_main_section_sub_label") return;
    if (state.sectionKey !== sectionKey) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      clearState(ctx.from!.id);
      const sections = getCustomMainSections();
      const section = sections.find((s) => s.key === sectionKey);
      const label = section?.label ?? sectionKey;
      const count = getCustomMainSectionSubIds(sectionKey).length;
      await ctx.editMessageText(
        `Раздел «${label}» добавлен в главное меню с ${count} подпунктом(ами) (ключ: ${sectionKey}).`
      );
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
          [Markup.button.callback("🗑 Удалить раздел", `${ADM_DEL_LESSON_PREFIX}${key}`)],
          [Markup.button.callback("◀️ Назад", ADM_LESSONS)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_DEL_LESSON_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_DEL_LESSON_PREFIX.length);
    if (!getAllLessonKeys().includes(key)) return;
    const label = getLessonLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить раздел «${label}»? Он исчезнет из списка тем в «Об уроках».`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${ADM_CONFIRM_DEL_LESSON_PREFIX}${key}`)],
            [Markup.button.callback("Нет, оставляем", ADM_LESSONS)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${ADM_CONFIRM_DEL_LESSON_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_CONFIRM_DEL_LESSON_PREFIX.length);
    const label = getLessonLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      if (isLessonKeyFixed(key)) {
        await addHiddenLessonKey(key);
      } else {
        await removeCustomLesson(key);
      }
      await ctx.editMessageText(`Раздел «${label}» удалён из списка.`, {
        parse_mode: "HTML",
        ...getAdminLessonsMenu(),
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
          [Markup.button.callback("🗑 Удалить вопрос", `${ADM_DEL_FAQ_PREFIX}${key}`)],
          [Markup.button.callback("◀️ Назад", ADM_FAQ)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${ADM_DEL_FAQ_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_DEL_FAQ_PREFIX.length);
    if (!getAllFaqKeys().includes(key)) return;
    const label = getFaqLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить вопрос «${label}»? Он исчезнет из списка в «Задать вопрос».`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${ADM_CONFIRM_DEL_FAQ_PREFIX}${key}`)],
            [Markup.button.callback("Нет, оставляем", ADM_FAQ)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${ADM_CONFIRM_DEL_FAQ_PREFIX}`), async (ctx) => {
    if (!canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(ADM_CONFIRM_DEL_FAQ_PREFIX.length);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      if (isFaqKeyFixed(key)) {
        await addHiddenFaqKey(key);
      } else {
        await removeCustomFaq(key);
      }
      await ctx.editMessageText("Вопрос удалён из списка.", {
        parse_mode: "HTML",
        ...getAdminFaqMenu(),
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

/** Handle admin's next message: edit content or add_admin (called from text handler). reply can accept optional reply_markup. */
export async function handleAdminEdit(
  userId: number,
  text: string,
  reply: (msg: string, opts?: { reply_markup?: object }) => Promise<unknown>
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
  if (state.type === "awaiting_edit_main_section_label") {
    await setSavedMainSectionLabel(state.key, stripHtml(text));
    clearState(userId);
    await reply(`Название пункта главного меню обновлено.`);
    return true;
  }
  if (state.type === "awaiting_edit_custom_section_label") {
    await setSavedCustomMainSectionLabel(state.sectionKey, stripHtml(text));
    clearState(userId);
    await reply(`Название раздела обновлено.`);
    return true;
  }
  if (state.type === "awaiting_new_main_section_label") {
    setState(userId, { type: "awaiting_new_main_section_choice", label: text.trim() });
    await reply(
      `Название раздела: «${text.trim()}». Один блок текста или раздел с подпунктами?`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Один текст", ADM_NEW_SEC_FLAT)],
        [Markup.button.callback("С подпунктами", ADM_NEW_SEC_NESTED)],
      ])
    );
    return true;
  }
  if (state.type === "awaiting_new_main_section_content") {
    const key = await addCustomMainSection(state.label, stripHtml(text));
    clearState(userId);
    await reply(`Раздел «${state.label}» добавлен в главное меню (ключ: ${key}).`);
    return true;
  }
  if (state.type === "awaiting_new_main_section_sub_label") {
    setState(userId, { type: "awaiting_new_main_section_sub_content", sectionKey: state.sectionKey, itemLabel: text.trim() });
    await reply(`Отправьте текст подпункта «${text.trim()}».`);
    return true;
  }
  if (state.type === "awaiting_new_main_section_sub_content") {
    await addCustomMainSectionSubItem(state.sectionKey, state.itemLabel, stripHtml(text));
    setState(userId, { type: "awaiting_new_main_section_sub_more", sectionKey: state.sectionKey });
    await reply(
      "Подпункт добавлен. Отправьте название следующего подпункта или нажмите Готово.",
      Markup.inlineKeyboard([[Markup.button.callback("✅ Готово", `${ADM_NEW_SEC_DONE_PREFIX}${state.sectionKey}`)]])
    );
    return true;
  }
  if (state.type === "awaiting_new_main_section_sub_more") {
    setState(userId, { type: "awaiting_new_main_section_sub_content", sectionKey: state.sectionKey, itemLabel: text.trim() });
    await reply(`Отправьте текст подпункта «${text.trim()}».`);
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
