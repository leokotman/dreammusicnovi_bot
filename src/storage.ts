/**
 * Persistent storage for saved content (admin edits) and admins.
 * On Vercel (when BLOB_READ_WRITE_TOKEN is set): uses Vercel Blob.
 * Otherwise: uses local files in data/.
 */

import { get, put } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(PROJECT_ROOT, "data");
/** File name kept as overrides.json for backward compatibility with existing deployments. */
const SAVED_CONTENT_PATH = path.join(DATA_DIR, "overrides.json");
const ADMINS_PATH = path.join(DATA_DIR, "admins.json");

const BLOB_PREFIX = "dreammusic";
const BLOB_SAVED_CONTENT = `${BLOB_PREFIX}/overrides.json`;
const BLOB_ADMINS = `${BLOB_PREFIX}/admins.json`;

export type SavedContentData = {
  lessons?: Record<string, string>;
  faq?: Record<string, string>;
  /** Custom lesson sections (key -> label). Content in lessons. */
  customLessonLabels?: Record<string, string>;
  /** Custom FAQ questions (key -> label). Content in faq. */
  customFaqLabels?: Record<string, string>;
  /** Saved display label for lesson sections (built-in or custom). */
  lessonLabelOverrides?: Record<string, string>;
  /** Saved display label for FAQ questions (built-in or custom). */
  faqLabelOverrides?: Record<string, string>;
};

export type AdminsData = { ids: number[] };

function useBlob(): boolean {
  return typeof process.env.BLOB_READ_WRITE_TOKEN === "string" && process.env.BLOB_READ_WRITE_TOKEN.length > 0;
}

/** Load saved content from Blob or local file. */
export async function loadSavedContent(): Promise<SavedContentData | null> {
  if (useBlob()) {
    try {
      // useCache: false so we always get a body (200); 304 returns stream: null and would cause merge-with-empty then overwrite.
      const result = await get(BLOB_SAVED_CONTENT, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as SavedContentData;
    } catch {
      return null;
    }
  }
  try {
    const raw = fs.readFileSync(SAVED_CONTENT_PATH, "utf-8");
    return JSON.parse(raw) as SavedContentData;
  } catch {
    return null;
  }
}

/** Save content to Blob or local file. */
export async function saveSavedContent(data: SavedContentData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (useBlob()) {
    await put(BLOB_SAVED_CONTENT, json, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SAVED_CONTENT_PATH, json, "utf-8");
}

/** Read admins from Blob or local file. */
export async function getAdmins(): Promise<AdminsData | null> {
  if (useBlob()) {
    try {
      const result = await get(BLOB_ADMINS, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as AdminsData;
    } catch {
      return null;
    }
  }
  try {
    const raw = fs.readFileSync(ADMINS_PATH, "utf-8");
    return JSON.parse(raw) as AdminsData;
  } catch {
    return null;
  }
}

/** Write admins to Blob or local file. */
export async function setAdmins(data: AdminsData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (useBlob()) {
    await put(BLOB_ADMINS, json, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ADMINS_PATH, json, "utf-8");
}
