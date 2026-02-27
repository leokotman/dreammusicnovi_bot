/**
 * FAQ (Задать вопрос) getters and setters.
 */

import { loadSavedContent, saveSavedContent } from "../storage";
import { getSavedContent, setSavedContent } from "./state";
import { FAQ_KEYS, FIXED_FAQ_LABELS } from "./constants";
import { slugFromLabel } from "./slug";
import { getAllLessonKeys, getAllFaqKeys } from "./keys";

function hiddenFaqKeys(): string[] {
  return getSavedContent().hiddenFaqKeys ?? [];
}

export { getAllFaqKeys } from "./keys";

export function isFaqKeyFixed(key: string): boolean {
  return (FAQ_KEYS as readonly string[]).includes(key);
}

export function getFaqLabel(key: string): string {
  const data = getSavedContent();
  return data.faqLabelOverrides?.[key] ?? FIXED_FAQ_LABELS[key] ?? data.customFaqLabels?.[key] ?? key;
}

export async function setSavedFaqContent(key: string, html: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const faq = { ...(current.faq ?? {}) };
  faq[key] = html;
  const next = { ...current, faq };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Save the display label for an FAQ question (question text). */
export async function setSavedFaqLabel(key: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.faqLabelOverrides ?? {}), [key]: label.trim() };
  const next = { ...current, faqLabelOverrides: labels };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Add a new FAQ question (label + answer). Returns the new key. */
export async function addCustomFaq(label: string, content: string): Promise<string> {
  const key = slugFromLabel(label, getAllLessonKeys(), getAllFaqKeys());
  const data = await loadSavedContent();
  const current = data ?? {};
  const labels = { ...(current.customFaqLabels ?? {}), [key]: label };
  const faq = { ...(current.faq ?? {}), [key]: content };
  const next = { ...current, customFaqLabels: labels, faq };
  setSavedContent(next);
  await saveSavedContent(next);
  return key;
}

/** Hide an FAQ question (fixed or custom) from the list. */
export async function addHiddenFaqKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = [...(current.hiddenFaqKeys ?? [])];
  if (!hidden.includes(key)) hidden.push(key);
  const next = { ...current, hiddenFaqKeys: hidden };
  setSavedContent(next);
  await saveSavedContent(next);
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
  const next = { ...current, customFaqLabels: labels, faq, hiddenFaqKeys: hidden.length ? hidden : undefined };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Restore a hidden FAQ question to the list. */
export async function removeHiddenFaqKey(key: string): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const hidden = (current.hiddenFaqKeys ?? []).filter((x) => x !== key);
  const next = { ...current, hiddenFaqKeys: hidden.length ? hidden : undefined };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Keys of FAQ questions currently hidden from «Задать вопрос». */
export function getHiddenFaqKeys(): string[] {
  return [...(getSavedContent().hiddenFaqKeys ?? [])];
}
