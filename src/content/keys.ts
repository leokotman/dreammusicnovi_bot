/**
 * Resolved lesson and FAQ key lists (excluding hidden). Used by lessons, faq, and slug callers.
 */

import { getSavedContent } from "./state";
import { LESSON_KEYS, FAQ_KEYS } from "./constants";

export function getAllLessonKeys(): string[] {
  const data = getSavedContent();
  const hidden = data.hiddenLessonKeys ?? [];
  const fixed = [...LESSON_KEYS].filter((k) => !hidden.includes(k));
  const custom = Object.keys(data.customLessonLabels ?? {}).filter((k) => !hidden.includes(k));
  return [...fixed, ...custom];
}

export function getAllFaqKeys(): string[] {
  const data = getSavedContent();
  const hidden = data.hiddenFaqKeys ?? [];
  const fixed = [...FAQ_KEYS].filter((k) => !hidden.includes(k));
  const custom = Object.keys(data.customFaqLabels ?? {}).filter((k) => !hidden.includes(k));
  return [...fixed, ...custom];
}
