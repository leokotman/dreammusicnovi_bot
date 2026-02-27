/**
 * Admin main menu and restore actions.
 */

import type { AdminBot } from "./types";
import {
  getSectionLabel,
  getLessonLabel,
  getFaqLabel,
  removeHiddenSectionId,
  removeHiddenLessonKey,
  removeHiddenFaqKey,
  getHiddenSectionIds,
  purgeDeletedSectionsOlderThanThreeMonths,
} from "../../../content/loader";
import { withErrorHandling } from "../../../middleware/errorHandler";
import * as C from "../constants";
import * as M from "../menus";

export function registerAdminMain(bot: AdminBot): void {
  bot.command("admin", async (ctx) => {
    if (!M.canUseAdmin(ctx)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.replyWithHTML(
        "<b>Админ</b>\n\nВыберите, что редактировать:",
        M.getAdminMainMenu()
      );
    });
  });

  bot.action(C.ADM_MAIN, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText("<b>Админ</b>\n\nВыберите, что редактировать:", {
        parse_mode: "HTML",
        ...M.getAdminMainMenu(),
      });
    });
  });

  bot.action(C.ADM_MAIN_MENU, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        "<b>Разделы</b>\n\nВыберите раздел для редактирования (название, подразделы) или добавьте новый:",
        {
          parse_mode: "HTML",
          ...M.getAdminMainMenuSubmenu(),
        }
      );
    });
  });

  bot.action(C.ADM_RESTORE, async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await purgeDeletedSectionsOlderThanThreeMonths();
      await ctx.editMessageText(M.getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...M.getAdminRestoreMenu(),
      });
    });
  });

  bot.action(new RegExp(`^${C.ADM_RESTORE_SECTION_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const id = data.slice(C.ADM_RESTORE_SECTION_PREFIX.length);
    const label = getSectionLabel(id);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeHiddenSectionId(id);
      await ctx.editMessageText(M.getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...M.getAdminRestoreMenu(),
      });
      await ctx.reply(`Пункт «${label}» восстановлен в главное меню.`);
    });
  });

  bot.action(new RegExp(`^${C.ADM_RESTORE_LESSON_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_RESTORE_LESSON_PREFIX.length);
    const label = getLessonLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeHiddenLessonKey(key);
      await ctx.editMessageText(M.getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...M.getAdminRestoreMenu(),
      });
      await ctx.reply(`Раздел «${label}» восстановлен в список тем.`);
    });
  });

  bot.action(new RegExp(`^${C.ADM_RESTORE_FAQ_PREFIX}`), async (ctx) => {
    if (!M.canUseAdmin(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const cq = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const data = cq && "data" in cq ? cq.data : undefined;
    if (!data) return;
    const key = data.slice(C.ADM_RESTORE_FAQ_PREFIX.length);
    const label = getFaqLabel(key);
    await withErrorHandling(ctx, async () => {
      await ctx.answerCbQuery();
      await removeHiddenFaqKey(key);
      await ctx.editMessageText(M.getAdminRestoreMessage(), {
        parse_mode: "HTML",
        ...M.getAdminRestoreMenu(),
      });
      await ctx.reply(`Вопрос «${label}» восстановлен в список.`);
    });
  });
}
