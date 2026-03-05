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

For **Vercel** also set **WEBHOOK_SET_SECRET** (optional): a secret string you use once to set the webhook URL (see below). To make admin edits (saved lesson/FAQ content and `/add_admin`) persist, create a **Vercel Blob** store and set **BLOB_READ_WRITE_TOKEN** (see Vercel section below).

---

## Vercel (webhook — free tier)

**Free** serverless. Telegram sends updates to `https://your-app.vercel.app/api/webhook`. No always-on process.

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import the **dreammusic-bot** repo.
2. **Environment variables:** Add **BOT_TOKEN** and any other bot vars (TEACHER_CHAT_ID, TEACHER_USER_ID, etc.). Optionally add **WEBHOOK_SET_SECRET** (e.g. a random string) so you can set the webhook once after deploy.
3. **Persistent admin data (recommended):** So that edits via `/admin` and admins added via `/add_admin` persist, create a **Blob** store: Vercel Dashboard → **Storage** → **Create Database** → **Blob**. After creating the store, **BLOB_READ_WRITE_TOKEN** is automatically added to your project. No extra env step needed if you use the same project.
4. Deploy. Vercel will build and deploy; the `content/` folder is included for the webhook function via `vercel.json`.
5. **Set the webhook** (once per bot/deploy): Open in the browser:
   ```
   https://YOUR_VERCEL_DOMAIN.vercel.app/api/webhook?set=YOUR_WEBHOOK_SET_SECRET
   ```
   (Use the value you set for WEBHOOK_SET_SECRET.) That tells Telegram to send updates to your `/api/webhook` URL. You should see a response like "Webhook set to https://...".
   **If you tested locally with polling** (and ran `deleteWebhook`), run the same URL again after deploy so updates go back to Vercel.
6. Test the bot in Telegram: send `/start`. Use `/admin` to edit lesson/FAQ text; changes are stored in Vercel Blob when **BLOB_READ_WRITE_TOKEN** is set.
7. **Logs:** In Vercel → Project → **Logs** (or **Deployments** → select a deployment → **Functions** → click the webhook function). Look for `[ask]` messages when users submit questions.

---

## Switching webhook ↔ local polling (Vercel users)

When the bot uses a **webhook**, Telegram sends all updates to your Vercel URL. To run the bot **locally** with `npm run dev` (long polling), Telegram must stop using the webhook so your local process can receive updates via `getUpdates`.

**1. Delete the webhook** (before running locally)

Call Telegram’s API once (replace `YOUR_BOT_TOKEN` with your real token):

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/deleteWebhook"
```

You should get `{"ok":true,"result":true}`. From now on, no updates are sent to Vercel.

**2. Run the bot locally**

```bash
npm run dev
```

Use the bot in Telegram; updates will go to your local process.

**3. Restore the webhook** (after you’re done testing locally)

So that production (Vercel) receives updates again, set the webhook back. Open in the browser (or `curl`):

```
https://YOUR_VERCEL_DOMAIN.vercel.app/api/webhook?set=YOUR_WEBHOOK_SET_SECRET
```

Use the same **WEBHOOK_SET_SECRET** value you set in Vercel env. You should see a response like "Webhook set to https://...". After that, all updates go to Vercel again; stop local `npm run dev` when you’re done.

**Summary**

| Step              | Command / action |
|-------------------|-------------------|
| Use Vercel        | Webhook is set → updates go to Vercel. |
| Switch to local   | `curl .../deleteWebhook` → then `npm run dev`. |
| Switch back       | Open `.../api/webhook?set=SECRET` in browser. |

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

## Where saved content and admins are stored

- **Saved content** (lesson/FAQ edits via `/admin`) and **admins** (added via `/add_admin`) are stored in:
  - **Vercel:** [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) when **BLOB_READ_WRITE_TOKEN** is set (create a Blob store in the dashboard; the token is added automatically). Without it, edits do not persist across requests.
  - **Local / Railway / Render:** `data/overrides.json` and `data/admins.json` on disk. On Railway/Render the filesystem is often ephemeral (lost on redeploy); the teacher can re-edit via `/admin` after a deploy.

---

## Check after deploy

1. Open the bot in Telegram and send `/start` — main menu appears.
2. Test forwarding (if `TEACHER_CHAT_ID` is set): "Задать вопрос" → "Задать свой вопрос" → send a message; it should arrive in the teacher's chat.
3. If `TEACHER_USER_ID` is set, send `/admin` — editing menu opens.

**Long polling (Railway/Render):** Logs should show `DreamMusic bot is running (long polling).` **Vercel:** No long-running process; check the function logs in the Vercel dashboard if something fails.

Deleted (hidden) menu sections are kept in storage for **3 months** and can be restored from «Восстановить удалённые разделы» in admin. When an admin opens that screen, the app first purges sections whose `dateDeleted` is older than 3 months, then shows the list of what can still be restored. No cron or CRON_SECRET needed.

---

## One-time Blob migration (unified sections)

If your Blob was created before the unified-sections refactor, it may still contain legacy keys (`mainSectionLabels`, `customMainSections`, `customMainSectionOrder`, `hiddenMainSectionIds`). The app migrates on load and saves the new shape when you edit. To rewrite the Blob once with only the new shape, run (from repo root):

```bash
BLOB_READ_WRITE_TOKEN=<your-vercel-blob-token> npx ts-node scripts/migrate-blob-to-unified-sections.ts
```

You can copy the token from Vercel → Project → Storage → Blob → .env.local or Environment Variables. The script reads the current Blob, converts to `sections` / `sectionOrder` / `hiddenSectionIds` / `deletedSections`, and writes it back.
