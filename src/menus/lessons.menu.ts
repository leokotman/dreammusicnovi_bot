import { Markup } from "telegraf";
import { getAllLessonKeys, getLessonLabel, getSectionLabel } from "../content/loader";
import { MAIN } from "./main.menu";

const LESSONS_PREFIX = "lesson:";
const LESSONS_BACK = "lessons_back";

function getTopicButtons() {
  const keys = getAllLessonKeys();
  return keys.map((key) => [
    Markup.button.callback(getLessonLabel(key), `${LESSONS_PREFIX}${key}`),
  ]);
}

/** For the lessons list screen — back goes to main menu */
export function getLessonsMenu() {
  return Markup.inlineKeyboard([
    ...getTopicButtons(),
    [Markup.button.callback("◀️ В главное меню", MAIN)],
  ]);
}

/** For a lesson topic screen — back goes to lessons list */
export function getLessonsMenuForTopic() {
  return Markup.inlineKeyboard([
    ...getTopicButtons(),
    [Markup.button.callback("◀️ Назад", LESSONS_BACK)],
  ]);
}

export function getLessonsMenuMessage(): string {
  return `🎶 <b>${getSectionLabel("lessons")}</b>\n\nВыберите тему:`;
}

export { getLessonLabel };

export function parseLessonCallback(data: string): string | null {
  if (!data.startsWith(LESSONS_PREFIX)) return null;
  const key = data.slice(LESSONS_PREFIX.length);
  return getAllLessonKeys().includes(key) ? key : null;
}

export { LESSONS_BACK };
