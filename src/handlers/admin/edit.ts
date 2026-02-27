/**
 * Handle admin's next message: edit content or add_admin (called from text handler).
 */

import { Markup } from "telegraf";
import { addAdmin } from "../../config/admins";
import {
  setSavedLessonContent,
  setSavedFaqContent,
  setSavedLessonLabel,
  setSavedFaqLabel,
  getLessonLabel,
  getFaqLabel,
  setSectionLabel,
  addSection,
  addSectionSubItem,
  addCustomLesson,
  addCustomFaq,
  getSections,
  getSectionSubIds,
} from "../../content/loader";
import { getState, clearState, setState } from "../../state/userState";
import { stripHtml } from "../../utils/html";
import { setCommandsForNewAdmin } from "../../botCommands";
import * as C from "./constants";

/** reply can accept optional reply_markup. */
export async function handleAdminEdit(
  userId: number,
  text: string,
  reply: (msg: string, opts?: { reply_markup?: object }) => Promise<unknown>
): Promise<boolean> {
  const state = getState(userId);
  if (!state) return false;
  if (state.type === "awaiting_edit_lesson") {
    await setSavedLessonContent(state.key, stripHtml(text));
    clearState(userId);
    const label = getLessonLabel(state.key);
    await reply(`Раздел «${label}» обновлён.`);
    return true;
  }
  if (state.type === "awaiting_edit_lesson_label") {
    await setSavedLessonLabel(state.key, stripHtml(text));
    clearState(userId);
    await reply(`Название раздела обновлено.`);
    return true;
  }
  if (state.type === "awaiting_edit_faq") {
    await setSavedFaqContent(state.key, stripHtml(text));
    clearState(userId);
    const label = getFaqLabel(state.key);
    await reply(`Ответ «${label}» обновлён.`);
    return true;
  }
  if (state.type === "awaiting_edit_faq_label") {
    await setSavedFaqLabel(state.key, stripHtml(text));
    clearState(userId);
    await reply(`Формулировка вопроса обновлена.`);
    return true;
  }
  if (state.type === "awaiting_edit_main_section_label") {
    await setSectionLabel(state.key, stripHtml(text));
    clearState(userId);
    await reply(`Название пункта главного меню обновлено.`);
    return true;
  }
  if (state.type === "awaiting_new_main_section_label") {
    setState(userId, { type: "awaiting_new_main_section_choice", label: text.trim() });
    await reply(
      `Название раздела: «${text.trim()}». Один блок текста или раздел с подпунктами?`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Один текст", C.ADM_NEW_SEC_FLAT)],
        [Markup.button.callback("С подпунктами", C.ADM_NEW_SEC_NESTED)],
      ])
    );
    return true;
  }
  if (state.type === "awaiting_new_main_section_content") {
    const key = await addSection(state.label, stripHtml(text));
    clearState(userId);
    await reply(`Раздел «${state.label}» добавлен в главное меню (ключ: ${key}).`);
    return true;
  }
  if (state.type === "awaiting_new_main_section_sub_label") {
    setState(userId, { type: "awaiting_new_main_section_sub_content", sectionKey: state.sectionKey, itemLabel: text.trim() });
    await reply(`Отправьте текст подпункта «${text.trim()}».`);
    return true;
  }
  if (state.type === "awaiting_new_main_section_sub_content") {
    await addSectionSubItem(state.sectionKey, state.itemLabel, stripHtml(text));
    setState(userId, { type: "awaiting_new_main_section_sub_more", sectionKey: state.sectionKey });
    await reply(
      "Подпункт добавлен. Отправьте название следующего подпункта или нажмите Готово.",
      Markup.inlineKeyboard([[Markup.button.callback("✅ Готово", `${C.ADM_NEW_SEC_DONE_PREFIX}${state.sectionKey}`)]])
    );
    return true;
  }
  if (state.type === "awaiting_new_main_section_sub_more") {
    setState(userId, { type: "awaiting_new_main_section_sub_content", sectionKey: state.sectionKey, itemLabel: text.trim() });
    await reply(`Отправьте текст подпункта «${text.trim()}».`);
    return true;
  }
  if (state.type === "awaiting_new_lesson_label") {
    setState(userId, { type: "awaiting_new_lesson_content", label: text.trim() });
    await reply(`Название раздела: «${text.trim()}». Теперь отправьте текст раздела.`);
    return true;
  }
  if (state.type === "awaiting_new_lesson_content") {
    const key = await addCustomLesson(state.label, stripHtml(text));
    clearState(userId);
    await reply(`Раздел «${state.label}» добавлен (ключ: ${key}).`);
    return true;
  }
  if (state.type === "awaiting_new_faq_label") {
    setState(userId, { type: "awaiting_new_faq_content", label: text.trim() });
    await reply(`Вопрос: «${text.trim()}». Теперь отправьте текст ответа.`);
    return true;
  }
  if (state.type === "awaiting_new_faq_content") {
    const key = await addCustomFaq(state.label, stripHtml(text));
    clearState(userId);
    await reply(`Вопрос «${state.label}» добавлен (ключ: ${key}).`);
    return true;
  }
  if (state.type === "awaiting_add_admin") {
    clearState(userId);
    const id = text.trim().replace(/\s+/g, "");
    const num = parseInt(id, 10);
    if (Number.isNaN(num) || num.toString() !== id) {
      await reply("Нужно отправить одно число (user ID). Попробуйте снова или отправьте /add_admin.");
      return true;
    }
    await addAdmin(num);
    await setCommandsForNewAdmin(num);
    await reply(`Пользователь ${num} добавлен в админы.`);
    return true;
  }
  return false;
}
