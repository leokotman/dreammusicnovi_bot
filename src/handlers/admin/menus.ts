/**
 * Admin inline menu builders.
 */

import type { Context } from "telegraf";
import { Markup } from "telegraf";
import { isAdmin } from "../../config/admins";
import {
  getSectionLabel,
  getVisibleSectionIds,
  getAllLessonKeys,
  getAllFaqKeys,
  getLessonLabel,
  getFaqLabel,
  getHiddenSectionIds,
  getHiddenLessonKeys,
  getHiddenFaqKeys,
} from "../../content/loader";
import { stripHtml } from "../../utils/html";
import * as C from "./constants";

export function canUseAdmin(ctx: Context): boolean {
  const id = ctx.from?.id?.toString();
  return id !== undefined && isAdmin(id);
}

export function truncateForPreview(text: string): string {
  const plain = stripHtml(text);
  if (plain.length <= C.MAX_PREVIEW_LEN) return plain;
  return plain.slice(0, C.MAX_PREVIEW_LEN) + "\n\n... (текст обрезан)";
}

export function getAdminMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 Разделы и подразделы", C.ADM_MAIN_MENU)],
    [Markup.button.callback("↩️ Восстановить удалённое", C.ADM_RESTORE)],
  ]);
}

export function getAdminRestoreMenu() {
  const hiddenSections = getHiddenSectionIds();
  const hiddenLessons = getHiddenLessonKeys();
  const hiddenFaq = getHiddenFaqKeys();
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
  hiddenSections.forEach((id) => {
    const label = getSectionLabel(id);
    buttons.push([Markup.button.callback(`📌 ${label}`, `${C.ADM_RESTORE_SECTION_PREFIX}${id}`)]);
  });
  const lessonsLabel = getSectionLabel("lessons");
  hiddenLessons.forEach((key) => {
    const label = getLessonLabel(key);
    buttons.push([Markup.button.callback(`📝 ${label}`, `${C.ADM_RESTORE_LESSON_PREFIX}${key}`)]);
  });
  const askLabel = getSectionLabel("ask");
  hiddenFaq.forEach((key) => {
    const label = getFaqLabel(key);
    buttons.push([Markup.button.callback(`❓ ${label}`, `${C.ADM_RESTORE_FAQ_PREFIX}${key}`)]);
  });
  buttons.push([Markup.button.callback("◀️ Назад", C.ADM_MAIN)]);
  return Markup.inlineKeyboard(buttons);
}

export function getAdminRestoreMessage(): string {
  const hiddenSections = getHiddenSectionIds();
  const hiddenLessons = getHiddenLessonKeys();
  const hiddenFaq = getHiddenFaqKeys();
  const total = hiddenSections.length + hiddenLessons.length + hiddenFaq.length;
  if (total === 0) {
    return "Нет удалённых разделов для восстановления.";
  }
  return "<b>Восстановить удалённые разделы</b>\n\nВыберите раздел или подраздел для восстановления:";
}

export function getAdminMainMenuSubmenu() {
  const visibleIds = getVisibleSectionIds();
  const sectionButtons = visibleIds.map((id) =>
    Markup.button.callback(getSectionLabel(id), `${C.ADM_SECTION_PREFIX}${id}`)
  );
  return Markup.inlineKeyboard([
    ...sectionButtons.map((b) => [b]),
    [Markup.button.callback("➕ Добавить раздел", C.ADM_ADD_MAIN_SECTION)],
    [Markup.button.callback("◀️ Назад", C.ADM_MAIN)],
  ]);
}

export function getAdminLessonsMenu() {
  const keys = getAllLessonKeys();
  const buttons = keys.map((key) =>
    Markup.button.callback(getLessonLabel(key), `${C.ADM_LESSON_SEL_PREFIX}${key}`)
  );
  return Markup.inlineKeyboard([
    ...buttons.map((b) => [b]),
    [Markup.button.callback("➕ Добавить раздел", C.ADM_ADD_LESSON)],
    [Markup.button.callback("◀️ Назад к разделам", C.ADM_MAIN_MENU)],
  ]);
}

export function getAdminFaqMenu() {
  const keys = getAllFaqKeys();
  const buttons = keys.map((key) =>
    Markup.button.callback(getFaqLabel(key), `${C.ADM_FAQ_SEL_PREFIX}${key}`)
  );
  return Markup.inlineKeyboard([
    ...buttons.map((b) => [b]),
    [Markup.button.callback("➕ Добавить вопрос", C.ADM_ADD_FAQ)],
    [Markup.button.callback("◀️ Назад к разделам", C.ADM_MAIN_MENU)],
  ]);
}
