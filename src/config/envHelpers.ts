/**
 * Pure helpers for env parsing (testable without loading .env).
 */

export function parseAdminIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
