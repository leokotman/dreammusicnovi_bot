/**
 * Loads content from HTML files (content/lessons/, content/faq/).
 * Overrides from data/overrides.json are applied when present.
 */

import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTENT_LESSONS = path.join(PROJECT_ROOT, "content", "lessons");
const CONTENT_FAQ = path.join(PROJECT_ROOT, "content", "faq");
const OVERRIDES_PATH = path.join(PROJECT_ROOT, "data", "overrides.json");

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

let overrides: { lessons?: Record<string, string>; faq?: Record<string, string> } = {};

function loadOverrides(): void {
  try {
    const raw = fs.readFileSync(OVERRIDES_PATH, "utf-8");
    overrides = JSON.parse(raw) as typeof overrides;
  } catch {
    overrides = {};
  }
}

function readHtmlFile(dir: string, key: string): string {
  const filePath = path.join(dir, `${key}.html`);
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return `<b>Раздел «${key}»</b>\n\nСодержание не найдено.`;
  }
}

export function getLesson(key: LessonKey): string {
  if (overrides?.lessons?.[key]) return overrides.lessons[key];
  return readHtmlFile(CONTENT_LESSONS, key);
}

export function getFaq(key: FaqKey): string {
  if (overrides?.faq?.[key]) return overrides.faq[key];
  return readHtmlFile(CONTENT_FAQ, key);
}

export function saveOverrides(newOverrides: typeof overrides): void {
  const dir = path.dirname(OVERRIDES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(newOverrides, null, 2), "utf-8");
  overrides = newOverrides;
}

export function setLessonOverride(key: string, html: string): void {
  loadOverrides();
  const lessons = { ...(overrides.lessons ?? {}) };
  lessons[key] = html;
  saveOverrides({ ...overrides, lessons });
}

export function setFaqOverride(key: string, html: string): void {
  loadOverrides();
  const faq = { ...(overrides.faq ?? {}) };
  faq[key] = html;
  saveOverrides({ ...overrides, faq });
}

export function getOverrides(): typeof overrides {
  return { ...overrides };
}

/** Call once at startup after env is loaded */
export function initContent(): void {
  loadOverrides();
}
