/**
 * Admin section sub-items and add-new-section flow.
 */

import { Markup } from "telegraf";
import type { AdminBot } from "./types";
import {
  getSections,
  getSectionSubIds,
  getSectionSubItem,
  isSectionNested,
  addSectionNested,
  removeSectionSubItem,
} from "../../../content/loader";
import { getState, clearState, setState } from "../../../state/userState";
import { withErrorHandling } from "../../../middleware/errorHandler";
import * as C from "../constants";
import * as M from "../menus";

export function registerAdminSectionSub(bot: AdminBot): void {
  bot.action(new RegExp(`^${C.ADM_SECTION_SUB_PREFIX}list:`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(`${C.ADM_SECTION_SUB_PREFIX}list:`.length);
    const sections = getSections();
    const section = sections.find((s) => s.key === sectionKey);
    if (!section || !isSectionNested(sectionKey)) return;
    const subIds = getSectionSubIds(sectionKey);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const subButtons = subIds.map((itemKey) => {
        const item = getSectionSubItem(sectionKey, itemKey);
        const label = item?.label ?? itemKey;
        return [Markup.button.callback(label, `${C.ADM_SECTION_SUB_PREFIX}${sectionKey}:${itemKey}`)];
      });
      const keyboard = [
        ...subButtons,
        [Markup.button.callback("◀️ Назад", `${C.ADM_SECTION_PREFIX}${sectionKey}`)],
      ];
      await ctx.editMessageText(`Подпункты раздела «${section.label}»:`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(keyboard),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_SECTION_SUB_PREFIX}[^l]`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const rest = data.slice(C.ADM_SECTION_SUB_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon === -1) return;
    const sectionKey = rest.slice(0, colon);
    const itemKey = rest.slice(colon + 1);
    const item = getSectionSubItem(sectionKey, itemKey);
    if (!item) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(`Подпункт «${item.label}». Что сделать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🗑 Удалить подпункт", `${C.ADM_DEL_SECTION_SUB_PREFIX}${sectionKey}:${itemKey}`)],
          [Markup.button.callback("◀️ Назад", `${C.ADM_SECTION_SUB_PREFIX}list:${sectionKey}`)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_DEL_SECTION_SUB_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const rest = data.slice(C.ADM_DEL_SECTION_SUB_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon === -1) return;
    const sectionKey = rest.slice(0, colon);
    const itemKey = rest.slice(colon + 1);
    const item = getSectionSubItem(sectionKey, itemKey);
    if (!item) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить подпункт «${item.label}»?`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${C.ADM_CONFIRM_DEL_SECTION_SUB_PREFIX}${sectionKey}:${itemKey}`)],
            [Markup.button.callback("Нет, оставляем", `${C.ADM_SECTION_SUB_PREFIX}${sectionKey}:${itemKey}`)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${C.ADM_CONFIRM_DEL_SECTION_SUB_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const rest = data.slice(C.ADM_CONFIRM_DEL_SECTION_SUB_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon === -1) return;
    const sectionKey = rest.slice(0, colon);
    const itemKey = rest.slice(colon + 1);
    const sections = getSections();
    const section = sections.find((s) => s.key === sectionKey);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeSectionSubItem(sectionKey, itemKey);
      const label = section?.label ?? sectionKey;
      await ctx.editMessageText(`Подпункт удалён.`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ К подпунктам", `${C.ADM_SECTION_SUB_PREFIX}list:${sectionKey}`)]]),
      });
    });
  });

  bot.action(C.ADM_ADD_MAIN_SECTION, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
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

  bot.action(C.ADM_NEW_SEC_FLAT, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
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

  bot.action(C.ADM_NEW_SEC_NESTED, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const state = getState(ctx.from!.id);
    if (state?.type !== "awaiting_new_main_section_choice") return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const sectionKey = await addSectionNested(state.label);
      setState(ctx.from!.id, { type: "awaiting_new_main_section_sub_label", sectionKey });
      await ctx.editMessageText(
        "Отправьте название первого подпункта (или нажмите Готово, чтобы завершить без подпунктов).",
        Markup.inlineKeyboard([[Markup.button.callback("✅ Готово", `${C.ADM_NEW_SEC_DONE_PREFIX}${sectionKey}`)]])
      );
    });
  });

  bot.action(new RegExp(`^${C.ADM_NEW_SEC_DONE_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const sectionKey = data.slice(C.ADM_NEW_SEC_DONE_PREFIX.length);
    const state = getState(ctx.from!.id);
    if (state?.type !== "awaiting_new_main_section_sub_more" && state?.type !== "awaiting_new_main_section_sub_label") return;
    if (state.sectionKey !== sectionKey) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      clearState(ctx.from!.id);
      const sections = getSections();
      const section = sections.find((s) => s.key === sectionKey);
      const label = section?.label ?? sectionKey;
      const count = getSectionSubIds(sectionKey).length;
      await ctx.editMessageText(
        `Раздел «${label}» добавлен в главное меню с ${count} подпунктом(ами) (ключ: ${sectionKey}).`
      );
    });
  });
}
