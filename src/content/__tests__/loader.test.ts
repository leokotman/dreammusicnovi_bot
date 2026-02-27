import * as fs from "fs";
import * as path from "path";
import {
  LESSON_KEYS,
  FAQ_KEYS,
  DEFAULT_SECTION_IDS,
  getLesson,
  getFaq,
  getLessonLabel,
  getFaqLabel,
  getSectionLabel,
  getVisibleSectionIds,
  getSections,
  getSectionContent,
  isSectionNested,
  getSectionSubIds,
  getSectionSubItem,
  setSavedLessonContent,
  setSavedFaqContent,
  setSavedLessonLabel,
  setSavedFaqLabel,
  setSectionLabel,
  getSavedContent,
  initContent,
  replaceSavedContent,
  addCustomLesson,
  addCustomFaq,
  addSection,
  addSectionNested,
  addSectionSubItem,
  hideSection,
  removeSectionSubItem,
  getAllLessonKeys,
  getAllFaqKeys,
  addHiddenLessonKey,
  removeCustomLesson,
  removeHiddenLessonKey,
  addHiddenFaqKey,
  removeCustomFaq,
  removeHiddenFaqKey,
  addHiddenSectionId,
  removeHiddenSectionId,
  getHiddenSectionIds,
  getHiddenLessonKeys,
  getHiddenFaqKeys,
  isLessonKeyFixed,
  isFaqKeyFixed,
  purgeDeletedSectionsOlderThanThreeMonths,
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

    it("getLesson returns fallback when file is missing", () => {
      initContent();
      mockFs.readFileSync.mockImplementation(((p: unknown) => {
        const pathStr = String(p);
        if (pathStr.includes("overrides")) return "{}";
        if (pathStr.includes("missing")) throw new Error("ENOENT");
        if (pathStr.includes("lessons")) return "<p>lesson content</p>";
        if (pathStr.includes("faq")) return "<p>faq content</p>";
        throw new Error("file not found");
      }) as typeof fs.readFileSync);
      expect(getLesson("missing")).toContain("Содержание не найдено");
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
      expect(o.sections).toBeDefined();
      expect(o.sectionOrder).toEqual(["lessons", "ask", "contact"]);
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

  describe("section labels and sections (single tier)", () => {
    it("getSectionLabel returns default for lessons, ask, contact", () => {
      initContent();
      expect(getSectionLabel("lessons")).toBe("Об уроках");
      expect(getSectionLabel("ask")).toBe("Задать вопрос");
      expect(getSectionLabel("contact")).toBe("Связаться с преподавателем");
    });

    it("getSectionLabel returns saved label after setSectionLabel", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setSectionLabel("lessons", "О занятиях");
      expect(getSectionLabel("lessons")).toBe("О занятиях");
      expect(getSectionLabel("ask")).toBe("Задать вопрос");
    });

    it("getVisibleSectionIds returns default ids then added sections", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      expect(getVisibleSectionIds().slice(0, 3)).toEqual([...DEFAULT_SECTION_IDS]);
      await addSection("Расписание", "Пн–Пт 10:00–18:00");
      const ids = getVisibleSectionIds();
      expect(ids.slice(0, 3)).toEqual([...DEFAULT_SECTION_IDS]);
      expect(ids.length).toBe(4);
      expect(ids[3]).toMatch(/^sec_/);
    });

    it("getAllLessonKeys excludes hiddenLessonKeys", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      expect(getAllLessonKeys()).toContain("vocal");
      await addHiddenLessonKey("vocal");
      expect(getAllLessonKeys()).not.toContain("vocal");
    });

    it("getVisibleSectionIds excludes hiddenSectionIds", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      expect(getVisibleSectionIds()).toContain("lessons");
      await addHiddenSectionId("lessons");
      expect(getVisibleSectionIds()).not.toContain("lessons");
    });

    it("getHiddenSectionIds and removeHiddenSectionId restore section", async () => {
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
      await addHiddenSectionId("contact");
      expect(getHiddenSectionIds()).toContain("contact");
      await removeHiddenSectionId("contact");
      expect(getHiddenSectionIds()).not.toContain("contact");
      expect(getVisibleSectionIds()).toContain("contact");
    });

    it("getHiddenLessonKeys and removeHiddenLessonKey restore lesson topic", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await addHiddenLessonKey("vocal");
      expect(getHiddenLessonKeys()).toContain("vocal");
      await removeHiddenLessonKey("vocal");
      expect(getHiddenLessonKeys()).not.toContain("vocal");
      expect(getAllLessonKeys()).toContain("vocal");
    });

    it("getHiddenFaqKeys and removeHiddenFaqKey restore FAQ question", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await addHiddenFaqKey("amITooOld");
      expect(getHiddenFaqKeys()).toContain("amITooOld");
      await removeHiddenFaqKey("amITooOld");
      expect(getHiddenFaqKeys()).not.toContain("amITooOld");
      expect(getAllFaqKeys()).toContain("amITooOld");
    });

    it("removeCustomLesson removes custom lesson only", async () => {
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
      const key = await addCustomLesson("Мой раздел", "Текст");
      expect(getAllLessonKeys()).toContain(key);
      await removeCustomLesson(key);
      expect(getAllLessonKeys()).not.toContain(key);
    });

    it("removeSectionSubItem removes sub-item", async () => {
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
      const sectionKey = await addSectionNested("Раздел");
      await addSectionSubItem(sectionKey, "Пункт 1", "Текст 1");
      const item2 = await addSectionSubItem(sectionKey, "Пункт 2", "Текст 2");
      expect(getSectionSubIds(sectionKey).length).toBe(2);
      await removeSectionSubItem(sectionKey, item2);
      expect(getSectionSubIds(sectionKey).length).toBe(1);
      expect(getSectionSubItem(sectionKey, item2)).toBeNull();
    });

    it("addSection adds section and getSectionContent returns content", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      const key = await addSection("Расписание", "Пн–Пт 10:00–18:00");
      expect(key).toMatch(/^sec_/);
      const sections = getSections();
      const added = sections.filter((s) => s.key === key);
      expect(added).toHaveLength(1);
      expect(added[0].label).toBe("Расписание");
      expect(added[0].content).toBe("Пн–Пт 10:00–18:00");
      expect(getSectionContent(key)).toBe("Пн–Пт 10:00–18:00");
    });

    it("addSectionNested creates section with empty subItems", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      const key = await addSectionNested("Расписание");
      expect(key).toMatch(/^sec_/);
      expect(isSectionNested(key)).toBe(true);
      expect(getSectionSubIds(key)).toEqual([]);
      expect(getSectionContent(key)).toBeNull();
      const sections = getSections();
      expect(sections.find((s) => s.key === key)?.label).toBe("Расписание");
    });

    it("addSectionSubItem adds sub-item and getSectionSubItem returns it", async () => {
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
      const sectionKey = await addSectionNested("Расписание");
      const itemKey = await addSectionSubItem(sectionKey, "Понедельник", "Занятия с 10:00.");
      expect(getSectionSubIds(sectionKey)).toEqual([itemKey]);
      const item = getSectionSubItem(sectionKey, itemKey);
      expect(item).toEqual({ label: "Понедельник", content: "Занятия с 10:00." });
      await addSectionSubItem(sectionKey, "Вторник", "Занятия с 14:00.");
      expect(getSectionSubIds(sectionKey).length).toBe(2);
    });

    it("hideSection hides section from visible list and sets deletedSections", async () => {
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
      const key = await addSection("Удаляемый", "Текст");
      expect(getVisibleSectionIds()).toContain(key);
      await hideSection(key);
      expect(getVisibleSectionIds()).not.toContain(key);
      expect(getHiddenSectionIds()).toContain(key);
      const content = getSavedContent();
      expect(content.deletedSections?.[key]?.dateDeleted).toBeDefined();
    });

    it("setSectionLabel updates section label", async () => {
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
      const key = await addSection("Расписание", "Пн–Пт");
      expect(getSections().find((s) => s.key === key)?.label).toBe("Расписание");
      await setSectionLabel(key, "Новое расписание");
      expect(getSections().find((s) => s.key === key)?.label).toBe("Новое расписание");
    });

    it("setSectionLabel preserves lessons and faq", async () => {
      const existing = { lessons: { price: "x" }, faq: { amITooOld: "y" }, sections: { contact: { label: "Контакты", type: "contact" } }, sectionOrder: ["lessons", "ask", "contact"] };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));
      initContent();
      await setSectionLabel("contact", "Контакты");
      const content = getSavedContent();
      expect(content.sections?.contact?.label).toBe("Контакты");
      expect(content.lessons?.price).toBe("x");
      expect(content.faq?.amITooOld).toBe("y");
    });

    it("purgeDeletedSectionsOlderThanThreeMonths removes sections deleted over 3 months ago", async () => {
      const overThreeMonthsAgo = new Date();
      overThreeMonthsAgo.setMonth(overThreeMonthsAgo.getMonth() - 4);
      const existing = {
        sections: { foo: { label: "Foo", type: "flat", content: "x" }, bar: { label: "Bar", type: "flat", content: "y" } },
        sectionOrder: ["lessons", "ask", "contact", "foo", "bar"],
        hiddenSectionIds: ["foo", "bar"],
        deletedSections: {
          foo: { dateDeleted: overThreeMonthsAgo.toISOString() },
          bar: { dateDeleted: new Date().toISOString() },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));
      initContent();
      const { purged } = await purgeDeletedSectionsOlderThanThreeMonths();
      expect(purged).toContain("foo");
      expect(purged).not.toContain("bar");
      const content = getSavedContent();
      expect(content.sections?.foo).toBeUndefined();
      expect(content.sections?.bar).toBeDefined();
      expect(content.hiddenSectionIds).not.toContain("foo");
      expect(content.deletedSections?.foo).toBeUndefined();
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
