/**
 * Loads content from HTML files (content/lessons/, content/faq/).
 * Overrides from storage (Vercel Blob or data/overrides.json) are applied when present.
 */

import * as fs from "fs";
import * as path from "path";
import { getOverrides as getOverridesFromStorage, setOverrides, type OverridesData } from "../storage";

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTENT_LESSONS = path.join(PROJECT_ROOT, "content", "lessons");
const CONTENT_FAQ = path.join(PROJECT_ROOT, "content", "faq");

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

let overrides: OverridesData = {};

/** Load overrides from storage (Blob or fs) into memory. Call at start of each webhook request so edits persist. */
export async function ensureOverridesLoaded(): Promise<void> {
  const data = await getOverridesFromStorage();
  overrides = data ?? {};
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

export async function setLessonOverride(key: string, html: string): Promise<void> {
  const data = await getOverridesFromStorage();
  const current = data ?? {};
  const lessons = { ...(current.lessons ?? {}) };
  lessons[key] = html;
  overrides = { ...current, lessons };
  await setOverrides(overrides);
}

export async function setFaqOverride(key: string, html: string): Promise<void> {
  const data = await getOverridesFromStorage();
  const current = data ?? {};
  const faq = { ...(current.faq ?? {}) };
  faq[key] = html;
  overrides = { ...current, faq };
  await setOverrides(overrides);
}

/** Replace all overrides (used by tests). */
export async function saveOverrides(newOverrides: OverridesData): Promise<void> {
  overrides = newOverrides;
  await setOverrides(overrides);
}

export function getOverrides(): typeof overrides {
  return { ...overrides };
}

/** Call once at startup after env is loaded (long-polling). For webhook, use ensureOverridesLoaded() at request start. */
export function initContent(): void {
  // Sync load only when using fs (no Blob token). When using Blob, overrides are loaded per-request via ensureOverridesLoaded().
  if (
    typeof process.env.BLOB_READ_WRITE_TOKEN !== "string" ||
    process.env.BLOB_READ_WRITE_TOKEN.length === 0
  ) {
    const data = getOverridesSync();
    overrides = data ?? {};
  }
}

function getOverridesSync(): OverridesData | null {
  try {
    const raw = fs.readFileSync(path.join(PROJECT_ROOT, "data", "overrides.json"), "utf-8");
    return JSON.parse(raw) as OverridesData;
  } catch {
    return null;
  }
}
