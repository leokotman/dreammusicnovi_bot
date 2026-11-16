import type { Context, MiddlewareFn } from "telegraf";
import type { ConsentStore } from "./consent";
import type { PairingService } from "./service";
import { PAIRING_PREFIX, validAttempt } from "./protocol";

export const DISCONNECT = "website_disconnect";
interface Dependencies {
  enabled: () => boolean;
  deliveryEnabled: () => boolean;
  consent: () => ConsentStore;
  pairing: () => PairingService;
  botId: () => string;
}

/** Username is deliberately unnecessary for revocation (users can remove it). */
function privateUser(from: Context["from"], chat: Context["chat"]): string | null {
  return from && from.is_bot === false && Number.isSafeInteger(from.id) && from.id > 0 &&
    chat?.type === "private" && chat.id === from.id ? String(from.id) : null;
}

/** Transport authentication belongs to the webhook/polling entry point. No update bodies are logged. */
export function pairingMiddleware(deps: Dependencies): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const updateId = ctx.update.update_id;
    if (!Number.isSafeInteger(updateId) || updateId < 0) return next();
    const membership = "my_chat_member" in ctx.update ? ctx.update.my_chat_member : undefined;
    if (membership) {
      const userId = privateUser(membership.from, membership.chat);
      if (deps.deliveryEnabled() && userId && membership.new_chat_member.status === "kicked" &&
          membership.new_chat_member.user.is_bot === true && String(membership.new_chat_member.user.id) === deps.botId()) {
        // Propagate authority failures: webhook redelivery must retry a failed revocation.
        await deps.consent().revoke(userId, updateId);
      }
      return next();
    }
    const callback = "callback_query" in ctx.update ? ctx.update.callback_query : undefined;
    const disconnectCallback = callback && "data" in callback && callback.data === DISCONNECT;
    const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
    const command = /^\/(start|disconnect)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?\s*$/.exec(text);
    if (command?.[2] && command[2].toLowerCase() !== ctx.botInfo.username.toLowerCase()) return next();
    const attempt = command?.[1] === "start" ? command[3]?.trim() : undefined;
    const pairingStart = attempt?.startsWith(PAIRING_PREFIX);
    const disconnect = disconnectCallback || command?.[1] === "disconnect";
    if (!pairingStart && !disconnect) return next();
    if (disconnectCallback) {
      try { await ctx.answerCbQuery(); }
      catch { /* An expired callback acknowledgement must not prevent durable revocation. */ }
    }
    if (!deps.enabled()) {
      await ctx.reply("Подключение сайта пока недоступно. Заявку можно отправить без подключения Telegram.");
      return;
    }
    if (disconnect) {
      const userId = privateUser(ctx.from, ctx.chat);
      if (!userId) { await ctx.reply("Отключить сайт можно только в личном чате с ботом."); return; }
      // Do not acknowledge success or swallow a failed write; retry the authenticated update.
      await deps.consent().revoke(userId, updateId);
      await ctx.reply("Сайт отключён. Новые подтверждения заявок не будут отправляться. Уже отправленные сообщения и заявки сохраняются. Чтобы подключиться снова, создайте новую ссылку на сайте и введите новый код. Сообщение, которое уже отправлялось, ещё может прийти.");
      return;
    }
    if (!validAttempt(attempt)) { await ctx.reply("Ссылка подключения недействительна. Создайте новую ссылку в форме на сайте."); return; }
    let code: string;
    try { code = await deps.pairing().start(attempt, { from: ctx.from, chat: ctx.chat }); }
    catch (error) {
      console.error("telegram-pairing-failed");
      let message = "Не удалось подготовить код. Создайте новую ссылку в исходной форме или отправьте заявку без подключения Telegram.";
      if (error instanceof Error && error.message === "username-required")
        message = "Добавьте имя пользователя в настройках Telegram и снова откройте ссылку из формы. Заявку также можно отправить без подключения.";
      if (error instanceof Error && error.message === "consent-revoked")
        message = "Эта ссылка создана до отключения сайта или слишком близко к нему. Подождите немного и создайте новую ссылку в форме. Заявку также можно отправить без подключения Telegram.";
      await ctx.reply(message);
      return;
    }
    // Never include form details or a return link. Sending failure remains retryable.
    await ctx.reply(`Код подключения сайта: ${code}\n\nВведите его только в той форме, где вы начали подключение. Не передавайте код другим людям. Если вы не начинали подключение, не вводите код. Код действует до 10 минут. Подключение разрешает подтверждения новых заявок, но не даёт доступа к прошлым. Отключить сайт: /disconnect`);
  };
}
