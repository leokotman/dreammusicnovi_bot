/**
 * Persistent storage for overrides and admins.
 * On Vercel (when BLOB_READ_WRITE_TOKEN is set): uses Vercel Blob.
 * Otherwise: uses local files in data/.
 */

import { get, put } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const OVERRIDES_PATH = path.join(DATA_DIR, "overrides.json");
const ADMINS_PATH = path.join(DATA_DIR, "admins.json");

const BLOB_PREFIX = "dreammusic";
const BLOB_OVERRIDES = `${BLOB_PREFIX}/overrides.json`;
const BLOB_ADMINS = `${BLOB_PREFIX}/admins.json`;

export type OverridesData = {
  lessons?: Record<string, string>;
  faq?: Record<string, string>;
};

export type AdminsData = { ids: number[] };

function useBlob(): boolean {
  return typeof process.env.BLOB_READ_WRITE_TOKEN === "string" && process.env.BLOB_READ_WRITE_TOKEN.length > 0;
}

/** Read overrides from Blob or local file. */
export async function getOverrides(): Promise<OverridesData | null> {
  if (useBlob()) {
    try {
      const result = await get(BLOB_OVERRIDES, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as OverridesData;
    } catch {
      return null;
    }
  }
  try {
    const raw = fs.readFileSync(OVERRIDES_PATH, "utf-8");
    return JSON.parse(raw) as OverridesData;
  } catch {
    return null;
  }
}

/** Write overrides to Blob or local file. */
export async function setOverrides(data: OverridesData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (useBlob()) {
    await put(BLOB_OVERRIDES, json, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, json, "utf-8");
}

/** Read admins from Blob or local file. */
export async function getAdmins(): Promise<AdminsData | null> {
  if (useBlob()) {
    try {
      const result = await get(BLOB_ADMINS, { access: "private" });
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
