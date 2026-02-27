import {
  getMainMenu,
  mainMenuMessage,
  getCustomSectionSubMenu,
  getCustomSectionSubMenuMessage,
  MAIN,
  LESSONS,
  ASK,
  CONTACT,
  MAIN_CUSTOM_PREFIX,
  MAIN_CUSTOM_SUB_PREFIX,
} from "../main.menu";

jest.mock("../../content/loader", () => ({
  getVisibleSectionIds: jest.fn().mockReturnValue(["lessons", "ask", "contact"]),
  getSectionLabel: jest.fn((id: string) => {
    const labels: Record<string, string> = {
      lessons: "Об уроках",
      ask: "Задать вопрос",
      contact: "Связаться",
      sec_foo: "Кастомный раздел",
    };
    return labels[id] ?? id;
  }),
  getSectionSubIds: jest.fn().mockReturnValue(["item_1", "item_2"]),
  getSectionSubItem: jest.fn((_sectionKey: string, itemKey: string) => {
    const items: Record<string, { label: string; content: string }> = {
      item_1: { label: "Пункт 1", content: "Текст 1" },
      item_2: { label: "Пункт 2", content: "Текст 2" },
    };
    return items[itemKey] ?? { label: itemKey, content: "" };
  }),
}));

describe("main.menu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constants", () => {
    it("exports expected constants", () => {
      expect(MAIN).toBe("main");
      expect(LESSONS).toBe("lessons");
      expect(ASK).toBe("ask");
      expect(CONTACT).toBe("contact");
      expect(MAIN_CUSTOM_PREFIX).toBe("main_custom:");
      expect(MAIN_CUSTOM_SUB_PREFIX).toBe("main_sub:");
    });
  });

  describe("mainMenuMessage", () => {
    it("contains welcome text", () => {
      expect(mainMenuMessage).toContain("Добро пожаловать");
      expect(mainMenuMessage).toContain("меню");
    });
  });

  describe("getMainMenu", () => {
    it("returns inline keyboard with section buttons", () => {
      const result = getMainMenu();
      expect(result).toHaveProperty("reply_markup");
      expect(result.reply_markup).toHaveProperty("inline_keyboard");
      const keyboard = result.reply_markup.inline_keyboard as unknown[][];
      expect(keyboard.length).toBe(3);
      expect(keyboard[0][0]).toMatchObject({ text: expect.stringContaining("Об уроках") });
      expect(keyboard[1][0]).toMatchObject({ text: expect.stringContaining("Задать вопрос") });
      expect(keyboard[2][0]).toMatchObject({ text: expect.stringContaining("Связаться") });
    });
  });

  describe("getCustomSectionSubMenu", () => {
    it("returns keyboard with sub-items and back button", () => {
      const result = getCustomSectionSubMenu("sec_foo");
      expect(result.reply_markup.inline_keyboard).toBeDefined();
      const keyboard = result.reply_markup.inline_keyboard as unknown[][];
      expect(keyboard.length).toBeGreaterThanOrEqual(2);
      expect(keyboard.some((row: unknown[]) => row.some((b: unknown) => (b as { text?: string }).text?.includes("Пункт 1")))).toBe(true);
      expect(keyboard.some((row: unknown[]) => row.some((b: unknown) => (b as { text?: string }).text?.includes("В главное меню")))).toBe(true);
    });
  });

  describe("getCustomSectionSubMenuMessage", () => {
    it("returns message with section label", () => {
      const result = getCustomSectionSubMenuMessage("sec_foo");
      expect(result).toContain("Кастомный раздел");
      expect(result).toContain("Выберите пункт");
    });
  });
});
