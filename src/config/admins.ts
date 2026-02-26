/**
 * Admin IDs: from env (TEACHER_USER_ID, DEV_ID, ADMIN_IDS) and from data/admins.json.
 * Admins added via /add_admin in Telegram are stored in data/admins.json (no server/env change).
 */

import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(process.cwd());
const ADMINS_PATH = path.join(PROJECT_ROOT, "data", "admins.json");

const idSet = new Set<string>();

export function loadAdmins(envIds: string[]): void {
  idSet.clear();
  for (const id of envIds) {
    const t = id.trim();
    if (t) idSet.add(t);
  }
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

export function isAdmin(userId: string): boolean {
  return idSet.has(userId);
}

export function hasAnyAdmin(): boolean {
  return idSet.size > 0;
}

export function addAdmin(userId: number): void {
  idSet.add(String(userId));
  const dir = path.dirname(ADMINS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ids = Array.from(idSet).map(Number).filter((n) => !Number.isNaN(n));
  fs.writeFileSync(ADMINS_PATH, JSON.stringify({ ids }, null, 2), "utf-8");
}
