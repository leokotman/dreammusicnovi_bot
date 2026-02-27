import type { Context } from "telegraf";
import { registerCallbacks } from "../callbacks";

jest.mock("../../content/loader", () => ({
  getLesson: jest.fn().mockReturnValue("<p>Lesson content</p>"),
  getFaq: jest.fn().mockReturnValue("<p>Faq answer</p>"),
  getSectionLabel: jest.fn((id: string) => ({ lessons: "Об уроках", ask: "Задать вопрос", contact: "Контакты" }[id] ?? id)),
  getSectionContent: jest.fn().mockReturnValue("Section text"),
  getSectionSubItem: jest.fn().mockReturnValue({ label: "Sub", content: "Sub content" }),
  isSectionNested: jest.fn().mockReturnValue(false),
}));

jest.mock("../../utils/html", () => ({
  stripHtml: jest.fn((s: string) => s.replace(/<[^>]+>/g, "").trim()),
  escapeForTelegramHtml: jest.fn((s: string) => s),
}));

jest.mock("../../menus/main.menu", () => ({
  getMainMenu: jest.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
  mainMenuMessage: "Main menu",
  MAIN: "main",
  LESSONS: "lessons",
  ASK: "ask",
  CONTACT: "contact",
  MAIN_CUSTOM_PREFIX: "main_custom:",
  MAIN_CUSTOM_SUB_PREFIX: "main_sub:",
  getCustomSectionSubMenu: jest.fn().mockReturnValue({ reply_markup: {} }),
  getCustomSectionSubMenuMessage: jest.fn().mockReturnValue("Section sub menu"),
}));

jest.mock("../../menus/lessons.menu", () => ({
  getLessonsMenu: jest.fn().mockReturnValue({ reply_markup: {} }),
  getLessonsMenuForTopic: jest.fn().mockReturnValue({ reply_markup: {} }),
  getLessonLabel: jest.fn((k: string) => `Lesson-${k}`),
  getLessonsMenuMessage: jest.fn().mockReturnValue("Lessons menu"),
  parseLessonCallback: jest.fn((data: string) => (data.startsWith("lesson:") ? data.slice(7) : null)),
  LESSONS_BACK: "lessons_back",
}));

jest.mock("../../menus/ask.menu", () => ({
  getAskMenu: jest.fn().mockReturnValue({ reply_markup: {} }),
  getAskMenuForTopic: jest.fn().mockReturnValue({ reply_markup: {} }),
  getAskMenuMessage: jest.fn().mockReturnValue("Ask menu"),
  parseFaqCallback: jest.fn((data: string) => (data.startsWith("faq:") ? data.slice(4) : null)),
  getFaqLabel: jest.fn((k: string) => `Faq-${k}`),
  ASK_CUSTOM: "ask_custom",
  ASK_BACK: "ask_back",
}));

jest.mock("../../config/env", () => ({
  contact: {
    telegramUsername: "teacher",
    instagramUrl: "https://instagram.com/teacher",
    email: "teacher@example.com",
  },
}));

jest.mock("../../state/userState", () => ({
  setState: jest.fn(),
}));

jest.mock("../../middleware/errorHandler", () => ({
  withErrorHandling: jest.fn((_ctx: Context, fn: () => Promise<unknown>) => fn()),
}));

const mainMenu = require("../../menus/main.menu");
const lessonsMenu = require("../../menus/lessons.menu");
const askMenu = require("../../menus/ask.menu");
const loader = require("../../content/loader");
const userState = require("../../state/userState");

describe("registerCallbacks", () => {
  const answerCbQuery = jest.fn().mockResolvedValue(undefined);
  const editMessageText = jest.fn().mockResolvedValue(undefined);

  const createCtx = (data: string): Context =>
    ({
      from: { id: 1 },
      update: { callback_query: { data } },
      answerCbQuery,
      editMessageText,
    }) as unknown as Context;

  let actionHandlers: Map<string | RegExp, (ctx: Context) => Promise<unknown>> = new Map();

  beforeEach(() => {
    jest.clearAllMocks();
    actionHandlers = new Map();
    const bot = {
      action: (pattern: string | RegExp, fn: (ctx: Context) => Promise<unknown>) => {
        actionHandlers.set(pattern, fn);
      },
    };
    registerCallbacks(bot);
  });

  function getHandler(pattern: string | RegExp): ((ctx: Context) => Promise<unknown>) | undefined {
    const exact = actionHandlers.get(pattern) as ((ctx: Context) => Promise<unknown>) | undefined;
    if (exact) return exact;
    for (const [p, fn] of actionHandlers) {
      if (p instanceof RegExp && typeof pattern === "string" && p.test(pattern)) return fn as (ctx: Context) => Promise<unknown>;
    }
    return undefined;
  }

  it("MAIN action: answerCbQuery and editMessageText with main menu", async () => {
    const handler = getHandler("main");
    expect(handler).toBeDefined();
    await handler!(createCtx("main"));
    expect(answerCbQuery).toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledWith("Main menu", expect.objectContaining({ parse_mode: "HTML" }));
    expect(mainMenu.getMainMenu).toHaveBeenCalled();
  });

  it("LESSONS action: shows lessons menu", async () => {
    const handler = getHandler("lessons");
    expect(handler).toBeDefined();
    await handler!(createCtx("lessons"));
    expect(editMessageText).toHaveBeenCalledWith("Lessons menu", expect.any(Object));
    expect(lessonsMenu.getLessonsMenu).toHaveBeenCalled();
  });

  it("lesson: callback: gets lesson content and edits message", async () => {
    lessonsMenu.parseLessonCallback.mockReturnValue("price");
    const handler = getHandler("lesson:price");
    expect(handler).toBeDefined();
    await handler!(createCtx("lesson:price"));
    expect(loader.getLesson).toHaveBeenCalledWith("price");
    expect(editMessageText).toHaveBeenCalledWith(
      expect.stringContaining("Lesson-price"),
      expect.any(Object)
    );
  });

  it("faq: callback: gets faq content and edits message", async () => {
    askMenu.parseFaqCallback.mockReturnValue("amITooOld");
    const handler = getHandler("faq:amITooOld");
    expect(handler).toBeDefined();
    await handler!(createCtx("faq:amITooOld"));
    expect(loader.getFaq).toHaveBeenCalledWith("amITooOld");
    expect(editMessageText).toHaveBeenCalledWith(
      expect.stringContaining("Faq-amITooOld"),
      expect.any(Object)
    );
  });

  it("ASK_CUSTOM action: sets state awaiting_question and shows prompt", async () => {
    const handler = getHandler("ask_custom");
    expect(handler).toBeDefined();
    await handler!(createCtx("ask_custom"));
    expect(userState.setState).toHaveBeenCalledWith(1, { type: "awaiting_question" });
    expect(editMessageText).toHaveBeenCalledWith(
      expect.stringContaining("Задать свой вопрос"),
      expect.any(Object)
    );
  });

  it("CONTACT action: shows contact info", async () => {
    const handler = getHandler("contact");
    expect(handler).toBeDefined();
    await handler!(createCtx("contact"));
    expect(editMessageText).toHaveBeenCalledWith(
      expect.stringContaining("teacher"),
      expect.any(Object)
    );
    expect(editMessageText).toHaveBeenCalledWith(
      expect.stringContaining("teacher@example.com"),
      expect.any(Object)
    );
  });
});
