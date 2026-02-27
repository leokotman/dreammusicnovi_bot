/**
 * Sanitize user input before persisting to DB/overrides.
 * Prevents stored XSS, injection, and dangerous URLs.
 */

/** Max length for a single text field in overrides. */
const MAX_TEXT_LENGTH = 50000;

/** Max length for URL/link fields. */
const MAX_URL_LENGTH = 2000;

/** Strip script tags, event handlers, and dangerous protocols. */
function stripDangerousHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\bon\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/\b(javascript|data|vbscript):/gi, "");
}

/**
 * Sanitize plain text or HTML content before saving (lessons, FAQ, labels, section content).
 * Strips dangerous HTML and limits length.
 */
export function sanitizeForDb(text: string): string {
  if (typeof text !== "string") return "";
  const t = stripDangerousHtml(text).trim();
  return t.length > MAX_TEXT_LENGTH ? t.slice(0, MAX_TEXT_LENGTH) : t;
}

/**
 * Sanitize a URL before saving (contact links). Allows only http, https, tel, mailto.
 * For Telegram username we use sanitizeTelegramUsername instead.
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (trimmed.length > MAX_URL_LENGTH) return trimmed.slice(0, MAX_URL_LENGTH);
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return stripDangerousHtml(trimmed);
  }
  return "";
}

/**
 * Sanitize Telegram username (no @, no spaces, alphanumeric and underscores only).
 */
export function sanitizeTelegramUsername(value: string): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/^@/, "").replace(/\s/g, "").trim();
  const safe = cleaned.replace(/[^a-zA-Z0-9_]/g, "");
  return safe.length > 256 ? safe.slice(0, 256) : safe;
}

/**
 * Sanitize email for contact (basic format, no dangerous chars).
 */
export function sanitizeEmail(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length > 320) return trimmed.slice(0, 320);
  return trimmed.replace(/[<>'"\s]/g, "");
}
