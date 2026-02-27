/**
 * Loads content from HTML files (content/lessons/, content/faq/).
 * Saved content from storage (Vercel Blob or data/overrides.json) is applied when present.
 */

import * as fs from "fs";
import * as path from "path";
import { loadSavedContent, saveSavedContent, type SavedContentData } from "../storage";

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

const FIXED_LESSON_LABELS: Record<string, string> = {
  price: "Стоимость",
  howLessonsWork: "Как проходят занятия",
  vocal: "Вокал",
  piano: "Фортепиано",
  exercises: "Упражнения между занятиями",
};

const FIXED_FAQ_LABELS: Record<string, string> = {
  amITooOld: "Я уже слишком взрослый?",
  needEducation: "Нужно ли музыкальное образование?",
  howOftenPractice: "Как часто нужно заниматься дома?",
  noEarForMusic: "У меня нет слуха — получится ли?",
};

/** Fixed main menu section ids and default labels. */
export const MAIN_SECTION_IDS = ["lessons", "ask", "contact"] as const;
const DEFAULT_MAIN_SECTION_LABELS: Record<string, string> = {
  lessons: "Об уроках",
  ask: "Задать вопрос",
  contact: "Связаться с преподавателем",
};

let savedContent: SavedContentData = {};

export function getAllLessonKeys(): string[] {
  const fixed = [...LESSON_KEYS];
  const custom = Object.keys(savedContent.customLessonLabels ?? {});
  return [...fixed, ...custom];
}

export function getAllFaqKeys(): string[] {
  const fixed = [...FAQ_KEYS];
  const custom = Object.keys(savedContent.customFaqLabels ?? {});
  return [...fixed, ...custom];
}

export function getLessonLabel(key: string): string {
  return savedContent.lessonLabelOverrides?.[key] ?? FIXED_LESSON_LABELS[key] ?? savedContent.customLessonLabels?.[key] ?? key;
}

export function getFaqLabel(key: string): string {
  return savedContent.faqLabelOverrides?.[key] ?? FIXED_FAQ_LABELS[key] ?? savedContent.customFaqLabels?.[key] ?? key;
}

export function getMainSectionLabel(id: string): string {
  return savedContent.mainSectionLabels?.[id] ?? DEFAULT_MAIN_SECTION_LABELS[id] ?? id;
}

/** Ordered list of main menu section ids: fixed three then custom. */
export function getMainMenuSectionIds(): string[] {
  const customOrder = savedContent.customMainSectionOrder ?? [];
  return [...MAIN_SECTION_IDS, ...customOrder];
}

export function getCustomMainSections(): { key: string; label: string; content: string }[] {
  const order = savedContent.customMainSectionOrder ?? [];
  const sections = savedContent.customMainSections ?? {};
  return order
    .filter((key) => sections[key])
    .map((key) => ({ key, label: sections[key].label, content: sections[key].content }));
}

export function getCustomMainSectionContent(key: string): string | null {
  const sections = savedContent.customMainSections ?? {};
  const item = sections[key];
  return item ? item.content : null;
}

/** Load saved content from storage (Blob or fs) into memory. Call at start of each webhook request so edits persist. */
export async function ensureSavedContentLoaded(): Promise<void> {
  const data = await loadSavedContent();
  savedContent = data ?? {};
}

function readHtmlFile(dir: string, key: string): string {
  const filePath = path.join(dir, `${key}.html`);
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return `<b>Раздел «${key}»</b>\n\nСодержание не найдено.`;
  }
}

export function getLesson(key: string): string {
  if (savedContent?.lessons?.[key]) return savedContent.lessons[key];
  return readHtmlFile(CONTENT_LESSONS, key);
}

export function getFaq(key: string): string {
  if (savedContent?.faq?.[key]) return savedContent.faq[key];
  return readHtmlFile(CONTENT_FAQ, key);
}

export async function setSavedLessonContent(key: string, html: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const lessons = { ...(current.lessons ?? {}) };
  lessons[key] = html;
  savedContent = { ...current, lessons };
  await saveSavedContent(savedContent);
}

export async function setSavedFaqContent(key: string, html: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const faq = { ...(current.faq ?? {}) };
  faq[key] = html;
  savedContent = { ...current, faq };
  await saveSavedContent(savedContent);
}

/** Save the display label for a lesson section (title). */
export async function setSavedLessonLabel(key: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.lessonLabelOverrides ?? {}), [key]: label.trim() };
  savedContent = { ...current, lessonLabelOverrides: labels };
  await saveSavedContent(savedContent);
}

