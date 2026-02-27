/**
 * One-time migration from legacy mainSectionLabels/customMainSections to unified sections/sectionOrder.
 */

import type { SavedContentData, SectionDef } from "../storage";
import { DEFAULT_SECTION_IDS, DEFAULT_SECTION_LABELS } from "./constants";

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
