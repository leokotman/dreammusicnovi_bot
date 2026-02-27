/**
 * Admin IDs: from env (TEACHER_USER_ID, DEV_ID, ADMIN_IDS) and from storage (Blob or data/admins.json).
 * Admins added via /add_admin in Telegram are persisted to storage.
 */

import * as fs from "fs";
import * as path from "path";
import { getAdmins, setAdmins } from "../storage";

const idSet = new Set<string>();
const ADMINS_PATH = path.join(process.cwd(), "data", "admins.json");

function useBlob(): boolean {
  return typeof process.env.BLOB_READ_WRITE_TOKEN === "string" && process.env.BLOB_READ_WRITE_TOKEN.length > 0;
}

/** Load env IDs and merge with stored admins. Call at bot start (long-poll). When using Blob, call ensureAdminsLoaded() at each webhook request. */
export function loadAdmins(envIds: string[]): void {
  idSet.clear();
  for (const id of envIds) {
    const t = id.trim();
    if (t) idSet.add(t);
  }
  if (!useBlob()) {
    try {
      const raw = fs.readFileSync(ADMINS_PATH, "utf-8");
      const data = JSON.parse(raw) as { ids?: number[] };
      for (const id of data.ids ?? []) {
        idSet.add(String(id));
      }
    } catch {
      // no file or invalid
    }
  }
}

/** Load stored admins from Blob/fs and merge with env ids. Call at start of each webhook request when using Blob. */
export async function ensureAdminsLoaded(envIds: string[]): Promise<void> {
  idSet.clear();
  for (const id of envIds) {
    const t = id.trim();
    if (t) idSet.add(t);
  }
  const stored = await getAdmins();
  for (const id of stored?.ids ?? []) {
    idSet.add(String(id));
  }
}

export function isAdmin(userId: string): boolean {
  return idSet.has(userId);
}

/** Numeric admin IDs (for setMyCommands scope per chat). */
export function getAdminIds(): number[] {
  return Array.from(idSet)
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

export function hasAnyAdmin(): boolean {
  return idSet.size > 0;
}

export async function addAdmin(userId: number): Promise<void> {
  idSet.add(String(userId));
  const ids = Array.from(idSet)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  await setAdmins({ ids });
}
