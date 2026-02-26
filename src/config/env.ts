/**
 * Environment and config.
 * Required: BOT_TOKEN (from BotFather).
 * Optional: contact links, teacher chat ID (for forwarding questions), teacher user ID (for admin).
 * Loads .env and .env.local (local overrides) from project root.
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

export const env = {
  BOT_TOKEN: requireEnv("BOT_TOKEN"),
  NODE_ENV: getEnv("NODE_ENV") ?? "development",
  /** Telegram chat ID where to forward "ask your question" messages (e.g. teacher's private chat) */
  TEACHER_CHAT_ID: getEnv("TEACHER_CHAT_ID"),
  /** Telegram user ID of the teacher — only this user can use /admin and edit content */
  TEACHER_USER_ID: getEnv("TEACHER_USER_ID"),
} as const;

export const contact = {
  telegramUsername: getEnv("TEACHER_TELEGRAM") ?? "your_teacher_username",
  instagramUrl: getEnv("TEACHER_INSTAGRAM") ?? "https://instagram.com/",
  email: getEnv("TEACHER_EMAIL") ?? "teacher@example.com",
} as const;
