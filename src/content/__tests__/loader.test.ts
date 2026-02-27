import * as fs from "fs";
import * as path from "path";
import {
  LESSON_KEYS,
  FAQ_KEYS,
  MAIN_SECTION_IDS,
  getLesson,
  getFaq,
  getLessonLabel,
  getFaqLabel,
  getMainSectionLabel,
  getMainMenuSectionIds,
  getCustomMainSections,
  getCustomMainSectionContent,
  isCustomSectionNested,
  getCustomMainSectionSubIds,
  getCustomMainSectionSubItem,
  setSavedLessonContent,
  setSavedFaqContent,
  setSavedLessonLabel,
  setSavedFaqLabel,
  setSavedMainSectionLabel,
  getSavedContent,
  initContent,
  replaceSavedContent,
  addCustomLesson,
  addCustomFaq,
  addCustomMainSection,
  createCustomMainSectionNested,
  addCustomMainSectionSubItem,
} from "../loader";

jest.mock("fs");

const mockFs = fs as jest.Mocked<typeof fs>;

describe("loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.readFileSync.mockImplementation(((p: unknown) => {
      const pathStr = String(p);
      if (pathStr.includes("overrides")) return "{}";
      if (pathStr.includes("lessons")) return "<p>lesson content</p>";
      if (pathStr.includes("faq")) return "<p>faq content</p>";
      throw new Error("file not found");
    }) as typeof fs.readFileSync);
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
  });

  describe("constants", () => {
    it("LESSON_KEYS has expected keys", () => {
      expect(LESSON_KEYS).toContain("price");
      expect(LESSON_KEYS).toContain("vocal");
      expect(LESSON_KEYS.length).toBe(5);
    });
    it("FAQ_KEYS has expected keys", () => {
      expect(FAQ_KEYS).toContain("amITooOld");
      expect(FAQ_KEYS).toContain("noEarForMusic");
      expect(FAQ_KEYS.length).toBe(4);
    });
  });

  describe("initContent and getLesson / getFaq", () => {
    it("getLesson returns file content when no saved content", () => {
      initContent();
      expect(getLesson("price")).toBe("<p>lesson content</p>");
    });

    it("getFaq returns file content when no saved content", () => {
      initContent();
      expect(getFaq("amITooOld")).toBe("<p>faq content</p>");
    });

    it("setSavedLessonContent then getLesson returns saved content", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setSavedLessonContent("price", "<b>New price</b>");
      expect(getLesson("price")).toBe("<b>New price</b>");
    });

    it("setSavedFaqContent then getFaq returns saved content", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setSavedFaqContent("amITooOld", "<b>New answer</b>");
      expect(getFaq("amITooOld")).toBe("<b>New answer</b>");
    });
  });

  describe("getSavedContent", () => {
    it("returns copy of saved content", () => {
      initContent();
      const o = getSavedContent();
      expect(o).toEqual({});
      expect(getSavedContent()).not.toBe(o);
    });
  });

  describe("replaceSavedContent", () => {
    it("writes and updates in-memory saved content", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await replaceSavedContent({ lessons: { price: "x" } });
      expect(getLesson("price")).toBe("x");
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe("saved labels", () => {
    it("getLessonLabel returns saved label after setSavedLessonLabel", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setSavedLessonLabel("price", "Новая стоимость");
      expect(getLessonLabel("price")).toBe("Новая стоимость");
    });

    it("getFaqLabel returns saved label after setSavedFaqLabel", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setSavedFaqLabel("amITooOld", "Мне уже поздно начинать?");
      expect(getFaqLabel("amITooOld")).toBe("Мне уже поздно начинать?");
    });
  });

  describe("edit merge preserves other keys", () => {
    it("setSavedLessonContent preserves faqLabelOverrides and other keys", async () => {
      const existing = {
        lessons: { price: "old price" },
        faqLabelOverrides: { noEarForMusic: "У меня нет слуха?" },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));
      initContent();
      await setSavedLessonContent("price", "updated price");
      const content = getSavedContent();
      expect(content.lessons?.price).toBe("updated price");
      expect(content.faqLabelOverrides?.noEarForMusic).toBe("У меня нет слуха?");
    });

    it("setSavedFaqLabel preserves lessons and faq content", async () => {
      const existing = {
        lessons: { price: "cost" },
        faq: { amITooOld: "answer" },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));
      initContent();
      await setSavedFaqLabel("amITooOld", "Новый вопрос?");
      const content = getSavedContent();
      expect(content.faqLabelOverrides?.amITooOld).toBe("Новый вопрос?");
      expect(content.lessons?.price).toBe("cost");
      expect(content.faq?.amITooOld).toBe("answer");
    });

    it("setSavedFaqContent preserves lessons and faqLabelOverrides", async () => {
      const existing = {
        lessons: { price: "x" },
        faqLabelOverrides: { amITooOld: "label" },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));
      initContent();
      await setSavedFaqContent("amITooOld", "new answer");
      const content = getSavedContent();
      expect(content.faq?.amITooOld).toBe("new answer");
      expect(content.lessons?.price).toBe("x");
      expect(content.faqLabelOverrides?.amITooOld).toBe("label");
    });
  });

  describe("main section labels and custom sections", () => {
    it("getMainSectionLabel returns default for lessons, ask, contact", () => {
      initContent();
      expect(getMainSectionLabel("lessons")).toBe("Об уроках");
      expect(getMainSectionLabel("ask")).toBe("Задать вопрос");
      expect(getMainSectionLabel("contact")).toBe("Связаться с преподавателем");
    });

    it("getMainSectionLabel returns saved label after setSavedMainSectionLabel", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setSavedMainSectionLabel("lessons", "О занятиях");
      expect(getMainSectionLabel("lessons")).toBe("О занятиях");
      expect(getMainSectionLabel("ask")).toBe("Задать вопрос");
    });

    it("getMainMenuSectionIds returns fixed ids then custom order", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      expect(getMainMenuSectionIds()).toEqual([...MAIN_SECTION_IDS]);
      await addCustomMainSection("Расписание", "Пн–Пт 10:00–18:00");
      const ids = getMainMenuSectionIds();
      expect(ids.slice(0, 3)).toEqual([...MAIN_SECTION_IDS]);
      expect(ids.length).toBe(4);
      expect(ids[3]).toMatch(/^main_/);
    });

    it("addCustomMainSection adds section and getCustomMainSectionContent returns content", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      const key = await addCustomMainSection("Расписание", "Пн–Пт 10:00–18:00");
      expect(key).toMatch(/^main_/);
      const sections = getCustomMainSections();
      expect(sections).toHaveLength(1);
      expect(sections[0].label).toBe("Расписание");
      expect(sections[0].content).toBe("Пн–Пт 10:00–18:00");
      expect(getCustomMainSectionContent(key)).toBe("Пн–Пт 10:00–18:00");
    });

    it("createCustomMainSectionNested creates section with empty subItems", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      const key = await createCustomMainSectionNested("Расписание");
      expect(key).toMatch(/^main_/);
      expect(isCustomSectionNested(key)).toBe(true);
      expect(getCustomMainSectionSubIds(key)).toEqual([]);
      expect(getCustomMainSectionContent(key)).toBeNull();
      const sections = getCustomMainSections();
      expect(sections.find((s) => s.key === key)?.label).toBe("Расписание");
    });

    it("addCustomMainSectionSubItem adds sub-item and getCustomMainSectionSubItem returns it", async () => {
      initContent();
      let overridesJson = "{}";
      mockFs.readFileSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        if (pathStr.includes("overrides")) return overridesJson;
        if (pathStr.includes("lessons")) return "<p>lesson content</p>";
        if (pathStr.includes("faq")) return "<p>faq content</p>";
        throw new Error("file not found");
      });
      mockFs.writeFileSync.mockImplementation(((p: unknown, data: unknown) => {
        const pathStr = String(p);
        if (pathStr.includes("overrides")) overridesJson = typeof data === "string" ? data : String(data);
      }) as typeof fs.writeFileSync);
      const sectionKey = await createCustomMainSectionNested("Расписание");
      const itemKey = await addCustomMainSectionSubItem(sectionKey, "Понедельник", "Занятия с 10:00.");
      expect(getCustomMainSectionSubIds(sectionKey)).toEqual([itemKey]);
      const item = getCustomMainSectionSubItem(sectionKey, itemKey);
      expect(item).toEqual({ label: "Понедельник", content: "Занятия с 10:00." });
      await addCustomMainSectionSubItem(sectionKey, "Вторник", "Занятия с 14:00.");
      expect(getCustomMainSectionSubIds(sectionKey).length).toBe(2);
    });

    it("setSavedMainSectionLabel preserves lessons and faq", async () => {
      const existing = { lessons: { price: "x" }, faq: { amITooOld: "y" } };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));
      initContent();
      await setSavedMainSectionLabel("contact", "Контакты");
      const content = getSavedContent();
      expect(content.mainSectionLabels?.contact).toBe("Контакты");
      expect(content.lessons?.price).toBe("x");
      expect(content.faq?.amITooOld).toBe("y");
    });
  });

  describe("slugFromLabel (Cyrillic to Latin)", () => {
    it("produces Latin-only key from Russian label", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      const key = await addCustomLesson("Стоимость", "content");
      expect(key).toMatch(/^[a-z0-9_]+$/);
      expect(key).toBe("stoimost");
    });

    it("produces Latin-only key from Russian FAQ label", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      const key = await addCustomFaq("Как часто заниматься?", "answer");
      expect(key).toMatch(/^[a-z0-9_]+$/);
      expect(key).toBe("kak_chasto_zanimatsya");
    });
  });
});
