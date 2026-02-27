/**
 * Bot menu commands via setMyCommands (https://core.telegram.org/bots/api#setmycommands).
 * Default scope shows only /start and /help. Admins get /admin in their private chat via scope "chat".
 */

export type BotCommand = { command: string; description: string };

/** Minimal type for setMyCommands; use with (bot.telegram as TelegramLike) to avoid pulling in full BotCommandScope. */
export interface TelegramLike {
  setMyCommands(commands: readonly BotCommand[], extra?: { scope?: { type: string; chat_id?: number } }): Promise<true>;
}

const USER_COMMANDS: BotCommand[] = [
  { command: "start", description: "Главное меню" },
  { command: "help", description: "Помощь" },
];

const ADMIN_COMMANDS: BotCommand[] = [
  ...USER_COMMANDS,
  { command: "admin", description: "Админ-панель" },
];

/**
 * Set default (and all_private_chats) commands to user commands only, then set chat scope for each admin so they see /admin.
 */
export async function updateBotCommands(telegram: TelegramLike, adminIds: number[]): Promise<void> {
  await telegram.setMyCommands(USER_COMMANDS, { scope: { type: "default" } });
  await telegram.setMyCommands(USER_COMMANDS, { scope: { type: "all_private_chats" } });
  for (const chatId of adminIds) {
    await telegram.setMyCommands(ADMIN_COMMANDS, { scope: { type: "chat", chat_id: chatId } });
  }
}

/**
 * Set commands for a single chat (e.g. when adding a new admin) so they see /admin.
 */
export async function setCommandsForAdminChat(telegram: TelegramLike, chatId: number): Promise<void> {
  await telegram.setMyCommands(ADMIN_COMMANDS, { scope: { type: "chat", chat_id: chatId } });
}

let telegramRef: TelegramLike | null = null;

/** Call from createBot so add_admin can update the new admin's menu. */
export function setTelegramForCommands(telegram: TelegramLike): void {
  telegramRef = telegram;
}

/** Call after adding an admin so their private chat shows /admin. */
export async function setCommandsForNewAdmin(chatId: number): Promise<void> {
  if (telegramRef) await setCommandsForAdminChat(telegramRef, chatId);
}
