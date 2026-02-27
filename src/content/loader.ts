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

const hiddenLessonKeys = (): string[] => savedContent.hiddenLessonKeys ?? [];
const hiddenFaqKeys = (): string[] => savedContent.hiddenFaqKeys ?? [];

export function getAllLessonKeys(): string[] {
  const fixed = [...LESSON_KEYS].filter((k) => !hiddenLessonKeys().includes(k));
  const custom = Object.keys(savedContent.customLessonLabels ?? {}).filter((k) => !hiddenLessonKeys().includes(k));
  return [...fixed, ...custom];
}

export function getAllFaqKeys(): string[] {
  const fixed = [...FAQ_KEYS].filter((k) => !hiddenFaqKeys().includes(k));
  const custom = Object.keys(savedContent.customFaqLabels ?? {}).filter((k) => !hiddenFaqKeys().includes(k));
  return [...fixed, ...custom];
}

export function isLessonKeyFixed(key: string): boolean {
  return (LESSON_KEYS as readonly string[]).includes(key);
}

export function isFaqKeyFixed(key: string): boolean {
  return (FAQ_KEYS as readonly string[]).includes(key);
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

const hiddenMainSectionIds = (): string[] => savedContent.hiddenMainSectionIds ?? [];

/** Ordered list of main menu section ids: fixed three then custom (hidden main sections excluded). */
export function getMainMenuSectionIds(): string[] {
  const fixed = [...MAIN_SECTION_IDS].filter((id) => !hiddenMainSectionIds().includes(id));
  const customOrder = savedContent.customMainSectionOrder ?? [];
  return [...fixed, ...customOrder];
}

type CustomMainSection =
  | { label: string; content: string }
  | { label: string; subItems: Record<string, { label: string; content: string }>; subItemOrder: string[] };

function getCustomSection(sectionKey: string): CustomMainSection | undefined {
  const sections = savedContent.customMainSections ?? {};
  return sections[sectionKey] as CustomMainSection | undefined;
}

function isNestedSection(section: CustomMainSection): section is { label: string; subItems: Record<string, { label: string; content: string }>; subItemOrder: string[] } {
  return "subItems" in section && section.subItems != null;
}

export function getCustomMainSections(): { key: string; label: string; content: string }[] {
  const order = savedContent.customMainSectionOrder ?? [];
  const sections = savedContent.customMainSections ?? {};
  return order
    .filter((key) => sections[key])
    .map((key) => {
      const s = sections[key] as CustomMainSection;
      const content = "content" in s ? s.content : "";
      return { key, label: s.label, content };
    });
}

export function getCustomMainSectionContent(key: string): string | null {
  const section = getCustomSection(key);
  if (!section) return null;
  if (isNestedSection(section)) return null;
  return section.content ?? null;
}

/** True if custom section has sub-items (nested). */
export function isCustomSectionNested(sectionKey: string): boolean {
  const section = getCustomSection(sectionKey);
  return section != null && isNestedSection(section);
}

/** Ordered sub-item keys for a nested custom section. */
export function getCustomMainSectionSubIds(sectionKey: string): string[] {
  const section = getCustomSection(sectionKey);
  if (!section || !isNestedSection(section)) return [];
  return section.subItemOrder ?? Object.keys(section.subItems);
}

export function getCustomMainSectionSubItem(sectionKey: string, itemKey: string): { label: string; content: string } | null {
  const section = getCustomSection(sectionKey);
  if (!section || !isNestedSection(section)) return null;
  const item = section.subItems[itemKey];
  return item ?? null;
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

/** Add a new custom main menu section (flat: label + content). Returns the new key. */
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

/** Create a nested custom main section (no content yet). Returns the new section key. */
export async function createCustomMainSectionNested(label: string): Promise<string> {
  const key = slugFromLabelForMain(label);
  const data = await loadSavedContent();
  const current = data ?? {};
  const sections = {
    ...(current.customMainSections ?? {}),
    [key]: { label: label.trim(), subItems: {} as Record<string, { label: string; content: string }>, subItemOrder: [] as string[] },
  };
  const order = [...(current.customMainSectionOrder ?? [])];
  if (!order.includes(key)) order.push(key);
  savedContent = { ...current, customMainSections: sections, customMainSectionOrder: order };
  await saveSavedContent(savedContent);
  return key;
}

/** Add a sub-item to a nested custom main section. Returns the new item key. */
export async function addCustomMainSectionSubItem(sectionKey: string, itemLabel: string, content: string): Promise<string> {
  const section = getCustomSection(sectionKey);
  if (!section || !isNestedSection(section)) throw new Error("Section is not nested");
  const existingKeys = section.subItemOrder ?? Object.keys(section.subItems);
  const itemKey = slugForSubItem(itemLabel, existingKeys);
  const data = await loadSavedContent();
  const current = data ?? {};
  const sections = current.customMainSections ?? {};
  const existing = sections[sectionKey] as { label: string; subItems: Record<string, { label: string; content: string }>; subItemOrder: string[] } | undefined;
  if (!existing || !("subItems" in existing)) throw new Error("Section not found or not nested");
  const subItems = { ...existing.subItems, [itemKey]: { label: itemLabel.trim(), content: content.trim() } };
  const subItemOrder = [...(existing.subItemOrder ?? []), itemKey];
  const newSections = { ...sections, [sectionKey]: { ...existing, subItems, subItemOrder } };
  savedContent = { ...current, customMainSections: newSections };
  await saveSavedContent(savedContent);
  return itemKey;
}

function slugForSubItem(label: string, existingKeys: string[]): string {
  const base = transliterateCyrillicToLatin(label.trim()).replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const prefix = base || "item";
  let key = prefix;
  let n = 0;
  while (existingKeys.includes(key)) key = `${prefix}_${++n}`;
  return key;
}

/** Remove a custom main section and all its content/sub-items. */
export async function removeCustomMainSection(sectionKey: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const sections = { ...(current.customMainSections ?? {}) };
  if (!(sectionKey in sections)) return;
  delete sections[sectionKey];
  const order = (current.customMainSectionOrder ?? []).filter((k) => k !== sectionKey);
  savedContent = { ...current, customMainSections: sections, customMainSectionOrder: order };
  await saveSavedContent(savedContent);
}

/** Update the display label of a custom main section. */
export async function setSavedCustomMainSectionLabel(sectionKey: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const sections = current.customMainSections ?? {};
  const section = sections[sectionKey] as CustomMainSection | undefined;
  if (!section) return;
  const updated = { ...section, label: label.trim() };
  const newSections = { ...sections, [sectionKey]: updated };
  savedContent = { ...current, customMainSections: newSections };
  await saveSavedContent(savedContent);
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

/** Hide a lesson topic (fixed or custom) from the list; content is not deleted. */
export async function addHiddenLessonKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = [...(current.hiddenLessonKeys ?? [])];
  if (!hidden.includes(key)) hidden.push(key);
  savedContent = { ...current, hiddenLessonKeys: hidden };
  await saveSavedContent(savedContent);
}

/** Remove a custom lesson topic entirely (label + content). No-op for fixed keys. */
export async function removeCustomLesson(key: string): Promise<void> {
  if (isLessonKeyFixed(key)) return;
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.customLessonLabels ?? {}) };
  const lessons = { ...(current.lessons ?? {}) };
  delete labels[key];
  delete lessons[key];
  const hidden = (current.hiddenLessonKeys ?? []).filter((k) => k !== key);
  savedContent = { ...current, customLessonLabels: labels, lessons, hiddenLessonKeys: hidden.length ? hidden : undefined };
  await saveSavedContent(savedContent);
}

