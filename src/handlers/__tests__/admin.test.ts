import { handleAdminEdit } from "../admin";
import * as adminsModule from "../../config/admins";
import * as botCommandsModule from "../../botCommands";
import * as loader from "../../content/loader";
import * as userState from "../../state/userState";

jest.mock("../../content/loader", () => ({
  setSavedLessonContent: jest.fn().mockResolvedValue(undefined),
  setSavedFaqContent: jest.fn().mockResolvedValue(undefined),
  setSavedLessonLabel: jest.fn().mockResolvedValue(undefined),
  setSavedFaqLabel: jest.fn().mockResolvedValue(undefined),
  setSectionLabel: jest.fn().mockResolvedValue(undefined),
  getLessonLabel: jest.fn((key: string) => `Label-${key}`),
  getFaqLabel: jest.fn((key: string) => `Faq-${key}`),
  getSectionLabel: jest.fn((id: string) => `Section-${id}`),
  addCustomLesson: jest.fn().mockResolvedValue("new_lesson_key"),
  addCustomFaq: jest.fn().mockResolvedValue("new_faq_key"),
  addSection: jest.fn().mockResolvedValue("sec_1"),
  addSectionNested: jest.fn().mockResolvedValue("sec_raspisaniye"),
  addSectionSubItem: jest.fn().mockResolvedValue("item_1"),
  hideSection: jest.fn().mockResolvedValue(undefined),
  removeSectionSubItem: jest.fn().mockResolvedValue(undefined),
  addHiddenLessonKey: jest.fn().mockResolvedValue(undefined),
  removeCustomLesson: jest.fn().mockResolvedValue(undefined),
  addHiddenFaqKey: jest.fn().mockResolvedValue(undefined),
  removeCustomFaq: jest.fn().mockResolvedValue(undefined),
  addHiddenSectionId: jest.fn().mockResolvedValue(undefined),
  removeHiddenSectionId: jest.fn().mockResolvedValue(undefined),
  removeHiddenLessonKey: jest.fn().mockResolvedValue(undefined),
  removeHiddenFaqKey: jest.fn().mockResolvedValue(undefined),
  getHiddenSectionIds: jest.fn().mockReturnValue([]),
  getHiddenLessonKeys: jest.fn().mockReturnValue([]),
  getHiddenFaqKeys: jest.fn().mockReturnValue([]),
  getVisibleSectionIds: jest.fn().mockReturnValue([]),
  getSections: jest.fn().mockReturnValue([]),
  getSectionSubIds: jest.fn().mockReturnValue([]),
  getSectionSubItem: jest.fn().mockReturnValue(null),
  isSectionNested: jest.fn().mockReturnValue(false),
  isLessonKeyFixed: jest.fn((k: string) => ["price", "howLessonsWork", "vocal", "piano", "exercises"].includes(k)),
  isFaqKeyFixed: jest.fn((k: string) => ["amITooOld", "needEducation", "howOftenPractice", "noEarForMusic"].includes(k)),
  getAllLessonKeys: jest.fn().mockReturnValue([]),
  getAllFaqKeys: jest.fn().mockReturnValue([]),
  getLesson: jest.fn(),
  getFaq: jest.fn(),
}));

jest.mock("../../state/userState", () => ({
  getState: jest.fn(),
  clearState: jest.fn(),
  setState: jest.fn(),
}));

jest.mock("../../config/admins", () => ({
  addAdmin: jest.fn().mockResolvedValue(undefined),
  loadAdmins: jest.fn(),
  isAdmin: jest.fn().mockReturnValue(true),
  hasAnyAdmin: jest.fn().mockReturnValue(true),
}));

jest.mock("../../botCommands", () => ({
  setCommandsForNewAdmin: jest.fn().mockResolvedValue(undefined),
}));

const setSavedLessonContent = loader.setSavedLessonContent as jest.Mock;
const setSavedFaqContent = loader.setSavedFaqContent as jest.Mock;
const setSavedLessonLabel = loader.setSavedLessonLabel as jest.Mock;
const setSavedFaqLabel = loader.setSavedFaqLabel as jest.Mock;
const setSectionLabel = loader.setSectionLabel as jest.Mock;
const addSection = loader.addSection as jest.Mock;
const addSectionSubItem = loader.addSectionSubItem as jest.Mock;
const addCustomLesson = loader.addCustomLesson as jest.Mock;
const addCustomFaq = loader.addCustomFaq as jest.Mock;
const getState = userState.getState as jest.Mock;
const clearState = userState.clearState as jest.Mock;
const setState = userState.setState as jest.Mock;

