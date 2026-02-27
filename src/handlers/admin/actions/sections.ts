/**
 * Admin main-menu section actions: section detail, edit label, delete.
 */

import { Markup } from "telegraf";
import type { AdminBot } from "./types";
import {
  getSectionLabel,
  getSections,
  getSectionSubIds,
  getSectionSubItem,
  isSectionNested,
  addHiddenSectionId,
  getHiddenSectionIds,
} from "../../../content/loader";
import { setState } from "../../../state/userState";
import { withErrorHandling } from "../../../middleware/errorHandler";
import * as C from "../constants";
import * as M from "../menus";

export function registerAdminSections(bot: AdminBot): void {
  bot.action(new RegExp(`^${C.ADM_SECTION_PREFIX}[^:]+$`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_SECTION_PREFIX.length);
    const label = getSectionLabel(key);
    const hidden = getHiddenSectionIds().includes(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const buttons: ReturnType<typeof Markup.button.callback>[][] = [
        [Markup.button.callback("✏️ Название", `${C.ADM_SECTION_EDIT_PREFIX}${key}`)],
        hidden
          ? [Markup.button.callback("↩️ Вернуть в меню", `${C.ADM_RESTORE_SECTION_PREFIX}${key}`)]
          : [Markup.button.callback("🗑 Удалить из меню", `${C.ADM_DEL_SECTION_PREFIX}${key}`)],
      ];
      if (key === "lessons") {
        buttons.unshift([Markup.button.callback("📝 Темы", C.ADM_LESSONS)]);
      } else if (key === "ask") {
        buttons.unshift([Markup.button.callback("❓ Вопросы", C.ADM_FAQ)]);
      } else if (isSectionNested(key)) {
        buttons.unshift([Markup.button.callback("📋 Подпункты", `${C.ADM_SECTION_SUB_PREFIX}list:${key}`)]);
      }
      buttons.push([Markup.button.callback("◀️ Назад", C.ADM_MAIN_MENU)]);
      await ctx.editMessageText(`Пункт «${label}». Что сделать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(buttons),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_SECTION_EDIT_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_SECTION_EDIT_PREFIX.length);
    const label = getSectionLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_main_section_label", key });
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новое <b>название пункта главного меню</b> (только текст).\n\nТекущее название — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(label);
    });
  });

  bot.action(new RegExp(`^${C.ADM_DEL_SECTION_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const id = data.slice(C.ADM_DEL_SECTION_PREFIX.length);
    const label = getSectionLabel(id);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить пункт «${label}» из главного меню? Пользователи больше не увидят его в меню.`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${C.ADM_CONFIRM_DEL_SECTION_PREFIX}${id}`)],
            [Markup.button.callback("Нет, оставляем", C.ADM_MAIN_MENU)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${C.ADM_CONFIRM_DEL_SECTION_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const id = data.slice(C.ADM_CONFIRM_DEL_SECTION_PREFIX.length);
    const label = getSectionLabel(id);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await addHiddenSectionId(id);
      await ctx.editMessageText(
        `<b>Главное меню</b>\n\nПункт «${label}» удалён из главного меню.`,
        {
          parse_mode: "HTML",
          ...M.getAdminMainMenuSubmenu(),
        }
      );
    });
  });
}
