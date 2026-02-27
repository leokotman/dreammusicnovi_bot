/**
 * Loads content from HTML files (content/lessons/, content/faq/).
 * Saved content from storage (Vercel Blob or data/overrides.json) is applied when present.
 */

import * as fs from "fs";
import * as path from "path";
import { loadSavedContent, saveSavedContent, type SavedContentData, type SectionDef } from "../storage";

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTENT_LESSONS = path.join(PROJECT_ROOT, "content", "lessons");
const CONTENT_FAQ = path.join(PROJECT_ROOT, "content", "faq");

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

const DEFAULT_SECTION_LABELS: Record<string, string> = {
  lessons: "Об уроках",
  ask: "Задать вопрос",
  contact: "Связаться с преподавателем",
};

/** Months after which deleted sections are purged from storage. */
export const DELETED_SECTION_RETENTION_MONTHS = 3;

let savedContent: SavedContentData = {};

const hiddenLessonKeys = (): string[] => savedContent.hiddenLessonKeys ?? [];
const hiddenFaqKeys = (): string[] => savedContent.hiddenFaqKeys ?? [];

const hiddenSectionIds = (): string[] => savedContent.hiddenSectionIds ?? [];

function getSectionsMap(): Record<string, SectionDef> {
  return savedContent.sections ?? {};
}

function getSectionOrder(): string[] {
  return savedContent.sectionOrder ?? [];
}

/** Migrate legacy mainSectionLabels/customMainSections to unified sections/sectionOrder/hiddenSectionIds/deletedSections. Exported for one-time Blob migration script. */
export function migrateToUnifiedSections(data: SavedContentData): SavedContentData {
  const hasLegacy =
    (data.mainSectionLabels && Object.keys(data.mainSectionLabels).length > 0) ||
    (data.customMainSections && Object.keys(data.customMainSections).length > 0) ||
    (data.customMainSectionOrder && data.customMainSectionOrder.length > 0) ||
    (data.hiddenMainSectionIds && data.hiddenMainSectionIds.length > 0);
  if (!hasLegacy && data.sectionOrder && data.sectionOrder.length > 0) return data;

  const sections: Record<string, SectionDef> = { ...(data.sections ?? {}) };
  const order: string[] = [...(data.sectionOrder ?? [])];
  const hidden: string[] = [...(data.hiddenSectionIds ?? [])];
  const deleted: Record<string, { dateDeleted: string }> = { ...(data.deletedSections ?? {}) };
  const now = new Date().toISOString();

  if (data.mainSectionLabels || data.customMainSections || data.customMainSectionOrder) {
    const defaultIds = [...DEFAULT_SECTION_IDS];
    for (const id of defaultIds) {
      if (!(id in sections)) {
        sections[id] = {
          label: data.mainSectionLabels?.[id] ?? DEFAULT_SECTION_LABELS[id] ?? id,
          type: id as "lessons" | "ask" | "contact",
        };
      } else if (data.mainSectionLabels?.[id]) {
        sections[id] = { ...sections[id], label: data.mainSectionLabels[id] };
      }
      if (!order.includes(id)) order.push(id);
    }
    const customOrder = data.customMainSectionOrder ?? [];
    const customSections = data.customMainSections ?? {};
    for (const key of customOrder) {
      const s = customSections[key];
      if (!s) continue;
      if ("subItems" in s && s.subItems != null) {
        sections[key] = { label: s.label, type: "nested", subItems: s.subItems, subItemOrder: s.subItemOrder ?? Object.keys(s.subItems) };
      } else {
        sections[key] = { label: s.label, type: "flat", content: (s as { content?: string }).content ?? "" };
      }
      if (!order.includes(key)) order.push(key);
    }
  }

  if (data.hiddenMainSectionIds?.length) {
    for (const id of data.hiddenMainSectionIds) {
      if (!hidden.includes(id)) hidden.push(id);
      if (!deleted[id]) deleted[id] = { dateDeleted: now };
    }
  }

  if (order.length === 0 && Object.keys(sections).length === 0) {
    for (const id of DEFAULT_SECTION_IDS) {
      order.push(id);
      sections[id] = { label: DEFAULT_SECTION_LABELS[id], type: id as "lessons" | "ask" | "contact" };
    }
  }

  const out: SavedContentData = { ...data, sections, sectionOrder: order, hiddenSectionIds: hidden.length ? hidden : undefined, deletedSections: Object.keys(deleted).length ? deleted : undefined };
  delete (out as Record<string, unknown>).mainSectionLabels;
  delete (out as Record<string, unknown>).customMainSections;
  delete (out as Record<string, unknown>).customMainSectionOrder;
  delete (out as Record<string, unknown>).hiddenMainSectionIds;
  return out;
}

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

/** Section label (single-tier sections). */
export function getSectionLabel(id: string): string {
  const s = getSectionsMap()[id];
  if (s) return s.label;
  return DEFAULT_SECTION_LABELS[id] ?? id;
}

/** Ordered list of section ids visible in menu (hidden excluded). */
export function getVisibleSectionIds(): string[] {
  const order = getSectionOrder();
  const hidden = hiddenSectionIds();
  return order.filter((id) => !hidden.includes(id));
}

