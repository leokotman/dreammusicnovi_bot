import { parseAdminIds } from "../envHelpers";

describe("parseAdminIds", () => {
  it("returns empty array for undefined", () => {
    expect(parseAdminIds(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseAdminIds("")).toEqual([]);
  });

  it("parses single id", () => {
    expect(parseAdminIds("123")).toEqual(["123"]);
  });

  it("parses comma-separated ids", () => {
    expect(parseAdminIds("123,456,789")).toEqual(["123", "456", "789"]);
  });

  it("trims whitespace", () => {
    expect(parseAdminIds(" 123 , 456 ")).toEqual(["123", "456"]);
  });

  it("filters empty segments", () => {
    expect(parseAdminIds("123,,456")).toEqual(["123", "456"]);
  });
});