/** Save the display label for an FAQ question (question text). */
export async function setSavedFaqLabel(key: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.faqLabelOverrides ?? {}), [key]: label.trim() };
  savedContent = { ...current, faqLabelOverrides: labels };
  await saveSavedContent(savedContent);
}

/** Save the display label for a main menu section (lessons, ask, contact). */
export async function setSavedMainSectionLabel(id: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.mainSectionLabels ?? {}), [id]: label.trim() };
  savedContent = { ...current, mainSectionLabels: labels };
  await saveSavedContent(savedContent);
}

/** Add a new custom main menu section (label + content). Returns the new key. */
export async function addCustomMainSection(label: string, content: string): Promise<string> {
  const key = slugFromLabelForMain(label);
  const data = await loadSavedContent();
  const current = data ?? {};
  const sections = { ...(current.customMainSections ?? {}), [key]: { label: label.trim(), content: content.trim() } };
  const order = [...(current.customMainSectionOrder ?? [])];
  if (!order.includes(key)) order.push(key);
  savedContent = { ...current, customMainSections: sections, customMainSectionOrder: order };
  await saveSavedContent(savedContent);
  return key;
}

/** Slug for custom main section; prefix to avoid clash with lesson/faq keys. */
function slugFromLabelForMain(label: string): string {
  const base = transliterateCyrillicToLatin(label.trim()).replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!base) return "main_custom_" + Date.now();
  const prefix = "main_";
  const order = savedContent.customMainSectionOrder ?? [];
  const sections = savedContent.customMainSections ?? {};
  let key = prefix + base;
  let n = 0;
  while (sections[key] || order.includes(key)) key = `${prefix}${base}_${++n}`;
  return key;
}

/** Add a new lesson section (label + content). Returns the new key. */
export async function addCustomLesson(label: string, content: string): Promise<string> {
  const key = slugFromLabel(label);
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.customLessonLabels ?? {}), [key]: label };
  const lessons = { ...(current.lessons ?? {}), [key]: content };
  savedContent = { ...current, customLessonLabels: labels, lessons };
  await saveSavedContent(savedContent);
  return key;
}

/** Add a new FAQ question (label + answer). Returns the new key. */
export async function addCustomFaq(label: string, content: string): Promise<string> {
  const key = slugFromLabel(label);
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.customFaqLabels ?? {}), [key]: label };
  const faq = { ...(current.faq ?? {}), [key]: content };
  savedContent = { ...current, customFaqLabels: labels, faq };
  await saveSavedContent(savedContent);
  return key;
}

/** Transliterate Cyrillic to Latin so slug keys stay Latin-only. */
function transliterateCyrillicToLatin(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return Array.from(text.toLowerCase())
    .map((c) => map[c] ?? (c >= "a" && c <= "z" ? c : c >= "0" && c <= "9" ? c : c === " " ? " " : ""))
    .join("");
}

function slugFromLabel(label: string): string {
  const transliterated = transliterateCyrillicToLatin(label.trim());
  const base = transliterated
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!base) return "custom_" + Date.now();
  let key = base;
  let n = 0;
  const allLesson = getAllLessonKeys();
  const allFaq = getAllFaqKeys();
  while (allLesson.includes(key) || allFaq.includes(key)) {
    key = `${base}_${++n}`;
  }
  return key;
}

/** Replace all saved content in memory and persist (used by tests). */
export async function replaceSavedContent(data: SavedContentData): Promise<void> {
  savedContent = data;
  await saveSavedContent(savedContent);
}

export function getSavedContent(): SavedContentData {
  return { ...savedContent };
}

/** Call once at startup after env is loaded (long-polling). For webhook, use ensureSavedContentLoaded() at request start. */
export function initContent(): void {
  // Sync load only when using fs (no Blob token). When using Blob, saved content is loaded per-request via ensureSavedContentLoaded().
  if (
    typeof process.env.BLOB_READ_WRITE_TOKEN !== "string" ||
    process.env.BLOB_READ_WRITE_TOKEN.length === 0
  ) {
    const data = getSavedContentSync();
    savedContent = data ?? {};
  }
}

function getSavedContentSync(): SavedContentData | null {
  try {
    const raw = fs.readFileSync(path.join(PROJECT_ROOT, "data", "overrides.json"), "utf-8");
    return JSON.parse(raw) as SavedContentData;
  } catch {
    return null;
  }
}
