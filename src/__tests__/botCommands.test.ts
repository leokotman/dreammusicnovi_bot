import type { TelegramLike } from "../botCommands";
import {
  updateBotCommands,
  setCommandsForAdminChat,
  setTelegramForCommands,
  setCommandsForNewAdmin,
} from "../botCommands";

describe("botCommands", () => {
  const mockSetMyCommands = jest.fn().mockResolvedValue(true as true);
  const mockTelegram: TelegramLike = {
    setMyCommands: mockSetMyCommands,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("updateBotCommands", () => {
    it("sets default and all_private_chats to user commands only", async () => {
      await updateBotCommands(mockTelegram, []);
      expect(mockSetMyCommands).toHaveBeenCalledTimes(2);
      expect(mockSetMyCommands).toHaveBeenNthCalledWith(
        1,
        [
          { command: "start", description: "Главное меню" },
          { command: "help", description: "Помощь" },
        ],
        { scope: { type: "default" } }
      );
      expect(mockSetMyCommands).toHaveBeenNthCalledWith(
        2,
        [
          { command: "start", description: "Главное меню" },
          { command: "help", description: "Помощь" },
        ],
        { scope: { type: "all_private_chats" } }
      );
    });

    it("sets chat scope with admin commands for each admin id", async () => {
      await updateBotCommands(mockTelegram, [111, 222]);
      expect(mockSetMyCommands).toHaveBeenCalledTimes(4);
      expect(mockSetMyCommands).toHaveBeenNthCalledWith(
        3,
        [
          { command: "start", description: "Главное меню" },
          { command: "help", description: "Помощь" },
          { command: "admin", description: "Админ-панель" },
        ],
        { scope: { type: "chat", chat_id: 111 } }
      );
      expect(mockSetMyCommands).toHaveBeenNthCalledWith(
        4,
        [
          { command: "start", description: "Главное меню" },
          { command: "help", description: "Помощь" },
          { command: "admin", description: "Админ-панель" },
        ],
        { scope: { type: "chat", chat_id: 222 } }
      );
    });
  });

  describe("setCommandsForAdminChat", () => {
    it("calls setMyCommands with admin commands and chat scope", async () => {
      await setCommandsForAdminChat(mockTelegram, 12345);
      expect(mockSetMyCommands).toHaveBeenCalledTimes(1);
      expect(mockSetMyCommands).toHaveBeenCalledWith(
        [
          { command: "start", description: "Главное меню" },
          { command: "help", description: "Помощь" },
          { command: "admin", description: "Админ-панель" },
        ],
        { scope: { type: "chat", chat_id: 12345 } }
      );
    });
  });

  describe("setTelegramForCommands and setCommandsForNewAdmin", () => {
    it("setCommandsForNewAdmin does nothing when telegram not set", async () => {
      // Do not call setTelegramForCommands so module ref stays null
      await setCommandsForNewAdmin(999);
      expect(mockSetMyCommands).not.toHaveBeenCalled();
    });

    it("setCommandsForNewAdmin calls setMyCommands when telegram was set", async () => {
      setTelegramForCommands(mockTelegram);
      await setCommandsForNewAdmin(999);
      expect(mockSetMyCommands).toHaveBeenCalledTimes(1);
      expect(mockSetMyCommands).toHaveBeenCalledWith(
        [
          { command: "start", description: "Главное меню" },
          { command: "help", description: "Помощь" },
          { command: "admin", description: "Админ-панель" },
        ],
        { scope: { type: "chat", chat_id: 999 } }
      );
    });
  });
});
