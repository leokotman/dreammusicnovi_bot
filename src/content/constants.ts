/**
 * Content keys, default section ids, and fixed labels.
 */

/** Default section ids used when seeding (single tier; no "main" vs "custom"). */
export const DEFAULT_SECTION_IDS = ["lessons", "ask", "contact"] as const;

export const LESSON_KEYS = [
  "price",
  "howLessonsWork",
  "vocal",
  "piano",
  "exercises",
] as const;
export const FAQ_KEYS = [
  "amITooOld",
  "needEducation",
  "howOftenPractice",
  "noEarForMusic",
] as const;

export type LessonKey = (typeof LESSON_KEYS)[number];
export type FaqKey = (typeof FAQ_KEYS)[number];

export const FIXED_LESSON_LABELS: Record<string, string> = {
  price: "Стоимость",
  howLessonsWork: "Как проходят занятия",
  vocal: "Вокал",
  piano: "Фортепиано",
  exercises: "Упражнения между занятиями",
};

export const FIXED_FAQ_LABELS: Record<string, string> = {
  amITooOld: "Я уже слишком взрослый?",
  needEducation: "Нужно ли музыкальное образование?",
  howOftenPractice: "Как часто нужно заниматься дома?",
  noEarForMusic: "У меня нет слуха — получится ли?",
};

export const DEFAULT_SECTION_LABELS: Record<string, string> = {
  lessons: "Об уроках",
  ask: "Задать вопрос",
  contact: "Связаться с преподавателем",
};

/** Months after which deleted sections are purged from storage. */
export const DELETED_SECTION_RETENTION_MONTHS = 3;