function getSection(sectionKey: string): SectionDef | undefined {
  return getSectionsMap()[sectionKey];
}

function isSectionNestedDef(section: SectionDef): section is SectionDef & { subItems: Record<string, { label: string; content: string }>; subItemOrder: string[] } {
  return "subItems" in section && section.subItems != null;
}

/** All sections in display order (for admin). Returns { key, label, content } for compatibility. */
export function getSections(): { key: string; label: string; content: string }[] {
  const order = getSectionOrder();
  const sections = getSectionsMap();
  return order
    .filter((key) => sections[key])
    .map((key) => {
      const s = sections[key];
      const content = (s && "content" in s ? s.content : "") ?? "";
      return { key, label: s?.label ?? key, content };
    });
}

export function getSectionContent(key: string): string | null {
  const section = getSection(key);
  if (!section || "subItems" in section) return null;
  return "content" in section ? section.content ?? null : null;
}

/** True if section has sub-items (nested). */
export function isSectionNested(sectionKey: string): boolean {
  const section = getSection(sectionKey);
  return section != null && isSectionNestedDef(section);
}

/** Ordered sub-item keys for a nested section. */
export function getSectionSubIds(sectionKey: string): string[] {
  const section = getSection(sectionKey);
  if (!section || !isSectionNestedDef(section)) return [];
  return section.subItemOrder ?? Object.keys(section.subItems);
}

export function getSectionSubItem(sectionKey: string, itemKey: string): { label: string; content: string } | null {
  const section = getSection(sectionKey);
  if (!section || !isSectionNestedDef(section)) return null;
  const item = section.subItems[itemKey];
  return item ?? null;
}

