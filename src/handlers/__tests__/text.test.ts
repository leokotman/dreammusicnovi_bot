import type { Context } from "telegraf";
import { handleText } from "../text";

jest.mock("../../config/env", () => ({
  env: { TEACHER_CHAT_ID: "123456" },
}));

jest.mock("../../config/admins", () => ({
  isAdmin: jest.fn().mockReturnValue(false),
}));

jest.mock("../../menus/main.menu", () => ({
  getMainMenu: jest.fn().mockReturnValue({ reply_markup: {} }),
}));

jest.mock("../../state/userState", () => ({
  getState: jest.fn().mockReturnValue(null),
  clearState: jest.fn(),
}));

jest.mock("../../middleware/rateLimit", () => ({
  checkTextRateLimit: jest.fn().mockReturnValue(true),
}));

jest.mock("../admin", () => ({
  handleAdminEdit: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../middleware/errorHandler", () => ({
  withErrorHandling: jest.fn((_ctx: Context, fn: () => Promise<unknown>) => fn()),
}));

const isAdmin = require("../../config/admins").isAdmin as jest.Mock;
const getState = require("../../state/userState").getState as jest.Mock;
const clearState = require("../../state/userState").clearState as jest.Mock;
const checkTextRateLimit = require("../../middleware/rateLimit").checkTextRateLimit as jest.Mock;
const handleAdminEdit = require("../admin").handleAdminEdit as jest.Mock;
const getMainMenu = require("../../menus/main.menu").getMainMenu as jest.Mock;

describe("handleText", () => {
  const replyWithHTML = jest.fn().mockResolvedValue(undefined);
  const reply = jest.fn().mockResolvedValue(undefined);
  const sendMessage = jest.fn().mockResolvedValue(undefined);

  const mockCtx = {
    from: { id: 999, first_name: "Test", username: "testuser" },
    message: { text: "Hello" },
    replyWithHTML,
    reply,
    telegram: { sendMessage },
  } as unknown as Context;

  beforeEach(() => {
    jest.clearAllMocks();
    isAdmin.mockReturnValue(false);
    getState.mockReturnValue(null);
    checkTextRateLimit.mockReturnValue(true);
    handleAdminEdit.mockResolvedValue(false);
  });

  it("does nothing when userId or text is missing", async () => {
    const noUser = { ...mockCtx, from: undefined } as unknown as Context;
    await handleText(noUser);
    expect(replyWithHTML).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();

    const noText = { ...mockCtx, message: {} } as unknown as Context;
    await handleText(noText);
    expect(replyWithHTML).not.toHaveBeenCalled();
  });

  it("when admin and handleAdminEdit handles: no other reply", async () => {
    isAdmin.mockReturnValue(true);
    handleAdminEdit.mockImplementation(async (_userId, _text, reply) => {
      await reply("Updated.");
      return true;
    });
    await handleText(mockCtx);
    expect(handleAdminEdit).toHaveBeenCalled();
    expect(replyWithHTML).toHaveBeenCalledWith("Updated.", expect.anything());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("when state is awaiting_question: clears state, forwards to teacher, replies thank you", async () => {
    getState.mockReturnValue({ type: "awaiting_question" });
    await handleText(mockCtx);
    expect(clearState).toHaveBeenCalledWith(999);
    expect(sendMessage).toHaveBeenCalledWith(
      "123456",
      expect.stringContaining("Новый вопрос от")
    );
    expect(sendMessage).toHaveBeenCalledWith(
      "123456",
      expect.stringContaining("Hello")
    );
    expect(replyWithHTML).toHaveBeenCalledWith(
      expect.stringContaining("Ваш вопрос отправлен"),
      expect.any(Object)
    );
  });

  it("when non-admin awaiting_question and rate limit exceeded: replies rate limit message", async () => {
    getState.mockReturnValue({ type: "awaiting_question" });
    checkTextRateLimit.mockReturnValue(false);
    await handleText(mockCtx);
    expect(reply).toHaveBeenCalledWith("Слишком много сообщений. Подождите минуту и попробуйте снова.");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("when no special state and rate limit exceeded: replies rate limit message", async () => {
    checkTextRateLimit.mockReturnValue(false);
    await handleText(mockCtx);
    expect(reply).toHaveBeenCalledWith("Слишком много сообщений. Подождите минуту и попробуйте снова.");
    expect(replyWithHTML).not.toHaveBeenCalled();
  });

  it("when no special state and rate limit ok: replies menu message", async () => {
    await handleText(mockCtx);
    expect(replyWithHTML).toHaveBeenCalledWith(
      "Используйте меню ниже: об уроках, задать вопрос или связаться с преподавателем.",
      expect.any(Object)
    );
    expect(getMainMenu).toHaveBeenCalled();
  });
});
