/**
 * Section (main menu) getters and setters. Single-tier: flat or nested.
 */

import { loadSavedContent, saveSavedContent, type SavedContentData, type SectionDef } from "../storage";
import { getSavedContent, setSavedContent } from "./state";
import { migrateToUnifiedSections } from "./migration";
import { DEFAULT_SECTION_IDS, DEFAULT_SECTION_LABELS, DELETED_SECTION_RETENTION_MONTHS } from "./constants";
import { slugFromLabelForSection, slugForSubItem } from "./slug";


function getSectionsMap(): Record<string, SectionDef> {
  return getSavedContent().sections ?? {};
}

function getSectionOrder(): string[] {
  return getSavedContent().sectionOrder ?? [];
}

function hiddenSectionIds(): string[] {
  return getSavedContent().hiddenSectionIds ?? [];
}

function getSection(sectionKey: string): SectionDef | undefined {
  return getSectionsMap()[sectionKey];
}

function isSectionNestedDef(section: SectionDef): section is SectionDef & { subItems: Record<string, { label: string; content: string }>; subItemOrder: string[] } {
  return "subItems" in section && section.subItems != null;
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

/** Save the display label for a section. */
export async function setSectionLabel(id: string, label: string): Promise<void> {
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const sectionsMap = current.sections ?? {};
  const section = sectionsMap[id] ?? (DEFAULT_SECTION_IDS.includes(id as (typeof DEFAULT_SECTION_IDS)[number]) ? { label: DEFAULT_SECTION_LABELS[id], type: id as "lessons" | "ask" | "contact" } : undefined);
  if (!section) return;
  const updated = { ...section, label: label.trim() };
  const sections = { ...sectionsMap, [id]: updated };
  setSavedContent({ ...current, sections });
  await saveSavedContent(getSavedContent());
}

/** Add a new flat section (label + content). Returns the new key. */
export async function addSection(label: string, content: string): Promise<string> {
  const data = await loadSavedContent();
  const migrated = migrateToUnifiedSections(data ?? {});
  const key = slugFromLabelForSection(label, migrated.sectionOrder ?? [], migrated.sections ?? {});
  const sections: Record<string, SectionDef> = { ...(migrated.sections ?? {}), [key]: { label: label.trim(), type: "flat", content: content.trim() } };
  const order = [...(migrated.sectionOrder ?? [])];
  if (!order.includes(key)) order.push(key);
  const next: SavedContentData = { ...migrated, sections, sectionOrder: order };
  setSavedContent(next);
  await saveSavedContent(next);
  return key;
}

/** Create a nested section (no content yet). Returns the new section key. */
export async function addSectionNested(label: string): Promise<string> {
  const data = await loadSavedContent();
  const migrated = migrateToUnifiedSections(data ?? {});
  const key = slugFromLabelForSection(label, migrated.sectionOrder ?? [], migrated.sections ?? {});
  const sections: Record<string, SectionDef> = {
    ...(migrated.sections ?? {}),
    [key]: { label: label.trim(), type: "nested", subItems: {} as Record<string, { label: string; content: string }>, subItemOrder: [] as string[] },
  };
  const order = [...(migrated.sectionOrder ?? [])];
  if (!order.includes(key)) order.push(key);
  const next: SavedContentData = { ...migrated, sections, sectionOrder: order };
  setSavedContent(next);
  await saveSavedContent(next);
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
  const next: SavedContentData = { ...current, sections: newSections };
  setSavedContent(next);
  await saveSavedContent(next);
  return itemKey;
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
  const next: SavedContentData = { ...current, hiddenSectionIds: hidden, deletedSections: deleted };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Hide a section from the menu (soft delete). Sets dateDeleted for runner purge. */
export async function addHiddenSectionId(id: string): Promise<void> {
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const hidden = [...(current.hiddenSectionIds ?? [])];
  if (!hidden.includes(id)) hidden.push(id);
  const deleted = { ...(current.deletedSections ?? {}), [id]: { dateDeleted: new Date().toISOString() } };
  const next: SavedContentData = { ...current, hiddenSectionIds: hidden, deletedSections: deleted };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Restore a hidden section to the menu. Removes from deletedSections. */
export async function removeHiddenSectionId(id: string): Promise<void> {
  const data = await loadSavedContent();
  const current = migrateToUnifiedSections(data ?? {});
  const hidden = (current.hiddenSectionIds ?? []).filter((x) => x !== id);
  const deleted = { ...(current.deletedSections ?? {}) };
  delete deleted[id];
  const next: SavedContentData = {
    ...current,
    hiddenSectionIds: hidden.length ? hidden : undefined,
    deletedSections: Object.keys(deleted).length ? deleted : undefined,
  };
  setSavedContent(next);
  await saveSavedContent(next);
}

/** Ids of sections currently hidden from the menu (restorable until purged). */
export function getHiddenSectionIds(): string[] {
  return [...(getSavedContent().hiddenSectionIds ?? [])];
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
  const newSections: Record<string, SectionDef> = { ...sectionsMap, [sectionKey]: { ...existing, subItems, subItemOrder } };
  const next: SavedContentData = { ...current, sections: newSections };
  setSavedContent(next);
  await saveSavedContent(next);
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
  const next: SavedContentData = {
    ...current,
    sections,
    sectionOrder: order,
    hiddenSectionIds: hidden.length ? hidden : undefined,
    deletedSections: Object.keys(newDeleted).length ? newDeleted : undefined,
  };
  setSavedContent(next);
  await saveSavedContent(next);
  return { purged: toPurge };
}
