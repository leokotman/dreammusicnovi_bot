/**
 * Admin lessons (Об уроках) actions.
 */

import { Markup } from "telegraf";
import type { AdminBot } from "./types";
import {
  getLesson,
  getAllLessonKeys,
  getLessonLabel,
  getSectionLabel,
  addHiddenLessonKey,
  removeCustomLesson,
  isLessonKeyFixed,
} from "../../../content/loader";
import type { LessonKey } from "../../../content/loader";
import { setState } from "../../../state/userState";
import { withErrorHandling } from "../../../middleware/errorHandler";
import * as C from "../constants";
import * as M from "../menus";

export function registerAdminLessons(bot: AdminBot): void {
  bot.action(C.ADM_LESSONS, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const sectionLabel = getSectionLabel("lessons");
      await ctx.editMessageText(`<b>Темы раздела «${sectionLabel}»</b>\n\nВыберите тему для редактирования:`, {
        parse_mode: "HTML",
        ...M.getAdminLessonsMenu(),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_LESSON_SEL_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_LESSON_SEL_PREFIX.length);
    if (!getAllLessonKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const label = getLessonLabel(key);
      await ctx.editMessageText(`Раздел «${label}». Что редактировать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✏️ Название", `${C.ADM_LESSON_LABEL_PREFIX}${key}`)],
          [Markup.button.callback("📄 Текст", `${C.ADM_LESSON_PREFIX}${key}`)],
          [Markup.button.callback("🗑 Удалить", `${C.ADM_DEL_LESSON_PREFIX}${key}`)],
          [Markup.button.callback("◀️ Назад", C.ADM_LESSONS)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_DEL_LESSON_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_DEL_LESSON_PREFIX.length);
    if (!getAllLessonKeys().includes(key)) return;
    const label = getLessonLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить раздел «${label}»? Он исчезнет из списка тем в «Об уроках».`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${C.ADM_CONFIRM_DEL_LESSON_PREFIX}${key}`)],
            [Markup.button.callback("Нет, оставляем", C.ADM_LESSONS)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${C.ADM_CONFIRM_DEL_LESSON_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_CONFIRM_DEL_LESSON_PREFIX.length);
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
        ...M.getAdminLessonsMenu(),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_LESSON_LABEL_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_LESSON_LABEL_PREFIX.length);
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

  bot.action(new RegExp(`^${C.ADM_LESSON_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_LESSON_PREFIX.length);
    if (!getAllLessonKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_lesson", key });
      const label = getLessonLabel(key);
      const current = getLesson(key as LessonKey);
      const plainForCopy = M.truncateForPreview(current);
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новый текст для раздела «${label}» (только текст, без разметки).\n\nТекущий текст — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(plainForCopy);
    });
  });

  bot.action(C.ADM_ADD_LESSON, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
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
}
