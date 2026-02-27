import * as fs from "fs";
import * as path from "path";
import {
  LESSON_KEYS,
  FAQ_KEYS,
  getLesson,
  getFaq,
  setLessonOverride,
  setFaqOverride,
  getOverrides,
  initContent,
  saveOverrides,
} from "../loader";

jest.mock("fs");

const mockFs = fs as jest.Mocked<typeof fs>;

describe("loader", () => {
  const overridesPath = path.join(process.cwd(), "data", "overrides.json");
  const lessonsDir = path.join(process.cwd(), "content", "lessons");
  const faqDir = path.join(process.cwd(), "content", "faq");

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
    it("getLesson returns file content when no override", () => {
      initContent();
      expect(getLesson("price")).toBe("<p>lesson content</p>");
    });

    it("getFaq returns file content when no override", () => {
      initContent();
      expect(getFaq("amITooOld")).toBe("<p>faq content</p>");
    });

    it("setLessonOverride then getLesson returns override", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setLessonOverride("price", "<b>New price</b>");
      expect(getLesson("price")).toBe("<b>New price</b>");
    });

    it("setFaqOverride then getFaq returns override", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await setFaqOverride("amITooOld", "<b>New answer</b>");
      expect(getFaq("amITooOld")).toBe("<b>New answer</b>");
    });
  });

  describe("getOverrides", () => {
    it("returns copy of overrides", () => {
      initContent();
      const o = getOverrides();
      expect(o).toEqual({});
      expect(getOverrides()).not.toBe(o);
    });
  });

  describe("saveOverrides", () => {
    it("writes and updates in-memory overrides", async () => {
      initContent();
      mockFs.readFileSync.mockReturnValue("{}");
      await saveOverrides({ lessons: { price: "x" } });
      expect(getLesson("price")).toBe("x");
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });
});
