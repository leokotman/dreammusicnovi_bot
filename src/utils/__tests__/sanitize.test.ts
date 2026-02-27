import {
  sanitizeForDb,
  sanitizeUrl,
  sanitizeTelegramUsername,
  sanitizeEmail,
} from "../sanitize";

describe("sanitize", () => {
  describe("sanitizeForDb", () => {
    it("strips script tags", () => {
      expect(sanitizeForDb("Hello <script>alert(1)</script> world")).toBe("Hello  world");
    });

    it("strips event handlers", () => {
      expect(sanitizeForDb('<p onclick="evil()">x</p>')).not.toContain("onclick");
    });

    it("trims and returns plain text unchanged", () => {
      expect(sanitizeForDb("  Safe text  ")).toBe("Safe text");
    });
  });

  describe("sanitizeUrl", () => {
    it("allows https URLs", () => {
      expect(sanitizeUrl("https://instagram.com/user")).toBe("https://instagram.com/user");
    });

    it("allows http and mailto", () => {
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
      expect(sanitizeUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
    });

    it("returns empty for javascript: URLs", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    });

    it("returns empty for data: URLs", () => {
      expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    });
  });

  describe("sanitizeTelegramUsername", () => {
    it("strips @ and keeps alphanumeric and underscore", () => {
      expect(sanitizeTelegramUsername("@my_user")).toBe("my_user");
    });

    it("removes spaces and dangerous chars", () => {
      expect(sanitizeTelegramUsername("my user")).toBe("myuser");
      expect(sanitizeTelegramUsername("user<script>")).toBe("userscript");
    });
  });

  describe("sanitizeEmail", () => {
    it("trims and removes angle brackets", () => {
      expect(sanitizeEmail("  test@example.com  ")).toBe("test@example.com");
      expect(sanitizeEmail("<test@example.com>")).not.toContain("<");
    });
  });
});
