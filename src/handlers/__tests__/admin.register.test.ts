import type { Context } from "telegraf";
import { registerAdmin } from "../admin";

jest.mock("../../config/env", () => ({
  env: {
    TEACHER_USER_ID: "111",
    DEV_ID: undefined,
    ADMIN_IDS: ["222", "333"],
  },
}));

jest.mock("../../config/admins", () => ({
  loadAdmins: jest.fn(),
  hasAnyAdmin: jest.fn().mockReturnValue(true),
}));

jest.mock("../admin/actions", () => ({
  registerAdminMain: jest.fn(),
  registerAdminSections: jest.fn(),
  registerAdminSectionSub: jest.fn(),
  registerAdminLessons: jest.fn(),
  registerAdminFaq: jest.fn(),
  registerAdminCommands: jest.fn(),
}));

const loadAdmins = require("../../config/admins").loadAdmins as jest.Mock;
const actions = require("../admin/actions");

describe("registerAdmin", () => {
  const bot = {
    command: jest.fn((_name: string, _handler: (ctx: Context) => Promise<unknown>) => undefined),
    action: jest.fn((_pattern: string | RegExp, _handler: (ctx: Context) => Promise<unknown>) => undefined),
  } as { command: (name: string, handler: (ctx: Context) => Promise<unknown>) => void; action: (pattern: string | RegExp, handler: (ctx: Context) => Promise<unknown>) => void };

  beforeEach(() => {
    jest.clearAllMocks();
    (require("../../config/admins").hasAnyAdmin as jest.Mock).mockReturnValue(true);
  });

  it("calls loadAdmins with env admin ids", () => {
    registerAdmin(bot);
    expect(loadAdmins).toHaveBeenCalledWith(["111", "222", "333"]);
  });

  it("registers all admin action modules when hasAnyAdmin is true", () => {
    registerAdmin(bot);
    expect(actions.registerAdminMain).toHaveBeenCalledWith(bot);
    expect(actions.registerAdminSections).toHaveBeenCalledWith(bot);
    expect(actions.registerAdminSectionSub).toHaveBeenCalledWith(bot);
    expect(actions.registerAdminLessons).toHaveBeenCalledWith(bot);
    expect(actions.registerAdminFaq).toHaveBeenCalledWith(bot);
    expect(actions.registerAdminCommands).toHaveBeenCalledWith(bot);
  });

  it("does not register handlers when hasAnyAdmin is false", () => {
    (require("../../config/admins").hasAnyAdmin as jest.Mock).mockReturnValue(false);
    registerAdmin(bot);
    expect(actions.registerAdminMain).not.toHaveBeenCalled();
    expect(actions.registerAdminSections).not.toHaveBeenCalled();
  });
});
