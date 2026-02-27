/**
 * Contact link overrides (admin-editable). Stored in overrides; env used as fallback.
 */

import { loadSavedContent, saveSavedContent } from "../storage";
import { getSavedContent, setSavedContent } from "./state";
import { sanitizeTelegramUsername, sanitizeUrl, sanitizeEmail } from "../utils/sanitize";

export type ContactField = "telegramUsername" | "instagramUrl" | "email";

export function getContactOverrides(): {
  telegramUsername?: string;
  instagramUrl?: string;
  email?: string;
} {
  return { ...getSavedContent().contactOverrides };
}

export async function setContactOverride(
  field: ContactField,
  value: string
): Promise<void> {
  const data = await loadSavedContent();
  const current = data ?? {};
  const overrides = { ...(current.contactOverrides ?? {}) };
  if (field === "telegramUsername") {
    overrides.telegramUsername = sanitizeTelegramUsername(value) || undefined;
  } else if (field === "instagramUrl") {
    const url = sanitizeUrl(value);
    overrides.instagramUrl = url || undefined;
  } else if (field === "email") {
    overrides.email = sanitizeEmail(value) || undefined;
  }
  const next = { ...current, contactOverrides: overrides };
  setSavedContent(next);
  await saveSavedContent(next);
}