/** Hide an FAQ question (fixed or custom) from the list. */
export async function addHiddenFaqKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = [...(current.hiddenFaqKeys ?? [])];
  if (!hidden.includes(key)) hidden.push(key);
  savedContent = { ...current, hiddenFaqKeys: hidden };
  await saveSavedContent(savedContent);
}

/** Remove a custom FAQ question entirely. No-op for fixed keys. */
export async function removeCustomFaq(key: string): Promise<void> {
  if (isFaqKeyFixed(key)) return;
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.customFaqLabels ?? {}) };
  const faq = { ...(current.faq ?? {}) };
  delete labels[key];
  delete faq[key];
  const hidden = (current.hiddenFaqKeys ?? []).filter((k) => k !== key);
  savedContent = { ...current, customFaqLabels: labels, faq, hiddenFaqKeys: hidden.length ? hidden : undefined };
  await saveSavedContent(savedContent);
}

/** Hide a main section (lessons, ask, contact) from the main menu. */
export async function addHiddenMainSectionId(id: string): Promise<void> {
  if (!MAIN_SECTION_IDS.includes(id as (typeof MAIN_SECTION_IDS)[number])) return;
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = [...(current.hiddenMainSectionIds ?? [])];
  if (!hidden.includes(id)) hidden.push(id);
  savedContent = { ...current, hiddenMainSectionIds: hidden };
  await saveSavedContent(savedContent);
}

/** Restore a hidden main section to the main menu. */
export async function removeHiddenMainSectionId(id: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = (current.hiddenMainSectionIds ?? []).filter((x) => x !== id);
  savedContent = { ...current, hiddenMainSectionIds: hidden.length ? hidden : undefined };
  await saveSavedContent(savedContent);
}

/** Restore a hidden lesson topic to the list. */
export async function removeHiddenLessonKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = (current.hiddenLessonKeys ?? []).filter((x) => x !== key);
  savedContent = { ...current, hiddenLessonKeys: hidden.length ? hidden : undefined };
  await saveSavedContent(savedContent);
}

/** Restore a hidden FAQ question to the list. */
export async function removeHiddenFaqKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = (current.hiddenFaqKeys ?? []).filter((x) => x !== key);
  savedContent = { ...current, hiddenFaqKeys: hidden.length ? hidden : undefined };
  await saveSavedContent(savedContent);
}

/** Ids of main sections currently hidden from the main menu. */
export function getHiddenMainSectionIds(): string[] {
  return [...(savedContent.hiddenMainSectionIds ?? [])];
}

/** Keys of lesson topics currently hidden from «Об уроках». */
export function getHiddenLessonKeys(): string[] {
  return [...(savedContent.hiddenLessonKeys ?? [])];
}

/** Keys of FAQ questions currently hidden from «Задать вопрос». */
export function getHiddenFaqKeys(): string[] {
  return [...(savedContent.hiddenFaqKeys ?? [])];
}

/** Remove a sub-item from a nested custom main section. */
export async function removeCustomMainSectionSubItem(sectionKey: string, itemKey: string): Promise<void> {
  const section = getCustomSection(sectionKey);
  if (!section || !isNestedSection(section)) return;
  const data = await loadSavedContent();
  const current = data ?? {};
  const sections = current.customMainSections ?? {};
  const existing = sections[sectionKey] as { label: string; subItems: Record<string, { label: string; content: string }>; subItemOrder: string[] } | undefined;
  if (!existing || !("subItems" in existing)) return;
  const subItems = { ...existing.subItems };
  delete subItems[itemKey];
  const subItemOrder = (existing.subItemOrder ?? []).filter((k) => k !== itemKey);
  const newSections = { ...sections, [sectionKey]: { ...existing, subItems, subItemOrder } };
  savedContent = { ...current, customMainSections: newSections };
  await saveSavedContent(savedContent);
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
