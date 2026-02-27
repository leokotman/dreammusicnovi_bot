import type { Context } from "telegraf";
import { registerCommands } from "../commands";
import * as loader from "../../content/loader";
import * as mainMenu from "../../menus/main.menu";

jest.mock("../../content/loader", () => ({
  getVisibleSectionIds: jest.fn().mockReturnValue(["lessons", "ask", "contact"]),
  getSectionLabel: jest.fn((id: string) => {
    const labels: Record<string, string> = { lessons: "Об уроках", ask: "Задать вопрос", contact: "Связаться" };
    return labels[id] ?? id;
  }),
}));

jest.mock("../../menus/main.menu", () => ({
  getMainMenu: jest.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
  mainMenuMessage: "Welcome message",
}));

jest.mock("../../middleware/errorHandler", () => ({
  withErrorHandling: jest.fn((_ctx: Context, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("../../utils/html", () => ({
  escapeForTelegramHtml: jest.fn((s: string) => s),
}));

describe("registerCommands", () => {
  const replyWithHTML = jest.fn().mockResolvedValue(undefined);
  const mockCtx = { replyWithHTML } as unknown as Context;

  let startHandler: (ctx: Context) => Promise<unknown>;
  let helpHandler: (ctx: Context) => Promise<unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    const bot = {
      start: (fn: (ctx: Context) => Promise<unknown>) => { startHandler = fn; },
      help: (fn: (ctx: Context) => Promise<unknown>) => { helpHandler = fn; },
    };
    registerCommands(bot);
  });

  describe("start", () => {
    it("replies with main menu message and main menu keyboard", async () => {
      await startHandler(mockCtx);
      expect(replyWithHTML).toHaveBeenCalledTimes(1);
      expect(replyWithHTML).toHaveBeenCalledWith("Welcome message", { reply_markup: { inline_keyboard: [] } });
      expect(mainMenu.getMainMenu).toHaveBeenCalled();
    });
  });

  describe("help", () => {
    it("replies with help text and section list", async () => {
      await helpHandler(mockCtx);
      expect(loader.getVisibleSectionIds).toHaveBeenCalled();
      expect(loader.getSectionLabel).toHaveBeenCalledWith("lessons");
      expect(loader.getSectionLabel).toHaveBeenCalledWith("ask");
      expect(loader.getSectionLabel).toHaveBeenCalledWith("contact");
      expect(replyWithHTML).toHaveBeenCalledTimes(1);
      expect(replyWithHTML).toHaveBeenCalledWith(
        expect.stringContaining("Здравствуйте"),
        expect.any(Object)
      );
      expect(replyWithHTML).toHaveBeenCalledWith(
        expect.stringContaining("Об уроках"),
        expect.any(Object)
      );
    });
  });
});
