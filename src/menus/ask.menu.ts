import { Markup } from "telegraf";
import type { FaqKey } from "../content/loader";

const FAQ_PREFIX = "faq:";
const ASK_CUSTOM = "ask_custom";
const ASK_BACK = "ask_back";

/** Russian labels for FAQ buttons */
export const FAQ_LABELS: Record<FaqKey, string> = {
  amITooOld: "Я уже слишком взрослый?",
  needEducation: "Нужно ли музыкальное образование?",
  howOftenPractice: "Как часто нужно заниматься дома?",
  noEarForMusic: "У меня нет слуха — получится ли?",
};

export function getAskMenu() {
  const faqButtons = (Object.keys(FAQ_LABELS) as FaqKey[]).map((key) =>
    Markup.button.callback(FAQ_LABELS[key], `${FAQ_PREFIX}${key}`)
  );
  return Markup.inlineKeyboard([
    ...faqButtons.map((b) => [b]),
    [Markup.button.callback("✏️ Задать свой вопрос", ASK_CUSTOM)],
    [Markup.button.callback("◀️ Назад", ASK_BACK)],
  ]);
}

export const askMenuMessage = "❓ <b>Задать вопрос</b>\n\nВыберите вопрос или задайте свой:";

export function parseFaqCallback(data: string): FaqKey | null {
  if (!data.startsWith(FAQ_PREFIX)) return null;
  const key = data.slice(FAQ_PREFIX.length);
  return FAQ_LABELS[key as FaqKey] !== undefined ? (key as FaqKey) : null;
}

export { ASK_CUSTOM, ASK_BACK };
