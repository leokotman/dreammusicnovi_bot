import { getAllLessonKeys, getAllFaqKeys } from "../keys";
import * as state from "../state";

jest.mock("../state", () => ({
  getSavedContent: jest.fn(),
}));

const getSavedContent = state.getSavedContent as jest.Mock;

describe("keys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAllLessonKeys", () => {
    it("returns fixed keys when no overrides", () => {
      getSavedContent.mockReturnValue({});
      const keys = getAllLessonKeys();
      expect(keys).toContain("price");
      expect(keys).toContain("vocal");
      expect(keys.length).toBeGreaterThanOrEqual(5);
    });

    it("excludes hidden lesson keys", () => {
      getSavedContent.mockReturnValue({
        hiddenLessonKeys: ["price", "vocal"],
      });
      const keys = getAllLessonKeys();
      expect(keys).not.toContain("price");
      expect(keys).not.toContain("vocal");
    });

    it("includes custom lesson keys not hidden", () => {
      getSavedContent.mockReturnValue({
        customLessonLabels: { my_topic: "My Topic" },
        hiddenLessonKeys: [],
      });
      const keys = getAllLessonKeys();
      expect(keys).toContain("my_topic");
    });

    it("excludes custom lesson keys when in hiddenLessonKeys", () => {
      getSavedContent.mockReturnValue({
        customLessonLabels: { my_topic: "My Topic" },
        hiddenLessonKeys: ["my_topic"],
      });
      const keys = getAllLessonKeys();
      expect(keys).not.toContain("my_topic");
    });
  });

  describe("getAllFaqKeys", () => {
    it("returns fixed keys when no overrides", () => {
      getSavedContent.mockReturnValue({});
      const keys = getAllFaqKeys();
      expect(keys).toContain("amITooOld");
      expect(keys).toContain("noEarForMusic");
      expect(keys.length).toBeGreaterThanOrEqual(4);
    });

    it("excludes hidden FAQ keys", () => {
      getSavedContent.mockReturnValue({
        hiddenFaqKeys: ["amITooOld"],
      });
      const keys = getAllFaqKeys();
      expect(keys).not.toContain("amITooOld");
    });

    it("includes custom FAQ keys not hidden", () => {
      getSavedContent.mockReturnValue({
        customFaqLabels: { my_question: "My Q?" },
        hiddenFaqKeys: [],
      });
      const keys = getAllFaqKeys();
      expect(keys).toContain("my_question");
    });
  });
});
