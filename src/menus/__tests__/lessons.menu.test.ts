import {
  getLessonLabel,
  parseLessonCallback,
  getLessonsMenu,
  getLessonsMenuForTopic,
  lessonsMenuMessage,
  LESSONS_BACK,
} from "../lessons.menu";
import { MAIN } from "../main.menu";

describe("lessons.menu", () => {
  describe("getLessonLabel", () => {
    it("returns Russian label for each key", () => {
      expect(getLessonLabel("price")).toBe("Стоимость");
      expect(getLessonLabel("howLessonsWork")).toBe("Как проходят занятия");
      expect(getLessonLabel("vocal")).toBe("Вокал");
      expect(getLessonLabel("piano")).toBe("Фортепиано");
      expect(getLessonLabel("exercises")).toBe("Упражнения между занятиями");
    });
  });

  describe("parseLessonCallback", () => {
    it("parses valid lesson callback", () => {
      expect(parseLessonCallback("lesson:price")).toBe("price");
      expect(parseLessonCallback("lesson:vocal")).toBe("vocal");
    });

    it("returns null for wrong prefix", () => {
      expect(parseLessonCallback("faq:price")).toBeNull();
      expect(parseLessonCallback("other")).toBeNull();
    });

    it("returns null for unknown key", () => {
      expect(parseLessonCallback("lesson:unknown")).toBeNull();
    });
  });

  describe("lessonsMenuMessage", () => {
    it("contains expected text", () => {
      expect(lessonsMenuMessage).toContain("Об уроках");
      expect(lessonsMenuMessage).toContain("Выберите тему");
    });
  });

  describe("getLessonsMenu", () => {
    it("returns keyboard with main menu back button", () => {
      const menu = getLessonsMenu();
      expect(menu.reply_markup).toBeDefined();
      type Row = { callback_data?: string }[];
      const keyboard = (menu.reply_markup as { inline_keyboard: Row[] }).inline_keyboard;
      const lastRow: Row = keyboard[keyboard.length - 1];
      expect(lastRow[0].callback_data).toBe(MAIN);
    });
  });

  describe("getLessonsMenuForTopic", () => {
    it("returns keyboard with lessons_back", () => {
      const menu = getLessonsMenuForTopic();
      type Row = { callback_data?: string }[];
      const keyboard = (menu.reply_markup as { inline_keyboard: Row[] }).inline_keyboard;
      const lastRow: Row = keyboard[keyboard.length - 1];
      expect(lastRow[0].callback_data).toBe(LESSONS_BACK);
    });
  });
});
