import { Markup } from "telegraf";
import type { LessonKey } from "../content/loader";
import { MAIN } from "./main.menu";

const LESSONS_PREFIX = "lesson:";
const LESSONS_BACK = "lessons_back";

const LABELS: Record<LessonKey, string> = {
  price: "Стоимость",
  howLessonsWork: "Как проходят занятия",
  vocal: "Вокал",
  piano: "Фортепиано",
  exercises: "Упражнения между занятиями",
};

const topicButtons = (Object.keys(LABELS) as LessonKey[]).map((key) => [
  Markup.button.callback(LABELS[key], `${LESSONS_PREFIX}${key}`),
]);

/** For the lessons list screen — back goes to main menu */
export function getLessonsMenu() {
  return Markup.inlineKeyboard([
    ...topicButtons,
    [Markup.button.callback("◀️ В главное меню", MAIN)],
  ]);
}

/** For a lesson topic screen — back goes to lessons list */
export function getLessonsMenuForTopic() {
  return Markup.inlineKeyboard([
    ...topicButtons,
    [Markup.button.callback("◀️ Назад", LESSONS_BACK)],
  ]);
}

export const lessonsMenuMessage = "🎶 <b>Об уроках</b>\n\nВыберите тему:";

export function parseLessonCallback(data: string): LessonKey | null {
  if (!data.startsWith(LESSONS_PREFIX)) return null;
  const key = data.slice(LESSONS_PREFIX.length) as LessonKey;
  return LABELS[key] !== undefined ? key : null;
}

export { LESSONS_BACK };