/** Load saved content from storage (Blob or fs) into memory. Call at start of each webhook request so edits persist. */
export async function ensureSavedContentLoaded(): Promise<void> {
  const raw = await loadSavedContent();
  const data = raw ?? {};
  const hadLegacy = !!(
    (data.mainSectionLabels && Object.keys(data.mainSectionLabels).length > 0) ||
    (data.customMainSections && Object.keys(data.customMainSections).length > 0) ||
    (data.customMainSectionOrder && data.customMainSectionOrder.length > 0) ||
    (data.hiddenMainSectionIds && data.hiddenMainSectionIds.length > 0)
  );
  const migrated = migrateToUnifiedSections(data);
  savedContent = migrated;
  const needsSave = hadLegacy || (!(raw?.sectionOrder?.length) && (migrated.sectionOrder?.length ?? 0) > 0);
  if (needsSave) await saveSavedContent(migrated);
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

/** Save the display label for a section. */
export async function setSectionLabel(id: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const sectionsMap = current.sections ?? {};
  const section = sectionsMap[id] ?? (DEFAULT_SECTION_IDS.includes(id as (typeof DEFAULT_SECTION_IDS)[number]) ? { label: DEFAULT_SECTION_LABELS[id], type: id as "lessons" | "ask" | "contact" } : undefined);
  if (!section) return;
  const updated = { ...section, label: label.trim() };
  const sections = { ...sectionsMap, [id]: updated };
  savedContent = { ...current, sections };
  await saveSavedContent(savedContent);
}

/** Add a new flat section (label + content). Returns the new key. */
export async function addSection(label: string, content: string): Promise<string> {
  const key = slugFromLabelForSection(label);
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const sections: Record<string, SectionDef> = { ...(current.sections ?? {}), [key]: { label: label.trim(), type: "flat", content: content.trim() } };
  const order = [...(current.sectionOrder ?? [])];
  if (!order.includes(key)) order.push(key);
  savedContent = { ...current, sections, sectionOrder: order };
  await saveSavedContent(savedContent);
  return key;
}

/** Create a nested section (no content yet). Returns the new section key. */
export async function addSectionNested(label: string): Promise<string> {
  const key = slugFromLabelForSection(label);
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const sections: Record<string, SectionDef> = {
    ...(current.sections ?? {}),
    [key]: { label: label.trim(), type: "nested", subItems: {} as Record<string, { label: string; content: string }>, subItemOrder: [] as string[] },
  };
  const order = [...(current.sectionOrder ?? [])];
  if (!order.includes(key)) order.push(key);
  savedContent = { ...current, sections, sectionOrder: order };
  await saveSavedContent(savedContent);
  return key;
}

/** Add a sub-item to a nested section. Returns the new item key. */
export async function addSectionSubItem(sectionKey: string, itemLabel: string, content: string): Promise<string> {
  const section = getSection(sectionKey);
  if (!section || !isSectionNestedDef(section)) throw new Error("Section is not nested");
  const existingKeys = section.subItemOrder ?? Object.keys(section.subItems);
  const itemKey = slugForSubItem(itemLabel, existingKeys);
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const sectionsMap = current.sections ?? {};
  const existing = sectionsMap[sectionKey];
  if (!existing || !isSectionNestedDef(existing)) throw new Error("Section not found or not nested");
  const subItems = { ...existing.subItems, [itemKey]: { label: itemLabel.trim(), content: content.trim() } };
  const subItemOrder = [...(existing.subItemOrder ?? []), itemKey];
  const newSections: Record<string, SectionDef> = { ...sectionsMap, [sectionKey]: { ...existing, subItems, subItemOrder } };
  savedContent = { ...current, sections: newSections };
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

/** Slug for section; prefix to avoid clash with default ids. */
function slugFromLabelForSection(label: string): string {
  const base = transliterateCyrillicToLatin(label.trim()).replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!base) return "sec_" + Date.now();
  const prefix = "sec_";
  const order = savedContent.sectionOrder ?? [];
  const sections = savedContent.sections ?? {};
  let key = prefix + base;
  let n = 0;
  while (sections[key] || order.includes(key)) key = `${prefix}${base}_${++n}`;
  return key;
}

/** Hide a section from the menu (soft delete). Stores dateDeleted for 3-month purge. */
export async function hideSection(sectionKey: string): Promise<void> {
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const sections = getSectionsMap();
  if (!(sectionKey in sections)) return;
  const hidden = [...(current.hiddenSectionIds ?? [])];
  if (!hidden.includes(sectionKey)) hidden.push(sectionKey);
  const deleted = { ...(current.deletedSections ?? {}), [sectionKey]: { dateDeleted: new Date().toISOString() } };
  savedContent = { ...current, hiddenSectionIds: hidden, deletedSections: deleted };
  await saveSavedContent(savedContent);
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

/** Hide a section from the menu (soft delete). Sets dateDeleted for runner purge. */
export async function addHiddenSectionId(id: string): Promise<void> {
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const hidden = [...(current.hiddenSectionIds ?? [])];
  if (!hidden.includes(id)) hidden.push(id);
  const deleted = { ...(current.deletedSections ?? {}), [id]: { dateDeleted: new Date().toISOString() } };
  savedContent = { ...current, hiddenSectionIds: hidden, deletedSections: deleted };
  await saveSavedContent(savedContent);
}

/** Restore a hidden section to the menu. Removes from deletedSections. */
export async function removeHiddenSectionId(id: string): Promise<void> {
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const hidden = (current.hiddenSectionIds ?? []).filter((x) => x !== id);
  const deleted = { ...(current.deletedSections ?? {}) };
  delete deleted[id];
  savedContent = {
    ...current,
    hiddenSectionIds: hidden.length ? hidden : undefined,
    deletedSections: Object.keys(deleted).length ? deleted : undefined,
  };
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

/** Ids of sections currently hidden from the menu (restorable until purged). */
export function getHiddenSectionIds(): string[] {
  return [...(savedContent.hiddenSectionIds ?? [])];
}

/** Keys of lesson topics currently hidden from «Об уроках». */
export function getHiddenLessonKeys(): string[] {
  return [...(savedContent.hiddenLessonKeys ?? [])];
}

/** Keys of FAQ questions currently hidden from «Задать вопрос». */
export function getHiddenFaqKeys(): string[] {
  return [...(savedContent.hiddenFaqKeys ?? [])];
}

/** Remove a sub-item from a nested section. */
export async function removeSectionSubItem(sectionKey: string, itemKey: string): Promise<void> {
  const section = getSection(sectionKey);
  if (!section || !isSectionNestedDef(section)) return;
  const data = await loadSavedContent();
  const current = data ?? {};
  const sectionsMap = current.sections ?? {};
  const existing = sectionsMap[sectionKey];
  if (!existing || !isSectionNestedDef(existing)) return;
  const subItems = { ...existing.subItems };
  delete subItems[itemKey];
  const subItemOrder = (existing.subItemOrder ?? []).filter((k) => k !== itemKey);
  const newSections = { ...sectionsMap, [sectionKey]: { ...existing, subItems, subItemOrder } };
  savedContent = { ...current, sections: newSections };
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

/** Purge sections that were deleted more than DELETED_SECTION_RETENTION_MONTHS ago. Call from cron/runner. */
export async function purgeDeletedSectionsOlderThanThreeMonths(): Promise<{ purged: string[] }> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const deleted = current.deletedSections ?? {};
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - DELETED_SECTION_RETENTION_MONTHS);
  const cutoffIso = cutoff.toISOString();
  const toPurge: string[] = [];
  for (const [id, entry] of Object.entries(deleted)) {
    if (entry.dateDeleted <= cutoffIso) toPurge.push(id);
  }
  if (toPurge.length === 0) {
    return { purged: [] };
  }
  const sections = { ...(current.sections ?? {}) };
  const order = (current.sectionOrder ?? []).filter((id) => !toPurge.includes(id));
  const hidden = (current.hiddenSectionIds ?? []).filter((id) => !toPurge.includes(id));
  const newDeleted = { ...deleted };
  for (const id of toPurge) {
    delete sections[id];
    delete newDeleted[id];
  }
  savedContent = {
    ...current,
    sections,
    sectionOrder: order,
    hiddenSectionIds: hidden.length ? hidden : undefined,
    deletedSections: Object.keys(newDeleted).length ? newDeleted : undefined,
  };
  await saveSavedContent(savedContent);
  return { purged: toPurge };
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
    savedContent = migrateToUnifiedSections(data ?? {});
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
