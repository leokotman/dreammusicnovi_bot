import {
  FAQ_LABELS,
  parseFaqCallback,
  getAskMenu,
  getAskMenuForTopic,
  askMenuMessage,
  ASK_CUSTOM,
  ASK_BACK,
} from "../ask.menu";
import { MAIN } from "../main.menu";

describe("ask.menu", () => {
  describe("FAQ_LABELS", () => {
    it("has Russian labels for all keys", () => {
      expect(FAQ_LABELS.amITooOld).toBe("Я уже слишком взрослый?");
      expect(FAQ_LABELS.needEducation).toBe("Нужно ли музыкальное образование?");
      expect(FAQ_LABELS.howOftenPractice).toBe("Как часто нужно заниматься дома?");
      expect(FAQ_LABELS.noEarForMusic).toBe("У меня нет слуха — получится ли?");
    });
  });

  describe("parseFaqCallback", () => {
    it("parses valid faq callback", () => {
      expect(parseFaqCallback("faq:amITooOld")).toBe("amITooOld");
      expect(parseFaqCallback("faq:noEarForMusic")).toBe("noEarForMusic");
    });

    it("returns null for wrong prefix", () => {
      expect(parseFaqCallback("lesson:amITooOld")).toBeNull();
      expect(parseFaqCallback("other")).toBeNull();
    });

    it("returns null for unknown key", () => {
      expect(parseFaqCallback("faq:unknown")).toBeNull();
    });
  });

  describe("askMenuMessage", () => {
    it("contains expected text", () => {
      expect(askMenuMessage).toContain("Задать вопрос");
      expect(askMenuMessage).toContain("Выберите вопрос");
    });
  });

  describe("getAskMenu", () => {
    it("returns keyboard with MAIN and ASK_CUSTOM", () => {
      const menu = getAskMenu();
      type Button = { callback_data?: string };
      const keyboard = (menu.reply_markup as { inline_keyboard: Button[][] }).inline_keyboard;
      const flat: Button[] = keyboard.flat();
      const callbackData = flat.map((b) => b.callback_data);
      expect(callbackData).toContain(MAIN);
      expect(callbackData).toContain(ASK_CUSTOM);
    });
  });

  describe("getAskMenuForTopic", () => {
    it("returns keyboard with ASK_BACK", () => {
      const menu = getAskMenuForTopic();
      type Button = { callback_data?: string };
      const keyboard = (menu.reply_markup as { inline_keyboard: Button[][] }).inline_keyboard;
      const flat: Button[] = keyboard.flat();
      const callbackData = flat.map((b) => b.callback_data);
      expect(callbackData).toContain(ASK_BACK);
    });
  });
});
