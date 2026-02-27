import { Markup } from "telegraf";
import {
  getVisibleSectionIds,
  getSectionLabel,
  getSectionSubIds,
  getSectionSubItem,
} from "../content/loader";
import { escapeForTelegramHtml } from "../utils/html";

export const MAIN = "main";
export const LESSONS = "lessons";
export const ASK = "ask";
export const CONTACT = "contact";
export const MAIN_CUSTOM_PREFIX = "main_custom:";
/** Callback for nested section sub-item: main_sub:sectionKey:itemKey */
export const MAIN_CUSTOM_SUB_PREFIX = "main_sub:";

const SECTION_CALLBACK: Record<string, string> = {
  lessons: LESSONS,
  ask: ASK,
  contact: CONTACT,
};

export function getMainMenu() {
  const ids = getVisibleSectionIds();
  const buttons = ids.map((id, index) => {
    const num = (index + 1).toString() + "️⃣ ";
    const label = getSectionLabel(id);
    const callbackData = SECTION_CALLBACK[id] ?? `${MAIN_CUSTOM_PREFIX}${id}`;
    return [Markup.button.callback(num + label, callbackData)];
  });
  return Markup.inlineKeyboard(buttons);
}

export const mainMenuMessage = `
🎵 <b>Добро пожаловать!</b>

Выберите пункт меню:
`.trim();

/** Keyboard and message for a nested section (list of sub-items). */
export function getCustomSectionSubMenu(sectionKey: string) {
  const subIds = getSectionSubIds(sectionKey);
  const sectionLabel = getSectionLabel(sectionKey);
  const buttons = subIds.map((itemKey) => {
    const item = getSectionSubItem(sectionKey, itemKey);
    const label = item?.label ?? itemKey;
    return [Markup.button.callback(label, `${MAIN_CUSTOM_SUB_PREFIX}${sectionKey}:${itemKey}`)];
  });
  return Markup.inlineKeyboard([
    ...buttons,
    [Markup.button.callback("◀️ В главное меню", MAIN)],
  ]);
}

export function getCustomSectionSubMenuMessage(sectionKey: string): string {
  const sectionLabel = getSectionLabel(sectionKey);
  return `<b>${escapeForTelegramHtml(sectionLabel)}</b>\n\nВыберите пункт:`;
}