describe("handleAdminEdit", () => {
  const userId = 12345;
  const reply = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false when no state", async () => {
    getState.mockReturnValue(null);
    const result = await handleAdminEdit(userId, "text", reply);
    expect(result).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });

  it("handles awaiting_edit_lesson: calls setSavedLessonContent and clears state", async () => {
    getState.mockReturnValue({ type: "awaiting_edit_lesson", key: "price" });
    const result = await handleAdminEdit(userId, "  New lesson text  ", reply);
    expect(result).toBe(true);
    expect(setSavedLessonContent).toHaveBeenCalledWith("price", "New lesson text");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("обновлён"));
  });

  it("handles awaiting_edit_lesson_label: calls setSavedLessonLabel", async () => {
    getState.mockReturnValue({ type: "awaiting_edit_lesson_label", key: "price" });
    const result = await handleAdminEdit(userId, "Новая стоимость", reply);
    expect(result).toBe(true);
    expect(setSavedLessonLabel).toHaveBeenCalledWith("price", "Новая стоимость");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith("Название раздела обновлено.");
  });

  it("handles awaiting_edit_faq: calls setSavedFaqContent", async () => {
    getState.mockReturnValue({ type: "awaiting_edit_faq", key: "amITooOld" });
    const result = await handleAdminEdit(userId, "New answer", reply);
    expect(result).toBe(true);
    expect(setSavedFaqContent).toHaveBeenCalledWith("amITooOld", "New answer");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("обновлён"));
  });

  it("handles awaiting_edit_faq_label: calls setSavedFaqLabel", async () => {
    getState.mockReturnValue({ type: "awaiting_edit_faq_label", key: "noEarForMusic" });
    const result = await handleAdminEdit(userId, "А что если нет слуха?", reply);
    expect(result).toBe(true);
    expect(setSavedFaqLabel).toHaveBeenCalledWith("noEarForMusic", "А что если нет слуха?");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith("Формулировка вопроса обновлена.");
  });

  it("handles awaiting_edit_main_section_label: calls setSectionLabel", async () => {
    getState.mockReturnValue({ type: "awaiting_edit_main_section_label", key: "lessons" });
    const result = await handleAdminEdit(userId, "О занятиях", reply);
    expect(result).toBe(true);
    expect(setSectionLabel).toHaveBeenCalledWith("lessons", "О занятиях");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith("Название пункта главного меню обновлено.");
  });

  it("handles awaiting_new_main_section_label: sets state and asks for flat vs nested choice", async () => {
    getState.mockReturnValue({ type: "awaiting_new_main_section_label" });
    const result = await handleAdminEdit(userId, "Расписание", reply);
    expect(result).toBe(true);
    expect(setState).toHaveBeenCalledWith(userId, {
      type: "awaiting_new_main_section_choice",
      label: "Расписание",
    });
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("Один блок текста или раздел с подпунктами"),
      expect.any(Object)
    );
  });

  it("handles awaiting_new_main_section_content: calls addSection", async () => {
    getState.mockReturnValue({ type: "awaiting_new_main_section_content", label: "Расписание" });
    const result = await handleAdminEdit(userId, "Пн–Пт 10:00–18:00", reply);
    expect(result).toBe(true);
    expect(addSection).toHaveBeenCalledWith("Расписание", "Пн–Пт 10:00–18:00");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("добавлен в главное меню"));
  });

  it("handles awaiting_new_main_section_sub_label: sets state and asks for sub-item content", async () => {
    getState.mockReturnValue({ type: "awaiting_new_main_section_sub_label", sectionKey: "main_raspisaniye" });
    const result = await handleAdminEdit(userId, "Расписание на неделю", reply);
    expect(result).toBe(true);
    expect(setState).toHaveBeenCalledWith(userId, {
      type: "awaiting_new_main_section_sub_content",
      sectionKey: "main_raspisaniye",
      itemLabel: "Расписание на неделю",
    });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("текст подпункта"));
  });

  it("handles awaiting_new_main_section_sub_content: calls addSectionSubItem and asks for more or done", async () => {
    getState.mockReturnValue({
      type: "awaiting_new_main_section_sub_content",
      sectionKey: "main_raspisaniye",
      itemLabel: "Понедельник",
    });
    const result = await handleAdminEdit(userId, "Занятия с 10:00.", reply);
    expect(result).toBe(true);
    expect(addSectionSubItem).toHaveBeenCalledWith("main_raspisaniye", "Понедельник", "Занятия с 10:00.");
    expect(setState).toHaveBeenCalledWith(userId, { type: "awaiting_new_main_section_sub_more", sectionKey: "main_raspisaniye" });
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("Подпункт добавлен"),
      expect.any(Object)
    );
  });

  it("handles awaiting_new_main_section_sub_more: treats text as next sub-item label", async () => {
    getState.mockReturnValue({ type: "awaiting_new_main_section_sub_more", sectionKey: "main_raspisaniye" });
    const result = await handleAdminEdit(userId, "Вторник", reply);
    expect(result).toBe(true);
    expect(setState).toHaveBeenCalledWith(userId, {
      type: "awaiting_new_main_section_sub_content",
      sectionKey: "main_raspisaniye",
      itemLabel: "Вторник",
    });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("текст подпункта"));
  });

  it("handles awaiting_edit_main_section_label: calls setSectionLabel for any section key", async () => {
    getState.mockReturnValue({ type: "awaiting_edit_main_section_label", key: "main_raspisaniye" });
    const result = await handleAdminEdit(userId, "Новое расписание", reply);
    expect(result).toBe(true);
    expect(setSectionLabel).toHaveBeenCalledWith("main_raspisaniye", "Новое расписание");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith("Название пункта главного меню обновлено.");
  });

  it("handles awaiting_new_lesson_label: sets state and asks for content", async () => {
    getState.mockReturnValue({ type: "awaiting_new_lesson_label" });
    const result = await handleAdminEdit(userId, "  Новый раздел  ", reply);
    expect(result).toBe(true);
    expect(setState).toHaveBeenCalledWith(userId, { type: "awaiting_new_lesson_content", label: "Новый раздел" });
    expect(reply).toHaveBeenCalledWith("Название раздела: «Новый раздел». Теперь отправьте текст раздела.");
  });

  it("handles awaiting_new_lesson_content: calls addCustomLesson and clears state", async () => {
    getState.mockReturnValue({ type: "awaiting_new_lesson_content", label: "Новый раздел" });
    const result = await handleAdminEdit(userId, "<p>Текст раздела</p>", reply);
    expect(result).toBe(true);
    expect(addCustomLesson).toHaveBeenCalledWith("Новый раздел", "Текст раздела");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith("Раздел «Новый раздел» добавлен (ключ: new_lesson_key).");
  });

  it("handles awaiting_new_faq_label: sets state and asks for answer", async () => {
    getState.mockReturnValue({ type: "awaiting_new_faq_label" });
    const result = await handleAdminEdit(userId, "Как записаться?", reply);
    expect(result).toBe(true);
    expect(setState).toHaveBeenCalledWith(userId, { type: "awaiting_new_faq_content", label: "Как записаться?" });
    expect(reply).toHaveBeenCalledWith("Вопрос: «Как записаться?». Теперь отправьте текст ответа.");
  });

  it("handles awaiting_new_faq_content: calls addCustomFaq and clears state", async () => {
    getState.mockReturnValue({ type: "awaiting_new_faq_content", label: "Как записаться?" });
    const result = await handleAdminEdit(userId, "Напишите в Telegram.", reply);
    expect(result).toBe(true);
    expect(addCustomFaq).toHaveBeenCalledWith("Как записаться?", "Напишите в Telegram.");
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith("Вопрос «Как записаться?» добавлен (ключ: new_faq_key).");
  });

  it("handles awaiting_add_admin with invalid id: replies error and clears state", async () => {
    getState.mockReturnValue({ type: "awaiting_add_admin" });
    const result = await handleAdminEdit(userId, "not a number", reply);
    expect(result).toBe(true);
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(reply).toHaveBeenCalledWith("Нужно отправить одно число (user ID). Попробуйте снова или отправьте /add_admin.");
  });

  it("handles awaiting_add_admin with valid id: calls addAdmin and setCommandsForNewAdmin", async () => {
    getState.mockReturnValue({ type: "awaiting_add_admin" });
    const result = await handleAdminEdit(userId, "  99999  ", reply);
    expect(result).toBe(true);
    expect(clearState).toHaveBeenCalledWith(userId);
    expect(adminsModule.addAdmin).toHaveBeenCalledWith(99999);
    expect(botCommandsModule.setCommandsForNewAdmin).toHaveBeenCalledWith(99999);
    expect(reply).toHaveBeenCalledWith("Пользователь 99999 добавлен в админы.");
  });

  it("returns false for unhandled state type (fallthrough)", async () => {
    getState.mockReturnValue({ type: "awaiting_edit_custom_section_label", sectionKey: "sec_foo" } as never);
    const result = await handleAdminEdit(userId, "Label", reply);
    expect(result).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });
});
