import type { Context } from "telegraf";
import { env } from "../config/env";
import { LESSON_KEYS, FAQ_KEYS, setLessonOverride, setFaqOverride } from "../content/loader";
import { getState, clearState, setState } from "../state/userState";
import { withErrorHandling } from "../middleware/errorHandler";

function isTeacher(ctx: Context): boolean {
  const id = ctx.from?.id?.toString();
  return env.TEACHER_USER_ID !== undefined && id === env.TEACHER_USER_ID;
}

export function registerAdmin(bot: {
  command: (name: string, handler: (ctx: Context) => Promise<unknown>) => void;
}) {
  if (!env.TEACHER_USER_ID) return;

  bot.command("admin", async (ctx) => {
    if (!isTeacher(ctx)) return;
    await withErrorHandling(ctx, async () => {
      await ctx.replyWithHTML(
        "<b>Админ-команды</b>\n\n" +
          "Редактирование разделов «Об уроках»:\n" +
          LESSON_KEYS.map((k) => `/edit_lesson ${k}`).join("\n") +
          "\n\nРедактирование ответов в «Задать вопрос»:\n" +
          FAQ_KEYS.map((k) => `/edit_faq ${k}`).join("\n") +
          "\n\nПосле команды отправьте новое содержание (можно с HTML: &lt;b&gt;, &lt;i&gt; и т.д.)."
      );
    });
  });

  bot.command("edit_lesson", async (ctx) => {
    if (!isTeacher(ctx)) return;
    await withErrorHandling(ctx, async () => {
      const key = ctx.message && "text" in ctx.message ? ctx.message.text?.split(/\s+/)[1] : undefined;
      if (!key || !LESSON_KEYS.includes(key as typeof LESSON_KEYS[number])) {
        await ctx.reply("Использование: /edit_lesson <key>\nКлючи: " + LESSON_KEYS.join(", "));
        return;
      }
      setState(ctx.from!.id, { type: "awaiting_edit_lesson", key });
      await ctx.reply(`Отправьте новый HTML-текст для раздела «${key}».`);
    });
  });

  bot.command("edit_faq", async (ctx) => {
    if (!isTeacher(ctx)) return;
    await withErrorHandling(ctx, async () => {
      const key = ctx.message && "text" in ctx.message ? ctx.message.text?.split(/\s+/)[1] : undefined;
      if (!key || !FAQ_KEYS.includes(key as typeof FAQ_KEYS[number])) {
        await ctx.reply("Использование: /edit_faq <key>\nКлючи: " + FAQ_KEYS.join(", "));
        return;
      }
      setState(ctx.from!.id, { type: "awaiting_edit_faq", key });
      await ctx.reply(`Отправьте новый HTML-текст для ответа «${key}».`);
    });
  });
}

/** Handle teacher's next message when editing content (called from text handler) */
export async function handleAdminEdit(
  userId: number,
  text: string,
  reply: (msg: string) => Promise<unknown>
): Promise<boolean> {
  const state = getState(userId);
  if (!state) return false;
  if (state.type === "awaiting_edit_lesson") {
    setLessonOverride(state.key, text);
    clearState(userId);
    await reply(`Раздел «${state.key}» обновлён.`);
    return true;
  }
  if (state.type === "awaiting_edit_faq") {
    setFaqOverride(state.key, text);
    clearState(userId);
    await reply(`Ответ «${state.key}» обновлён.`);
    return true;
  }
  return false;
}
