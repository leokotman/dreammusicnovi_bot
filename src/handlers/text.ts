import type { Context } from "telegraf";
import { env } from "../config/env";
import { isAdmin } from "../config/admins";
import { getMainMenu } from "../menus/main.menu";
import { getState, clearState } from "../state/userState";
import { checkTextRateLimit } from "../middleware/rateLimit";
import { handleAdminEdit } from "./admin";
import { withErrorHandling } from "../middleware/errorHandler";

const THANK_YOU_MESSAGE =
  "Ваш вопрос отправлен преподавателю. Он свяжется с вами в ближайшее время. Спасибо!";

const RATE_LIMIT_MESSAGE =
  "Слишком много сообщений. Подождите минуту и попробуйте снова.";

export async function handleText(ctx: Context): Promise<void> {
  await withErrorHandling(ctx, async () => {
    const userId = ctx.from?.id;
    const msg = ctx.message;
    const text = msg && "text" in msg ? msg.text : undefined;
    if (!userId || !text) return;

    // 1) Admin editing content or adding admin (no rate limit)
    if (isAdmin(userId.toString())) {
      const handled = await handleAdminEdit(userId, text, (msg, opts) =>
        ctx.replyWithHTML(msg, (opts ?? {}) as Parameters<Context["replyWithHTML"]>[1])
      );
      if (handled) return;
    }

    // 2) User sent their custom question → forward to teacher
    const state = getState(userId);
    if (state?.type === "awaiting_question") {
      clearState(userId);
      if (!isAdmin(userId.toString()) && !checkTextRateLimit(userId)) {
        await ctx.reply(RATE_LIMIT_MESSAGE);
        return;
      }
      if (env.TEACHER_CHAT_ID) {
        const from = ctx.from;
        const username = from?.username ? `@${from.username}` : "без username";
        const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || "—";
        await ctx.telegram.sendMessage(
          env.TEACHER_CHAT_ID,
          `Новый вопрос от ${name} (${username}, id: ${userId}):\n\n${text}`
        );
      }
      await ctx.replyWithHTML(THANK_YOU_MESSAGE, getMainMenu());
      return;
    }

    // 3) Any other text: rate limit then show menu (admins are not rate limited)
    if (!isAdmin(userId.toString()) && !checkTextRateLimit(userId)) {
      await ctx.reply(RATE_LIMIT_MESSAGE);
      return;
    }
    await ctx.replyWithHTML(
      "Используйте меню ниже: об уроках, задать вопрос или связаться с преподавателем.",
      getMainMenu()
    );
  });
}
