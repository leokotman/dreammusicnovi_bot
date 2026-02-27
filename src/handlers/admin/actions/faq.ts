/**
 * Admin FAQ (Задать вопрос) actions.
 */

import { Markup } from "telegraf";
import type { AdminBot } from "./types";
import {
  getFaq,
  getAllFaqKeys,
  getFaqLabel,
  getSectionLabel,
  addHiddenFaqKey,
  removeCustomFaq,
  isFaqKeyFixed,
} from "../../../content/loader";
import type { FaqKey } from "../../../content/loader";
import { setState } from "../../../state/userState";
import { withErrorHandling } from "../../../middleware/errorHandler";
import * as C from "../constants";
import * as M from "../menus";

export function registerAdminFaq(bot: AdminBot): void {
  bot.action(C.ADM_FAQ, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const sectionLabel = getSectionLabel("ask");
      await ctx.editMessageText(`<b>Вопросы раздела «${sectionLabel}»</b>\n\nВыберите вопрос для редактирования:`, {
        parse_mode: "HTML",
        ...M.getAdminFaqMenu(),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_FAQ_SEL_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_FAQ_SEL_PREFIX.length);
    if (!getAllFaqKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      const label = getFaqLabel(key);
      await ctx.editMessageText(`Вопрос «${label}». Что редактировать?`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✏️ Вопрос", `${C.ADM_FAQ_LABEL_PREFIX}${key}`)],
          [Markup.button.callback("📄 Ответ", `${C.ADM_FAQ_ANS_PREFIX}${key}`)],
          [Markup.button.callback("🗑 Удалить", `${C.ADM_DEL_FAQ_PREFIX}${key}`)],
          [Markup.button.callback("◀️ Назад", C.ADM_FAQ)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_DEL_FAQ_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_DEL_FAQ_PREFIX.length);
    if (!getAllFaqKeys().includes(key)) return;
    const label = getFaqLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Удалить вопрос «${label}»? Он исчезнет из списка в «Задать вопрос».`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Да, удаляем", `${C.ADM_CONFIRM_DEL_FAQ_PREFIX}${key}`)],
            [Markup.button.callback("Нет, оставляем", C.ADM_FAQ)],
          ]),
        }
      );
    });
  });

  bot.action(new RegExp(`^${C.ADM_CONFIRM_DEL_FAQ_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_CONFIRM_DEL_FAQ_PREFIX.length);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      if (isFaqKeyFixed(key)) {
        await addHiddenFaqKey(key);
      } else {
        await removeCustomFaq(key);
      }
      await ctx.editMessageText("Вопрос удалён из списка.", {
        parse_mode: "HTML",
        ...M.getAdminFaqMenu(),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_FAQ_LABEL_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_FAQ_LABEL_PREFIX.length);
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

  bot.action(new RegExp(`^(${C.ADM_FAQ_PREFIX}|${C.ADM_FAQ_ANS_PREFIX})`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.startsWith(C.ADM_FAQ_ANS_PREFIX)
      ? data.slice(C.ADM_FAQ_ANS_PREFIX.length)
      : data.slice(C.ADM_FAQ_PREFIX.length);
    if (!getAllFaqKeys().includes(key)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      setState(ctx.from!.id, { type: "awaiting_edit_faq", key });
      const label = getFaqLabel(key);
      const current = getFaq(key as FaqKey);
      const plainForCopy = M.truncateForPreview(current);
      await ctx.editMessageText(
        `Отправьте в следующем сообщении новый текст для ответа «${label}» (только текст, без разметки).\n\nТекущий текст — в следующем сообщении.`,
        { parse_mode: "HTML" }
      );
      await ctx.reply(plainForCopy);
    });
  });

  bot.action(C.ADM_ADD_FAQ, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
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
}
