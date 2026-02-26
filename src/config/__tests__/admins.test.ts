import * as fs from "fs";
import { loadAdmins, isAdmin, addAdmin, hasAnyAdmin } from "../admins";

jest.mock("fs");

describe("admins", () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error("no file");
    });
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
  });

  describe("loadAdmins", () => {
    it("loads env ids only when no file", () => {
      loadAdmins(["1", "2", "3"]);
      expect(isAdmin("1")).toBe(true);
      expect(isAdmin("2")).toBe(true);
      expect(isAdmin("3")).toBe(true);
      expect(isAdmin("4")).toBe(false);
      expect(hasAnyAdmin()).toBe(true);
    });

    it("hasAnyAdmin is false when empty", () => {
      loadAdmins([]);
      expect(hasAnyAdmin()).toBe(false);
      expect(isAdmin("1")).toBe(false);
    });

    it("merges file ids when file exists", () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ ids: [4, 5] }));
      loadAdmins(["1"]);
      expect(isAdmin("1")).toBe(true);
      expect(isAdmin("4")).toBe(true);
      expect(isAdmin("5")).toBe(true);
    });

    it("handles invalid json file", () => {
      mockFs.readFileSync.mockReturnValue("not json");
      expect(() => loadAdmins(["1"])).not.toThrow();
      expect(isAdmin("1")).toBe(true);
    });
  });

  describe("addAdmin", () => {
    it("adds id to set and writes file", () => {
      loadAdmins(["1"]);
      addAdmin(2);
      expect(isAdmin("2")).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const call = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(call[1] as string);
      expect(data.ids).toContain(1);
      expect(data.ids).toContain(2);
    });
  });
});
