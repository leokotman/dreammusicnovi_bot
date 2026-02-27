# Deploying DreamMusic Bot

Two modes:

- **Long polling** (Railway, Render): the app runs 24/7 and polls Telegram. No web server; run as a **worker / background process**.
- **Webhook** (Vercel): Telegram sends updates to your HTTPS URL. Serverless; no always-on process.

---

## Environment variables (bot)

Set these on the host (same as in `.env` locally; see `.env.example` and README).

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | **Yes** | Token from @BotFather |
| `TEACHER_CHAT_ID` | No | Where to forward "ask your question" |
| `TEACHER_USER_ID` | Recommended | At least one admin from env for first login |
| `DEV_ID`, `ADMIN_IDS` | No | Extra admins |
| `TEACHER_TELEGRAM`, `TEACHER_INSTAGRAM`, `TEACHER_EMAIL` | No | Contact links in "Связаться" |

For **Vercel** also set **WEBHOOK_SET_SECRET** (optional): a secret string you use once to set the webhook URL (see below).

---

## Vercel (webhook — free tier)

**Free** serverless. Telegram sends updates to `https://your-app.vercel.app/api/webhook`. No always-on process.

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import the **dreammusic-bot** repo.
2. **Environment variables:** Add **BOT_TOKEN** and any other bot vars (TEACHER_CHAT_ID, TEACHER_USER_ID, etc.). Optionally add **WEBHOOK_SET_SECRET** (e.g. a random string) so you can set the webhook once after deploy.
3. Deploy. Vercel will build and deploy; the `content/` folder is included for the webhook function via `vercel.json`.
4. **Set the webhook** (once per bot/deploy): Open in the browser:
   ```
   https://YOUR_VERCEL_DOMAIN.vercel.app/api/webhook?set=YOUR_WEBHOOK_SET_SECRET
   ```
   (Use the value you set for WEBHOOK_SET_SECRET.) That tells Telegram to send updates to your `/api/webhook` URL. You should see a response like "Webhook set to https://...".
5. Test the bot in Telegram: send `/start`.

**Note:** On Vercel there is no persistent disk. `data/overrides.json` and `data/admins.json` are not persisted across requests; teacher edits via `/admin` and `/add_admin` will not stick. Use Railway or Render if you need persistent overrides.

---

## Railway (long polling — simple, no script hacks)

**Paid** after trial ($5/mo or similar). Connect GitHub, set env vars, done. No custom startup scripts.

1. Go to [railway.app](https://railway.app) → **Start a New Project** → **Deploy from GitHub repo**.
2. Connect your GitHub and select the **dreammusic-bot** repo (and branch).
3. Railway will detect the **Dockerfile** and build. If it uses Nixpacks instead, set **Build Command** to `npm run build` and **Start Command** to `npm start` (or leave defaults if it runs `npm start`).
4. Open the service → **Variables** → add **BOT_TOKEN** and any other env vars (TEACHER_CHAT_ID, TEACHER_USER_ID, etc.).
5. Deploy. Every push to the linked branch can auto-deploy.

---

## Render (free tier — may sleep when idle)

**Free** Background Worker. Connect GitHub, set build/start commands and env vars. No Pterodactyl-style scripts.

1. Go to [render.com](https://render.com) → **New** → **Background Worker** (not Web Service).
2. Connect GitHub and select the **dreammusic-bot** repo.
3. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** add **BOT_TOKEN** and other vars (TEACHER_CHAT_ID, etc.).
4. Create the worker. It will build and run. The free tier may spin down after inactivity; the bot will be offline until the next request (or upgrade).

---

## Where overrides are stored

- **`data/overrides.json`** — lesson and FAQ text edited via `/admin`.
- **`data/admins.json`** — admin IDs added via `/add_admin`.

On **Vercel** there is no writable persistent disk: overrides and admins do **not** persist. On **Railway** and **Render** the disk is usually ephemeral too (lost on redeploy). After a deploy, the teacher can re-edit content via `/admin` and re-add admins via `/add_admin`. Locally, `data/` is a normal folder (in `.gitignore`); overrides and admins persist until you delete them.

---

## Check after deploy

1. Open the bot in Telegram and send `/start` — main menu appears.
2. Test forwarding (if `TEACHER_CHAT_ID` is set): "Задать вопрос" → "Задать свой вопрос" → send a message; it should arrive in the teacher's chat.
3. If `TEACHER_USER_ID` is set, send `/admin` — editing menu opens.

**Long polling (Railway/Render):** Logs should show `DreamMusic bot is running (long polling).` **Vercel:** No long-running process; check the function logs in the Vercel dashboard if something fails.
