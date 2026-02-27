import * as fs from "fs";
import { loadAdmins, isAdmin, addAdmin, hasAnyAdmin, getAdminIds } from "../admins";

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
      expect(getAdminIds().sort()).toEqual([1, 2, 3]);
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

  describe("getAdminIds", () => {
    it("returns empty array when no admins loaded", () => {
      loadAdmins([]);
      expect(getAdminIds()).toEqual([]);
    });

    it("returns numeric ids in insertion order after loadAdmins", () => {
      loadAdmins(["10", "20", "5"]);
      expect(getAdminIds()).toEqual([10, 20, 5]);
    });

    it("includes new admin id after addAdmin", async () => {
      loadAdmins(["1"]);
      await addAdmin(99);
      const ids = getAdminIds().sort((a, b) => a - b);
      expect(ids).toEqual([1, 99]);
    });
  });

  describe("addAdmin", () => {
    it("adds id to set and writes file", async () => {
      loadAdmins(["1"]);
      await addAdmin(2);
      expect(isAdmin("2")).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const call = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(call[1] as string);
      expect(data.ids).toContain(1);
      expect(data.ids).toContain(2);
    });
  });
});
