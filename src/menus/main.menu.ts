import { Markup } from "telegraf";
import { getMainMenuSectionIds, getMainSectionLabel, getCustomMainSections } from "../content/loader";

export const MAIN = "main";
export const LESSONS = "lessons";
export const ASK = "ask";
export const CONTACT = "contact";
export const MAIN_CUSTOM_PREFIX = "main_custom:";

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
