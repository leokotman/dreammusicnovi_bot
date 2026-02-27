# DreamMusic Bot

A Telegram bot for a music teacher (vocal, piano): lesson info, FAQ answers, and contact links. The bot’s buttons and user-facing text are in Russian; no AI — static answers and forwarding questions to the teacher.

## Stack

- **Node.js** + **TypeScript**
- **Telegraf.js** (long polling)
- Content from HTML files (`content/lessons/`, `content/faq/`); teacher edits stored in `data/overrides.json`

## Setup and run

1. Create a bot in [@BotFather](https://t.me/BotFather) and copy the token.
2. Copy `.env.example` to `.env` and set:
   - `BOT_TOKEN` (required)
   - `TEACHER_CHAT_ID` — where to forward “ask your question” messages (teacher’s chat ID)
   - `TEACHER_USER_ID` — who can edit content via `/admin` (usually the same ID)
   - Optional: `TEACHER_TELEGRAM`, `TEACHER_INSTAGRAM`, `TEACHER_EMAIL`
3. Run:

```bash
npm install
npm run dev
```

For production: `npm run build` then `npm start`.

## Testing the bot

1. Create `.env` from `.env.example` and set at least `BOT_TOKEN`.
2. Run the app: `npm run dev` (or `npm run build` then `npm start`). Keep the terminal open.
3. In Telegram, open your bot (by username from BotFather) and send `/start`. You should see the main menu with three buttons.
4. To test **forwarding**: set `TEACHER_CHAT_ID` to your numeric ID (get it from [@userinfobot](https://t.me/userinfobot) or [@getidsbot](https://t.me/getidsbot)). Use “Задать вопрос” → “Задать свой вопрос” and send a message — it should appear in your chat.
5. To test **admin** editing: set `TEACHER_USER_ID` to that same numeric ID. Send `/admin`, then use the admin menu to edit a topic and send new text. Check `data/overrides.json` or “Об уроках” → “Стоимость”.

**Note:** `TEACHER_USER_ID` and `TEACHER_CHAT_ID` are **numeric IDs** (e.g. `123456789`), not usernames. The same number works for both when the teacher talks to the bot in a private chat.

### BotFather: only /start and /help in the menu

In BotFather, commands are set **per scope**. If `/admin` is set with scope “group administrators”, it only appears in groups where the user is an admin. In a **private chat** with the bot (1:1), that scope does not apply, so the teacher won’t see `/admin` in the menu.

**Fix:** In BotFather → your bot → **Set Commands**, choose scope **Default** (or “All private chats”) and add all three commands, e.g.:
- `start` — Старт
- `help` — Помощь
- `admin` — Админ

Then everyone sees all three in the menu; the bot **replies** to `/admin` only for admins (from env and `data/admins.json`).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Token from BotFather |
| `TEACHER_CHAT_ID` | No | Where to forward “ask your question” (chat ID) |
| `TEACHER_USER_ID` | No | One of the admins (user ID); at least one in env for first login |
| `DEV_ID` | No | Another admin (does not receive forwarded questions) |
| `ADMIN_IDS` | No | Extra admins in env: comma-separated, e.g. `123,456` |
| `TEACHER_TELEGRAM` | No | Telegram username (no @) |
| `TEACHER_INSTAGRAM` | No | Instagram link |
| `TEACHER_EMAIL` | No | Email for contact |

**Admins from Telegram:** Any current admin can send `/add_admin`, then in the next message send a user ID (number). That ID is saved to `data/admins.json` and gets admin rights without editing .env or the server.

## Editing content

- **Developer:** Edit HTML in `content/lessons/*.html` and `content/faq/*.html`.
- **Teacher / admin:** In Telegram, send `/admin` to the bot — a menu appears with “Редактировать «Об уроках»” and “Редактировать «Задать вопрос»”. Pick section and item; the bot shows the current saved text (you can copy and edit). Send the next message with the new text. Button labels in the bot (e.g. “Я уже слишком взрослый?”) are fixed in code; only the answer text changes when you edit.

**Where edits are stored:** Only in **`data/overrides.json`** on the machine where the bot runs. Repo HTML files are **not** changed. On load, the bot reads the HTML files and then applies overrides (overrides win). The `data/` folder is in `.gitignore`, so teacher edits are not in git; after a new deploy you may need to copy `data/overrides.json` to the server or edit content again via the bot.

## Rate limit and errors

- **Rate limit:** 5 text messages per user per minute (menu button taps are not counted).
- **Errors:** Handler errors are logged; the user gets “Произошла ошибка. Попробуйте позже…” (or similar).

## Project structure

- `src/index.ts` — entry point
- `src/bot.ts` — Telegraf setup and handler registration
- `src/menus/` — main menu, “Об уроках”, “Задать вопрос”
- `src/handlers/` — commands, callback buttons, text (including question forwarding), admin
- `src/content/loader.ts` — load content from HTML and overrides
- `content/lessons/`, `content/faq/` — HTML files with text
- `data/overrides.json` — teacher overrides (created on first edit)
- `src/state/` — user state (“waiting for question text”, etc.)
- `src/middleware/` — rate limit, error handling

## Deployment

The bot uses long polling and does not listen on a port — run it as a **worker / background service**, not as a web app.

- **Vercel** (webhook, free): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Connect GitHub, set env vars, deploy, then open `/api/webhook?set=YOUR_SECRET` once to set the Telegram webhook. No always-on process; teacher overrides do not persist.
- **Railway** (long polling, paid) or **Render** (long polling, free tier may sleep): same doc. Connect GitHub, set `BOT_TOKEN`, deploy.
- **Docker:** Run locally or on your own server: `docker build -t dreammusic-bot .` then `docker run --env-file .env dreammusic-bot`.
