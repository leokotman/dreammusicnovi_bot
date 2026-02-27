/**
 * In-memory saved content state. Load/save from storage and migration.
 */

import * as fs from "fs";
import * as path from "path";
import { loadSavedContent, saveSavedContent, type SavedContentData } from "../storage";
import { migrateToUnifiedSections } from "./migration";

const PROJECT_ROOT = path.resolve(process.cwd());
const DATA_OVERRIDES_PATH = path.join(PROJECT_ROOT, "data", "overrides.json");

let savedContent: SavedContentData = {};

export function getSavedContent(): SavedContentData {
  return { ...savedContent };
}

export function setSavedContent(data: SavedContentData): void {
  savedContent = data;
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

/** Replace all saved content in memory and persist (used by tests). */
export async function replaceSavedContent(data: SavedContentData): Promise<void> {
  savedContent = data;
  await saveSavedContent(savedContent);
}

/** Call once at startup after env is loaded (long-polling). For webhook, use ensureSavedContentLoaded() at request start. */
export function initContent(): void {
  if (
    typeof process.env.BLOB_READ_WRITE_TOKEN !== "string" ||
    process.env.BLOB_READ_WRITE_TOKEN.length === 0
  ) {
    const data = getSavedContentSync();
    savedContent = migrateToUnifiedSections(data ?? {});
  }
}

export function getSavedContentSync(): SavedContentData | null {
  try {
    const raw = fs.readFileSync(DATA_OVERRIDES_PATH, "utf-8");
    return JSON.parse(raw) as SavedContentData;
  } catch {
    return null;
  }
}
