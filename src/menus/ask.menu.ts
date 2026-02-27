import { Markup } from "telegraf";
import { getAllFaqKeys, getFaqLabel } from "../content/loader";
import { MAIN } from "./main.menu";

const FAQ_PREFIX = "faq:";
const ASK_CUSTOM = "ask_custom";
const ASK_BACK = "ask_back";

function getFaqButtons() {
  const keys = getAllFaqKeys();
  return keys.map((key) => [
    Markup.button.callback(getFaqLabel(key), `${FAQ_PREFIX}${key}`),
  ]);
}

/** For the ask list screen — back goes to main menu */
export function getAskMenu() {
  return Markup.inlineKeyboard([
    ...getFaqButtons(),
    [Markup.button.callback("✏️ Задать свой вопрос", ASK_CUSTOM)],
    [Markup.button.callback("◀️ В главное меню", MAIN)],
  ]);
}

/** For an FAQ answer screen — back goes to ask list */
export function getAskMenuForTopic() {
  return Markup.inlineKeyboard([
    ...getFaqButtons(),
    [Markup.button.callback("✏️ Задать свой вопрос", ASK_CUSTOM)],
    [Markup.button.callback("◀️ Назад", ASK_BACK)],
  ]);
}

export const askMenuMessage = "❓ <b>Задать вопрос</b>\n\nВыберите вопрос или задайте свой:";

/** Russian labels for FAQ (fixed keys). Re-export for backward compat; use getFaqLabel from loader for any key. */
export const FAQ_LABELS = {
  amITooOld: "Я уже слишком взрослый?",
  needEducation: "Нужно ли музыкальное образование?",
  howOftenPractice: "Как часто нужно заниматься дома?",
  noEarForMusic: "У меня нет слуха — получится ли?",
} as const;

export function parseFaqCallback(data: string): string | null {
  if (!data.startsWith(FAQ_PREFIX)) return null;
  const key = data.slice(FAQ_PREFIX.length);
  return getAllFaqKeys().includes(key) ? key : null;
}

export { getFaqLabel, ASK_CUSTOM, ASK_BACK };
