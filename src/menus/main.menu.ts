import { Markup } from "telegraf";

export const MAIN = "main";
export const LESSONS = "lessons";
export const ASK = "ask";
export const CONTACT = "contact";

export function getMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1️⃣ Об уроках", LESSONS)],
    [Markup.button.callback("2️⃣ Задать вопрос", ASK)],
    [Markup.button.callback("3️⃣ Связаться с преподавателем", CONTACT)],
  ]);
}

export const mainMenuMessage = `
🎵 <b>Добро пожаловать!</b>

Выберите пункт меню:
`.trim();
