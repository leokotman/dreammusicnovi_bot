# DreamMusic Bot

Телеграм-бот для преподавателя музыки (вокал, фортепиано): информация об уроках, ответы на вопросы и контакты. Всё на русском, без AI — только готовые ответы и пересылка вопросов преподавателю.

## Стек

- **Node.js** + **TypeScript**
- **Telegraf.js** (long polling)
- Контент в HTML-файлах (`content/lessons/`, `content/faq/`), правки преподавателя — в `data/overrides.json`

## Установка и запуск

1. Создайте бота в [@BotFather](https://t.me/BotFather) и скопируйте токен.
2. Скопируйте `.env.example` в `.env` и заполните:
   - `BOT_TOKEN` (обязательно)
   - `TEACHER_CHAT_ID` — куда пересылать вопросы (chat ID преподавателя)
   - `TEACHER_USER_ID` — кто может редактировать контент через /admin (обычно тот же ID)
   - при необходимости: `TEACHER_TELEGRAM`, `TEACHER_INSTAGRAM`, `TEACHER_EMAIL`
3. Запуск:

```bash
npm install
npm run dev
```

Для продакшена: `npm run build` и `npm start`.

## Testing the bot

1. Create `.env` from `.env.example` and set at least `BOT_TOKEN`.
2. Run the app: `npm run dev` (or `npm run build` then `npm start`). Keep the terminal open.
3. In Telegram, find your bot (by username from BotFather) and send `/start`. You should see the main menu with buttons.
4. To test **forwarding** “ask your question”: set `TEACHER_CHAT_ID` to your own numeric ID (get it by messaging [@userinfobot](https://t.me/userinfobot) or [@getidsbot](https://t.me/getidsbot)). Then use “Задать вопрос” → “Задать свой вопрос” and send a message — it should appear in your chat.
5. To test **admin** editing: set `TEACHER_USER_ID` to the same numeric ID. In the bot, send `/admin`, then e.g. `/edit_lesson price` and send the new text. Check `data/overrides.json` or the “Об уроках” → “Стоимость” screen.

**Note:** `TEACHER_USER_ID` and `TEACHER_CHAT_ID` are **numeric IDs** (e.g. `123456789`), not usernames like `@teacher`. Same number works for both when the teacher talks to the bot in a private chat.

## Переменные окружения

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `BOT_TOKEN` | Да | Токен от BotFather |
| `TEACHER_CHAT_ID` | Нет | Куда пересылать «задать свой вопрос» (chat ID) |
| `TEACHER_USER_ID` | Нет | Кто может использовать /admin (user ID) |
| `TEACHER_TELEGRAM` | Нет | Username в Telegram (без @) |
| `TEACHER_INSTAGRAM` | Нет | Ссылка на Instagram |
| `TEACHER_EMAIL` | Нет | Email для контакта |

## Редактирование контента

- **Разработчик:** правьте HTML в `content/lessons/*.html` и `content/faq/*.html`.
- **Преподаватель:** в Telegram отправьте боту `/admin` — появятся команды `/edit_lesson <ключ>` и `/edit_faq <ключ>`. После команды отправьте новый текст (можно с HTML: `<b>`, `<i>`). Изменения сохраняются в `data/overrides.json` и имеют приоритет над файлами. Только пользователь с `TEACHER_USER_ID` может использовать эти команды.

## Ограничение частоты и ошибки

- Лимит: **5 текстовых сообщений в минуту** на пользователя (нажатия кнопок меню не считаются).
- Ошибки в обработчиках логируются, пользователю отправляется сообщение «Произошла ошибка. Попробуйте позже…».

## Структура проекта

- `src/index.ts` — точка входа
- `src/bot.ts` — инициализация Telegraf и регистрация обработчиков
- `src/menus/` — главное меню, «Об уроках», «Задать вопрос»
- `src/handlers/` — команды, callback-кнопки, текст (в т.ч. пересылка вопроса), админ
- `src/content/loader.ts` — загрузка контента из HTML и overrides
- `content/lessons/`, `content/faq/` — HTML-файлы с текстами
- `data/overrides.json` — правки от преподавателя (создаётся при первом редактировании)
- `src/state/` — состояние пользователя («ожидает ввод вопроса» и т.д.)
- `src/middleware/` — лимит запросов, обработка ошибок

## Хостинг

Long polling подходит для любого окружения (Railway, Fly.io, Render и т.д.). Укажите `BOT_TOKEN` и при необходимости остальные переменные и запускайте `npm start`.
