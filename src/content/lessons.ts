/**
 * Lesson (Об уроках) getters and setters.
 */

import { loadSavedContent, saveSavedContent } from "../storage";
import { getSavedContent, setSavedContent } from "./state";
import { LESSON_KEYS, FIXED_LESSON_LABELS } from "./constants";
import { slugFromLabel } from "./slug";
import { getAllLessonKeys, getAllFaqKeys } from "./keys";

function hiddenLessonKeys(): string[] {
  return getSavedContent().hiddenLessonKeys ?? [];
}

export { getAllLessonKeys } from "./keys";

export function isLessonKeyFixed(key: string): boolean {
  return (LESSON_KEYS as readonly string[]).includes(key);
}

export function getLessonLabel(key: string): string {
  const data = getSavedContent();
  return data.lessonLabelOverrides?.[key] ?? FIXED_LESSON_LABELS[key] ?? data.customLessonLabels?.[key] ?? key;
}

export async function setSavedLessonContent(key: string, html: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const lessons = { ...(current.lessons ?? {}) };
  lessons[key] = html;
  const next = { ...current, lessons };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Save the display label for a lesson section (title). */
export async function setSavedLessonLabel(key: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.lessonLabelOverrides ?? {}), [key]: label.trim() };
  const next = { ...current, lessonLabelOverrides: labels };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Add a new lesson section (label + content). Returns the new key. */
export async function addCustomLesson(label: string, content: string): Promise<string> {
  const key = slugFromLabel(label, getAllLessonKeys(), getAllFaqKeys());
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.customLessonLabels ?? {}), [key]: label };
  const lessons = { ...(current.lessons ?? {}), [key]: content };
  const next = { ...current, customLessonLabels: labels, lessons };
  setSavedContent(next);
  await saveSavedContent(next);
  return key;
}

/** Hide a lesson topic (fixed or custom) from the list; content is not deleted. */
export async function addHiddenLessonKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = [...(current.hiddenLessonKeys ?? [])];
  if (!hidden.includes(key)) hidden.push(key);
  const next = { ...current, hiddenLessonKeys: hidden };
  setSavedContent(next);
  await saveSavedContent(next);
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
  const next = { ...current, customLessonLabels: labels, lessons, hiddenLessonKeys: hidden.length ? hidden : undefined };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Restore a hidden lesson topic to the list. */
export async function removeHiddenLessonKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = (current.hiddenLessonKeys ?? []).filter((x) => x !== key);
  const next = { ...current, hiddenLessonKeys: hidden.length ? hidden : undefined };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Keys of lesson topics currently hidden from «Об уроках». */
export function getHiddenLessonKeys(): string[] {
  return [...(getSavedContent().hiddenLessonKeys ?? [])];
}
