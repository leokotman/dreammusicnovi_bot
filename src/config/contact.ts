/**
 * Resolved contact links: overrides from storage (admin-editable) with env fallback.
 */

import { getSavedContent } from "../content/state";
import { contact as envContact } from "./env";

export function getContact(): {
  telegramUsername: string;
  instagramUrl: string;
  email: string;
} {
  const overrides = getSavedContent().contactOverrides ?? {};
  return {
    telegramUsername: overrides.telegramUsername ?? envContact.telegramUsername,
    instagramUrl: overrides.instagramUrl ?? envContact.instagramUrl,
    email: overrides.email ?? envContact.email,
  };
}
