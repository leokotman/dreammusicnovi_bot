import {
  transliterateCyrillicToLatin,
  slugFromLabel,
  slugFromLabelForSection,
  slugForSubItem,
} from "../slug";

describe("slug", () => {
  describe("transliterateCyrillicToLatin", () => {
    it("transliterates Russian to Latin", () => {
      expect(transliterateCyrillicToLatin("Привет")).toBe("privet");
      expect(transliterateCyrillicToLatin("Стоимость")).toBe("stoimost");
      expect(transliterateCyrillicToLatin("Как часто")).toBe("kak chasto");
    });

    it("lowercases result", () => {
      expect(transliterateCyrillicToLatin("АБВ")).toBe("abv");
    });

    it("keeps Latin and digits", () => {
      expect(transliterateCyrillicToLatin("hello123")).toBe("hello123");
    });

    it("drops unknown characters", () => {
      expect(transliterateCyrillicToLatin("a!@#b")).toBe("ab");
    });
  });

  describe("slugFromLabel", () => {
    it("produces unique key from label", () => {
      expect(slugFromLabel("Стоимость", [], [])).toBe("stoimost");
      expect(slugFromLabel("  Как часто заниматься?  ", [], [])).toBe("kak_chasto_zanimatsya");
    });

    it("avoids collision with existing lesson keys", () => {
      expect(slugFromLabel("price", ["price"], [])).toBe("price_1");
      expect(slugFromLabel("price", ["price", "price_1"], [])).toBe("price_2");
    });

    it("avoids collision with existing FAQ keys", () => {
      // slug is lowercased, so collision is with lowercased key
      expect(slugFromLabel("amITooOld", [], ["amitooold"])).toBe("amitooold_1");
    });

    it("returns custom_ + timestamp when label yields empty base", () => {
      const key = slugFromLabel("!!!", [], []);
      expect(key).toMatch(/^custom_\d+$/);
    });
  });

  describe("slugFromLabelForSection", () => {
    it("produces sec_ prefixed key", () => {
      const key = slugFromLabelForSection("Расписание", [], {});
      expect(key).toMatch(/^sec_/);
      expect(key).toBe("sec_raspisanie");
    });

    it("avoids collision with sectionOrder and sections", () => {
      const key = slugFromLabelForSection("raspisanie", ["sec_raspisanie"], {});
      expect(key).toBe("sec_raspisanie_1");
    });

    it("returns sec_ + timestamp when label yields empty base", () => {
      const key = slugFromLabelForSection("---", [], {});
      expect(key).toMatch(/^sec_\d+$/);
    });
  });

  describe("slugForSubItem", () => {
    it("produces key from label", () => {
      expect(slugForSubItem("Понедельник", [])).toBe("ponedelnik");
    });

    it("avoids collision with existing keys", () => {
      expect(slugForSubItem("item", ["item"])).toBe("item_1");
      expect(slugForSubItem("item", ["item", "item_1"])).toBe("item_2");
    });

    it("uses item prefix when label yields empty base", () => {
      const key = slugForSubItem("!!!", []);
      expect(key).toMatch(/^item\d*$/);
    });
  });
});
