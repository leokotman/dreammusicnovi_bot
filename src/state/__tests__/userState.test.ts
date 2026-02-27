import { setState, getState, clearState } from "../userState";

describe("userState", () => {
  const userId = 12345;

  beforeEach(() => {
    clearState(userId);
  });

  it("returns null when no state set", () => {
    expect(getState(userId)).toBeNull();
  });

  it("returns set state for awaiting_question", () => {
    setState(userId, { type: "awaiting_question" });
    expect(getState(userId)).toEqual({ type: "awaiting_question" });
  });

  it("returns set state for awaiting_edit_lesson", () => {
    setState(userId, { type: "awaiting_edit_lesson", key: "price" });
    expect(getState(userId)).toEqual({ type: "awaiting_edit_lesson", key: "price" });
  });

  it("returns set state for awaiting_edit_faq", () => {
    setState(userId, { type: "awaiting_edit_faq", key: "amITooOld" });
    expect(getState(userId)).toEqual({ type: "awaiting_edit_faq", key: "amITooOld" });
  });

  it("returns set state for awaiting_edit_lesson_label", () => {
    setState(userId, { type: "awaiting_edit_lesson_label", key: "price" });
    expect(getState(userId)).toEqual({ type: "awaiting_edit_lesson_label", key: "price" });
  });

  it("returns set state for awaiting_edit_faq_label", () => {
    setState(userId, { type: "awaiting_edit_faq_label", key: "amITooOld" });
    expect(getState(userId)).toEqual({ type: "awaiting_edit_faq_label", key: "amITooOld" });
  });

  it("returns set state for awaiting_edit_main_section_label", () => {
    setState(userId, { type: "awaiting_edit_main_section_label", key: "lessons" });
    expect(getState(userId)).toEqual({ type: "awaiting_edit_main_section_label", key: "lessons" });
  });

  it("returns set state for awaiting_new_main_section_content", () => {
    setState(userId, { type: "awaiting_new_main_section_content", label: "Расписание" });
    expect(getState(userId)).toEqual({ type: "awaiting_new_main_section_content", label: "Расписание" });
  });

  it("returns set state for awaiting_add_admin", () => {
    setState(userId, { type: "awaiting_add_admin" });
    expect(getState(userId)).toEqual({ type: "awaiting_add_admin" });
  });

  it("clearState removes state", () => {
    setState(userId, { type: "awaiting_question" });
    clearState(userId);
    expect(getState(userId)).toBeNull();
  });

  it("different users have independent state", () => {
    setState(1, { type: "awaiting_question" });
    setState(2, { type: "awaiting_edit_lesson", key: "vocal" });
    expect(getState(1)).toEqual({ type: "awaiting_question" });
    expect(getState(2)).toEqual({ type: "awaiting_edit_lesson", key: "vocal" });
  });
});
