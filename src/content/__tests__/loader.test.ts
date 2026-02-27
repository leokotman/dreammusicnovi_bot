import * as fs from "fs";
import * as path from "path";
import {
  LESSON_KEYS,
  FAQ_KEYS,
  getLesson,
  getFaq,
  getLessonLabel,
  getFaqLabel,
  setSavedLessonContent,
  setSavedFaqContent,
  setSavedLessonLabel,
  setSavedFaqLabel,
  getSavedContent,
  initContent,
  replaceSavedContent,
  addCustomLesson,
  addCustomFaq,
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
