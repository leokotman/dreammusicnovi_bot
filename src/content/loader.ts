/**
 * Loads content from HTML files (content/lessons/, content/faq/).
 * Saved content from storage (Vercel Blob or data/overrides.json) is applied when present.
 * Facade: re-exports from content/* and provides getLesson/getFaq (file + saved overlay).
 */

import * as fs from "fs";
import * as path from "path";
import { getSavedContent } from "./state";

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTENT_LESSONS = path.join(PROJECT_ROOT, "content", "lessons");
const CONTENT_FAQ = path.join(PROJECT_ROOT, "content", "faq");

function readHtmlFile(dir: string, key: string): string {
  const filePath = path.join(dir, `${key}.html`);
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return `<b>Раздел «${key}»</b>\n\nСодержание не найдено.`;
  }
}

export function getLesson(key: string): string {
  const data = getSavedContent();
  if (data?.lessons?.[key]) return data.lessons[key];
  return readHtmlFile(CONTENT_LESSONS, key);
}

export function getFaq(key: string): string {
  const data = getSavedContent();
  if (data?.faq?.[key]) return data.faq[key];
  return readHtmlFile(CONTENT_FAQ, key);
}

// Re-export constants and types
export {
  DEFAULT_SECTION_IDS,
  LESSON_KEYS,
  FAQ_KEYS,
  FIXED_LESSON_LABELS,
  FIXED_FAQ_LABELS,
  DEFAULT_SECTION_LABELS,
  DELETED_SECTION_RETENTION_MONTHS,
  type LessonKey,
  type FaqKey,
} from "./constants";

export { migrateToUnifiedSections } from "./migration";

export {
  ensureSavedContentLoaded,
  getSavedContent,
  replaceSavedContent,
  initContent,
} from "./state";

export {
  getSectionLabel,
  getVisibleSectionIds,
  getSections,
  getSectionContent,
  isSectionNested,
  getSectionSubIds,
  getSectionSubItem,
  setSectionLabel,
  addSection,
  addSectionNested,
  addSectionSubItem,
  hideSection,
  removeSectionSubItem,
  addHiddenSectionId,
  removeHiddenSectionId,
  getHiddenSectionIds,
  purgeDeletedSectionsOlderThanThreeMonths,
} from "./sections";

export {
  getAllLessonKeys,
  getLessonLabel,
  isLessonKeyFixed,
  setSavedLessonContent,
  setSavedLessonLabel,
  addCustomLesson,
  addHiddenLessonKey,
  removeCustomLesson,
  removeHiddenLessonKey,
  getHiddenLessonKeys,
} from "./lessons";

export {
  getAllFaqKeys,
  getFaqLabel,
  isFaqKeyFixed,
  setSavedFaqContent,
  setSavedFaqLabel,
  addCustomFaq,
  addHiddenFaqKey,
  removeCustomFaq,
  removeHiddenFaqKey,
  getHiddenFaqKeys,
} from "./faq";
