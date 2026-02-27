import type { Context } from "telegraf";
import { registerAdminMain } from "../main";
import { registerAdminCommands } from "../commands";
import { registerAdminSections } from "../sections";
import { registerAdminFaq } from "../faq";
import { registerAdminLessons } from "../lessons";
import { registerAdminSectionSub } from "../sectionSub";
import * as C from "../../constants";

jest.mock("../../../../content/loader", () => ({
  getSectionLabel: jest.fn((id: string) => ({ lessons: "Об уроках", ask: "Задать вопрос", contact: "Контакты" }[id] ?? id)),
  getLessonLabel: jest.fn((k: string) => `Lesson-${k}`),
  getFaqLabel: jest.fn((k: string) => `Faq-${k}`),
  getSections: jest.fn().mockReturnValue([{ key: "sec_foo", label: "Кастомный", type: "nested" }]),
  getSectionSubIds: jest.fn().mockReturnValue(["item_1"]),
  getSectionSubItem: jest.fn().mockReturnValue({ label: "Пункт 1", content: "Текст" }),
  getVisibleSectionIds: jest.fn().mockReturnValue(["lessons", "ask", "contact"]),
  getAllLessonKeys: jest.fn().mockReturnValue(["price", "vocal"]),
  getAllFaqKeys: jest.fn().mockReturnValue(["amITooOld", "noEarForMusic"]),
  getHiddenSectionIds: jest.fn().mockReturnValue([]),
  getHiddenLessonKeys: jest.fn().mockReturnValue([]),
  getHiddenFaqKeys: jest.fn().mockReturnValue([]),
  getLesson: jest.fn().mockReturnValue("Lesson content"),
  getFaq: jest.fn().mockReturnValue("Faq content"),
  isSectionNested: jest.fn((k: string) => k === "sec_foo"),
  addHiddenSectionId: jest.fn().mockResolvedValue(undefined),
  removeHiddenSectionId: jest.fn().mockResolvedValue(undefined),
  addHiddenLessonKey: jest.fn().mockResolvedValue(undefined),
  removeHiddenLessonKey: jest.fn().mockResolvedValue(undefined),
  addHiddenFaqKey: jest.fn().mockResolvedValue(undefined),
  removeHiddenFaqKey: jest.fn().mockResolvedValue(undefined),
  removeCustomLesson: jest.fn().mockResolvedValue(undefined),
  removeCustomFaq: jest.fn().mockResolvedValue(undefined),
  removeSectionSubItem: jest.fn().mockResolvedValue(undefined),
  addSectionNested: jest.fn().mockResolvedValue(undefined),
  isLessonKeyFixed: jest.fn((k: string) => ["price", "vocal"].includes(k)),
  isFaqKeyFixed: jest.fn((k: string) => ["amITooOld", "noEarForMusic"].includes(k)),
  purgeDeletedSectionsOlderThanThreeMonths: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../../state/userState", () => ({
  setState: jest.fn(),
  getState: jest.fn().mockReturnValue(null),
  clearState: jest.fn(),
}));

