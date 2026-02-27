/**
 * Strip all HTML tags from a string. Used so admin-edited content is plain text only.
 */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

/**
 * Escape a string so it can be embedded in a Telegram HTML message without being parsed as tags.
 */
export function escapeForTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
