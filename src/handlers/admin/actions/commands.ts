/**
 * Admin slash commands: add_admin, edit_lesson, edit_faq.
 */

import type { AdminBot } from "./types";
import { getAllLessonKeys, getAllFaqKeys, getLessonLabel, getFaqLabel } from "../../../content/loader";
import { setState } from "../../../state/userState";
import { withErrorHandling } from "../../../middleware/errorHandler";
import * as M from "../menus";

export function registerAdminCommands(bot: AdminBot): void {
  bot.command("add_admin", async (ctx) => {
    if (!M.canUseAdmin(ctx)) return;
    await withErrorHandling(ctx, async () => {
      setState(ctx.from!.id, { type: "awaiting_add_admin" });
      await ctx.reply(
        "Отправьте в следующем сообщении <b>user ID</b> (число) пользователя, которого нужно сделать админом. " +
          "Узнать ID можно через @userinfobot.",
        { parse_mode: "HTML" }
      );
    });
  });

  bot.command("edit_lesson", async (ctx) => {
    if (!M.canUseAdmin(ctx)) return;
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
    if (!M.canUseAdmin(ctx)) return;
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
