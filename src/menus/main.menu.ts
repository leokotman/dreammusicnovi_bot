import { Markup } from "telegraf";
import {
  getMainMenuSectionIds,
  getMainSectionLabel,
  getCustomMainSections,
  getCustomMainSectionSubIds,
  getCustomMainSectionSubItem,
} from "../content/loader";
import { escapeForTelegramHtml } from "../utils/html";

export const MAIN = "main";
export const LESSONS = "lessons";
export const ASK = "ask";
export const CONTACT = "contact";
export const MAIN_CUSTOM_PREFIX = "main_custom:";
/** Callback for nested custom section sub-item: main_sub:sectionKey:itemKey */
export const MAIN_CUSTOM_SUB_PREFIX = "main_sub:";

const SECTION_CALLBACK: Record<string, string> = {
  lessons: LESSONS,
  ask: ASK,
  contact: CONTACT,
};

export function getMainMenu() {
  const ids = getMainMenuSectionIds();
  const customSections = getCustomMainSections();
  const buttons = ids.map((id, index) => {
    const num = (index + 1).toString() + "️⃣ ";
    const label =
      id in SECTION_CALLBACK ? getMainSectionLabel(id) : customSections.find((s) => s.key === id)?.label ?? id;
    const callbackData = SECTION_CALLBACK[id] ?? `${MAIN_CUSTOM_PREFIX}${id}`;
    return [Markup.button.callback(num + label, callbackData)];
  });
  return Markup.inlineKeyboard(buttons);
}

export const mainMenuMessage = `
🎵 <b>Добро пожаловать!</b>

Выберите пункт меню:
`.trim();

/** Keyboard and message for a nested custom section (list of sub-items). */
export function getCustomSectionSubMenu(sectionKey: string) {
  const subIds = getCustomMainSectionSubIds(sectionKey);
  const customSections = getCustomMainSections();
  const sectionLabel = customSections.find((s) => s.key === sectionKey)?.label ?? sectionKey;
  const buttons = subIds.map((itemKey) => {
    const item = getCustomMainSectionSubItem(sectionKey, itemKey);
    const label = item?.label ?? itemKey;
    return [Markup.button.callback(label, `${MAIN_CUSTOM_SUB_PREFIX}${sectionKey}:${itemKey}`)];
  });
  return Markup.inlineKeyboard([
    ...buttons,
    [Markup.button.callback("◀️ В главное меню", MAIN)],
  ]);
}

export function getCustomSectionSubMenuMessage(sectionKey: string): string {
  const customSections = getCustomMainSections();
  const sectionLabel = customSections.find((s) => s.key === sectionKey)?.label ?? sectionKey;
  return `<b>${escapeForTelegramHtml(sectionLabel)}</b>\n\nВыберите пункт:`;
}
