/**
 * Slug helpers: transliterate Cyrillic to Latin and generate unique keys.
 */

import type { SectionDef } from "../storage";

/** Transliterate Cyrillic to Latin so slug keys stay Latin-only. */
export function transliterateCyrillicToLatin(text: string): string {
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

export function slugFromLabel(label: string, allLessonKeys: string[], allFaqKeys: string[]): string {
  const transliterated = transliterateCyrillicToLatin(label.trim());
  const base = transliterated
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!base) return "custom_" + Date.now();
  let key = base;
  let n = 0;
  while (allLessonKeys.includes(key) || allFaqKeys.includes(key)) {
    key = `${base}_${++n}`;
  }
  return key;
}

/** Slug for section; prefix to avoid clash with default ids. */
export function slugFromLabelForSection(
  label: string,
  sectionOrder: string[],
  sections: Record<string, SectionDef>
): string {
  const base = transliterateCyrillicToLatin(label.trim()).replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!base) return "sec_" + Date.now();
  const prefix = "sec_";
  let key = prefix + base;
  let n = 0;
  while (sections[key] || sectionOrder.includes(key)) key = `${prefix}${base}_${++n}`;
  return key;
}

export function slugForSubItem(label: string, existingKeys: string[]): string {
  const base = transliterateCyrillicToLatin(label.trim()).replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const prefix = base || "item";
  let key = prefix;
  let n = 0;
  while (existingKeys.includes(key)) key = `${prefix}_${++n}`;
  return key;
}
