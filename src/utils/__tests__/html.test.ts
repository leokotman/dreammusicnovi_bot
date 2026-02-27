import { stripHtml, escapeForTelegramHtml } from "../html";

describe("html utils", () => {
  describe("stripHtml", () => {
    it("strips all HTML tags", () => {
      expect(stripHtml("<p>hello</p>")).toBe("hello");
      expect(stripHtml("<b>bold</b>")).toBe("bold");
      expect(stripHtml("<a href='x'>link</a>")).toBe("link");
    });

    it("trims whitespace", () => {
      expect(stripHtml("  <p> text </p>  ")).toBe("text");
    });

    it("returns plain text unchanged", () => {
      expect(stripHtml("No tags here")).toBe("No tags here");
    });

    it("handles nested tags", () => {
      expect(stripHtml("<div><span>nested</span></div>")).toBe("nested");
    });
  });

  describe("escapeForTelegramHtml", () => {
    it("escapes ampersand", () => {
      expect(escapeForTelegramHtml("a & b")).toBe("a &amp; b");
    });

    it("escapes less-than and greater-than", () => {
      expect(escapeForTelegramHtml("<tag>")).toBe("&lt;tag&gt;");
    });

    it("escapes all special chars together", () => {
      expect(escapeForTelegramHtml("x < 1 & y > 0")).toBe("x &lt; 1 &amp; y &gt; 0");
    });

    it("returns safe text unchanged", () => {
      expect(escapeForTelegramHtml("plain text")).toBe("plain text");
    });
  });
});