jest.mock("../../../../middleware/errorHandler", () => ({
  withErrorHandling: jest.fn((_ctx: Context, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("../../../../config/admins", () => ({
  isAdmin: jest.fn().mockReturnValue(true),
}));

const loader = require("../../../../content/loader");
const userState = require("../../../../state/userState");
const menus = require("../../menus");

jest.mock("../../menus", () => ({
  canUseAdmin: jest.fn().mockReturnValue(true),
  getAdminMainMenu: jest.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
  getAdminMainMenuSubmenu: jest.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
  getAdminRestoreMessage: jest.fn().mockReturnValue("Restore message"),
  getAdminRestoreMenu: jest.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
  getAdminLessonsMenu: jest.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
  getAdminFaqMenu: jest.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
  truncateForPreview: jest.fn((s: string) => s.slice(0, 100)),
}));

type Handler = (ctx: Context) => Promise<unknown>;
const actionHandlers: { pattern: string | RegExp; handler: Handler }[] = [];
const commandHandlers: Map<string, Handler> = new Map();

function createBot() {
  actionHandlers.length = 0;
  commandHandlers.clear();
  return {
    command: (name: string, handler: Handler) => {
      commandHandlers.set(name, handler);
    },
    action: (pattern: string | RegExp, handler: Handler) => {
      actionHandlers.push({ pattern, handler });
    },
  };
}

function getActionHandler(data: string): Handler | undefined {
  const exact = actionHandlers.find((p) => p.pattern === data);
  if (exact) return exact.handler;
  const regex = actionHandlers.find(
    (p) => p.pattern instanceof RegExp && (p.pattern as RegExp).test(data)
  );
  return regex?.handler;
}

function createCtx(data: string, fromId = 999) {
  return {
    from: { id: fromId },
    update: { callback_query: { data } },
    message: { text: data },
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    replyWithHTML: jest.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

function createCommandCtx(commandText: string, fromId = 999) {
  return {
    from: { id: fromId },
    message: { text: commandText },
    reply: jest.fn().mockResolvedValue(undefined),
    replyWithHTML: jest.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("admin actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (menus.canUseAdmin as jest.Mock).mockReturnValue(true);
  });

  describe("main", () => {
    it("admin command shows admin menu", async () => {
      const bot = createBot();
      registerAdminMain(bot);
      const handler = commandHandlers.get("admin");
      expect(handler).toBeDefined();
      const ctx = createCommandCtx("/admin");
      await handler!(ctx);
      expect(ctx.replyWithHTML).toHaveBeenCalledWith(
        expect.stringContaining("Админ"),
        expect.any(Object)
      );
    });

    it("ADM_MAIN action shows admin menu", async () => {
      const bot = createBot();
      registerAdminMain(bot);
      const handler = getActionHandler(C.ADM_MAIN);
      expect(handler).toBeDefined();
      const ctx = createCtx(C.ADM_MAIN);
      await handler!(ctx);
      expect(ctx.answerCbQuery).toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Админ"),
        expect.any(Object)
      );
    });

    it("ADM_MAIN_MENU action shows sections submenu", async () => {
      const bot = createBot();
      registerAdminMain(bot);
      const handler = getActionHandler(C.ADM_MAIN_MENU);
      expect(handler).toBeDefined();
      const ctx = createCtx(C.ADM_MAIN_MENU);
      await handler!(ctx);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Разделы"),
        expect.any(Object)
      );
    });

    it("ADM_RESTORE action calls purge and shows restore menu", async () => {
      const bot = createBot();
      registerAdminMain(bot);
      const handler = getActionHandler(C.ADM_RESTORE);
      expect(handler).toBeDefined();
      const ctx = createCtx(C.ADM_RESTORE);
      await handler!(ctx);
      expect(loader.purgeDeletedSectionsOlderThanThreeMonths).toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalledWith("Restore message", expect.any(Object));
    });

    it("ADM_RESTORE_SECTION restores section and replies", async () => {
      const bot = createBot();
      registerAdminMain(bot);
      const handler = getActionHandler(`${C.ADM_RESTORE_SECTION_PREFIX}sec_foo`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_RESTORE_SECTION_PREFIX}sec_foo`);
      await handler!(ctx);
      expect(loader.removeHiddenSectionId).toHaveBeenCalledWith("sec_foo");
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("восстановлен"));
    });

    it("ADM_RESTORE_LESSON restores lesson", async () => {
      const bot = createBot();
      registerAdminMain(bot);
      const handler = getActionHandler(`${C.ADM_RESTORE_LESSON_PREFIX}price`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_RESTORE_LESSON_PREFIX}price`);
      await handler!(ctx);
      expect(loader.removeHiddenLessonKey).toHaveBeenCalledWith("price");
    });

    it("ADM_RESTORE_FAQ restores faq", async () => {
      const bot = createBot();
      registerAdminMain(bot);
      const handler = getActionHandler(`${C.ADM_RESTORE_FAQ_PREFIX}amITooOld`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_RESTORE_FAQ_PREFIX}amITooOld`);
      await handler!(ctx);
      expect(loader.removeHiddenFaqKey).toHaveBeenCalledWith("amITooOld");
    });
  });

  describe("commands", () => {
    it("add_admin command sets state and replies", async () => {
      const bot = createBot();
      registerAdminCommands(bot);
      const handler = commandHandlers.get("add_admin");
      expect(handler).toBeDefined();
      const ctx = createCommandCtx("/add_admin");
      await handler!(ctx);
      expect(userState.setState).toHaveBeenCalledWith(999, { type: "awaiting_add_admin" });
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("user ID"), expect.any(Object));
    });

    it("edit_lesson with valid key sets state", async () => {
      const bot = createBot();
      registerAdminCommands(bot);
      const handler = commandHandlers.get("edit_lesson");
      expect(handler).toBeDefined();
      const ctx = createCommandCtx("/edit_lesson price");
      await handler!(ctx);
      expect(userState.setState).toHaveBeenCalledWith(999, { type: "awaiting_edit_lesson", key: "price" });
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Lesson-price"));
    });

    it("edit_lesson with invalid key replies usage", async () => {
      const bot = createBot();
      registerAdminCommands(bot);
      const handler = commandHandlers.get("edit_lesson");
      const ctx = createCommandCtx("/edit_lesson invalid");
      loader.getAllLessonKeys.mockReturnValue(["price"]);
      await handler!(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Использование"));
      expect(userState.setState).not.toHaveBeenCalled();
    });

    it("edit_faq with valid key sets state", async () => {
      const bot = createBot();
      registerAdminCommands(bot);
      const handler = commandHandlers.get("edit_faq");
      const ctx = createCommandCtx("/edit_faq amITooOld");
      await handler!(ctx);
      expect(userState.setState).toHaveBeenCalledWith(999, { type: "awaiting_edit_faq", key: "amITooOld" });
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Faq-amITooOld"));
    });
  });

  describe("sections", () => {
    it("section detail shows edit/delete buttons", async () => {
      const bot = createBot();
      registerAdminSections(bot);
      const handler = getActionHandler(`${C.ADM_SECTION_PREFIX}lessons`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_SECTION_PREFIX}lessons`);
      await handler!(ctx);
      expect(loader.getSectionLabel).toHaveBeenCalledWith("lessons");
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Об уроках"),
        expect.any(Object)
      );
    });

    it("section edit sets state and replies current label", async () => {
      const bot = createBot();
      registerAdminSections(bot);
      const handler = getActionHandler(`${C.ADM_SECTION_EDIT_PREFIX}lessons`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_SECTION_EDIT_PREFIX}lessons`);
      await handler!(ctx);
      expect(userState.setState).toHaveBeenCalledWith(999, {
        type: "awaiting_edit_main_section_label",
        key: "lessons",
      });
      expect(ctx.reply).toHaveBeenCalledWith("Об уроках");
    });

    it("confirm delete section calls addHiddenSectionId", async () => {
      const bot = createBot();
      registerAdminSections(bot);
      const handler = getActionHandler(`${C.ADM_CONFIRM_DEL_SECTION_PREFIX}sec_foo`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_CONFIRM_DEL_SECTION_PREFIX}sec_foo`);
      await handler!(ctx);
      expect(loader.addHiddenSectionId).toHaveBeenCalledWith("sec_foo");
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("удалён"),
        expect.any(Object)
      );
    });
  });

  describe("faq", () => {
    it("ADM_FAQ shows faq menu", async () => {
      const bot = createBot();
      registerAdminFaq(bot);
      const handler = getActionHandler(C.ADM_FAQ);
      expect(handler).toBeDefined();
      const ctx = createCtx(C.ADM_FAQ);
      await handler!(ctx);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Вопросы раздела"),
        expect.any(Object)
      );
    });

    it("ADM_FAQ_SEL shows question edit options", async () => {
      const bot = createBot();
      registerAdminFaq(bot);
      const handler = getActionHandler(`${C.ADM_FAQ_SEL_PREFIX}amITooOld`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_FAQ_SEL_PREFIX}amITooOld`);
      await handler!(ctx);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Faq-amITooOld"),
        expect.any(Object)
      );
    });

    it("ADM_CONFIRM_DEL_FAQ fixed key calls addHiddenFaqKey", async () => {
      const bot = createBot();
      registerAdminFaq(bot);
      const handler = getActionHandler(`${C.ADM_CONFIRM_DEL_FAQ_PREFIX}amITooOld`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_CONFIRM_DEL_FAQ_PREFIX}amITooOld`);
      await handler!(ctx);
      expect(loader.addHiddenFaqKey).toHaveBeenCalledWith("amITooOld");
      expect(ctx.editMessageText).toHaveBeenCalledWith("Вопрос удалён из списка.", expect.any(Object));
    });

    it("ADM_ADD_FAQ sets awaiting_new_faq_label", async () => {
      const bot = createBot();
      registerAdminFaq(bot);
      const handler = getActionHandler(C.ADM_ADD_FAQ);
      expect(handler).toBeDefined();
      const ctx = createCtx(C.ADM_ADD_FAQ);
      await handler!(ctx);
      expect(userState.setState).toHaveBeenCalledWith(999, { type: "awaiting_new_faq_label" });
    });
  });

  describe("lessons", () => {
    it("ADM_LESSONS shows lessons menu", async () => {
      const bot = createBot();
      registerAdminLessons(bot);
      const handler = getActionHandler(C.ADM_LESSONS);
      expect(handler).toBeDefined();
      const ctx = createCtx(C.ADM_LESSONS);
      await handler!(ctx);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Темы раздела"),
        expect.any(Object)
      );
    });

    it("ADM_LESSON_SEL shows topic edit options", async () => {
      const bot = createBot();
      registerAdminLessons(bot);
      const handler = getActionHandler(`${C.ADM_LESSON_SEL_PREFIX}price`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_LESSON_SEL_PREFIX}price`);
      await handler!(ctx);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Lesson-price"),
        expect.any(Object)
      );
    });

    it("ADM_CONFIRM_DEL_LESSON fixed key calls addHiddenLessonKey", async () => {
      const bot = createBot();
      registerAdminLessons(bot);
      const handler = getActionHandler(`${C.ADM_CONFIRM_DEL_LESSON_PREFIX}price`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_CONFIRM_DEL_LESSON_PREFIX}price`);
      await handler!(ctx);
      expect(loader.addHiddenLessonKey).toHaveBeenCalledWith("price");
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("удалён из списка"),
        expect.any(Object)
      );
    });

    it("ADM_ADD_LESSON sets awaiting_new_lesson_label", async () => {
      const bot = createBot();
      registerAdminLessons(bot);
      const handler = getActionHandler(C.ADM_ADD_LESSON);
      expect(handler).toBeDefined();
      const ctx = createCtx(C.ADM_ADD_LESSON);
      await handler!(ctx);
      expect(userState.setState).toHaveBeenCalledWith(999, { type: "awaiting_new_lesson_label" });
    });
  });

  describe("sectionSub", () => {
    it("list: sectionKey shows sub-items", async () => {
      const bot = createBot();
      registerAdminSectionSub(bot);
      const handler = getActionHandler(`${C.ADM_SECTION_SUB_PREFIX}list:sec_foo`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_SECTION_SUB_PREFIX}list:sec_foo`);
      await handler!(ctx);
      expect(loader.getSectionSubIds).toHaveBeenCalledWith("sec_foo");
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Подпункты"),
        expect.any(Object)
      );
    });

    it("section:item shows sub-item actions", async () => {
      const bot = createBot();
      registerAdminSectionSub(bot);
      const handler = getActionHandler(`${C.ADM_SECTION_SUB_PREFIX}sec_foo:item_1`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_SECTION_SUB_PREFIX}sec_foo:item_1`);
      await handler!(ctx);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Пункт 1"),
        expect.any(Object)
      );
    });

    it("confirm delete sub-item calls removeSectionSubItem", async () => {
      const bot = createBot();
      registerAdminSectionSub(bot);
      const handler = getActionHandler(`${C.ADM_CONFIRM_DEL_SECTION_SUB_PREFIX}sec_foo:item_1`);
      expect(handler).toBeDefined();
      const ctx = createCtx(`${C.ADM_CONFIRM_DEL_SECTION_SUB_PREFIX}sec_foo:item_1`);
      await handler!(ctx);
      expect(loader.removeSectionSubItem).toHaveBeenCalledWith("sec_foo", "item_1");
    });
  });
});
