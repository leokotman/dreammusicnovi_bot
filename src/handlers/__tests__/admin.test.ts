import { handleAdminEdit } from "../admin";
import * as loader from "../../content/loader";
import * as userState from "../../state/userState";

jest.mock("../../content/loader", () => ({
  setSavedLessonContent: jest.fn().mockResolvedValue(undefined),
  setSavedFaqContent: jest.fn().mockResolvedValue(undefined),
  setSavedLessonLabel: jest.fn().mockResolvedValue(undefined),
  setSavedFaqLabel: jest.fn().mockResolvedValue(undefined),
  getLessonLabel: jest.fn((key: string) => `Label-${key}`),
  getFaqLabel: jest.fn((key: string) => `Faq-${key}`),
  addCustomLesson: jest.fn().mockResolvedValue("new_lesson_key"),
  addCustomFaq: jest.fn().mockResolvedValue("new_faq_key"),
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
const getState = userState.getState as jest.Mock;
const clearState = userState.clearState as jest.Mock;

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
});
