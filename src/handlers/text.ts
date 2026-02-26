import type { Context } from "telegraf";
import { env } from "../config/env";
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

    // 1) Teacher editing content (no rate limit for admin)
    if (env.TEACHER_USER_ID && userId.toString() === env.TEACHER_USER_ID) {
      const handled = await handleAdminEdit(userId, text, (msg) =>
        ctx.replyWithHTML(msg)
      );
      if (handled) return;
    }

    // 2) User sent their custom question → forward to teacher
    const state = getState(userId);
    if (state?.type === "awaiting_question") {
      clearState(userId);
      if (!checkTextRateLimit(userId)) {
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

    // 3) Any other text: rate limit then show menu
    if (!checkTextRateLimit(userId)) {
      await ctx.reply(RATE_LIMIT_MESSAGE);
      return;
    }
    await ctx.replyWithHTML(
      "Используйте меню ниже: об уроках, задать вопрос или связаться с преподавателем.",
      getMainMenu()
    );
  });
}
