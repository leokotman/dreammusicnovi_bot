# Deploying DreamMusic Bot

The bot uses **long polling** (it polls the Telegram API). No web server or port is needed. Run it as a **worker / background process**, not as a web app.

---

## Environment variables (bot)

Set these on the host (same as in `.env` locally; see `.env.example` and README). **Where to put them:** see [Secrets](#secrets) below.

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | **Yes** | Token from @BotFather |
| `TEACHER_CHAT_ID` | No | Where to forward "ask your question" |
| `TEACHER_USER_ID` | Recommended | At least one admin from env for first login |
| `DEV_ID`, `ADMIN_IDS` | No | Extra admins |
| `TEACHER_TELEGRAM`, `TEACHER_INSTAGRAM`, `TEACHER_EMAIL` | No | Contact links in "Связаться" |

---

## Secrets (BOT_TOKEN, etc.)

Putting **BOT_TOKEN** (and other secrets) in the host’s **web panel** means the provider stores them in their system (database, config, possibly logs). If you prefer not to give secrets to their UI:

- **SFTP + `.env`:** Upload a `.env` file to the server (e.g. into `/home/container`). The bot already loads `.env` via dotenv. The token stays in a file on the server and is never typed into the panel. The host could still read the server files if they have access, but the secret is not in their variable store or form submissions.
- **Panel variables:** Convenient (especially with Git deploy), but you are trusting the provider with the secret.

So: **SFTP is not inherently “more secure,” but uploading a `.env` file lets you keep secrets off the panel.** Use SFTP + `.env` if you don’t want to store BOT_TOKEN in the fps.ms website.

---

## fps.ms

We use [fps.ms](https://fps.ms) for hosting. The server runs in `/home/container`. Check their site for current plan details and limits.

You can deploy in two ways: **Git** (repo clone + auto install) or **SFTP** (upload files yourself).

### Option A: Deploy from GitHub

The panel **Startup** script will clone the repo, run `npm install` (which runs `npm run build` via postinstall), then start `MAIN_FILE`. Use the **Variables** section on the Startup page:

| Variable | Value |
|----------|--------|
| **GIT_ADDRESS** | `https://github.com/YOUR_USERNAME/dreammusic-bot` (your repo URL) |
| **BRANCH** | e.g. `main` or your deploy branch |
| **USERNAME** | Your GitHub username (for private repos) |
| **ACCESS_TOKEN** | GitHub [Personal Access Token](https://github.com/settings/tokens) (for private repos; scope `repo`) |
| **MAIN_FILE** | `dist/index.js` |
| **USER_UPLOAD** | Leave off or `0` (we use Git) |
| **AUTO_UPDATE** | Optional: enable if you want it to `git pull` on every startup |

Add **BOT_TOKEN** and any other bot env vars in the panel’s "Environment" or "Variables" list (you are trusting the provider with these values; see [Secrets](#secrets)). Then start the server. It will clone → `npm install` (which builds) → `node dist/index.js`.

### Option B: Deploy via SFTP (upload files)

1. **Set your fps.ms account password** (required for SFTP). See [fps.ms: Change password](https://docs.fps.ms/) if needed.
2. **Get SFTP details:** In [panel.fps.ms](https://panel.fps.ms) → your server → **Settings** tab → copy the **Username** from "SFTP Details". The **Host** is your server address (e.g. `mango.fps.ms`). **Port** is `2022`. Password is your fps.ms account password.
3. **Connect with an SFTP client** (e.g. [FileZilla](https://filezilla-project.org/)):
   - Host: your server address (e.g. `mango.fps.ms`)
   - Port: `2022`
   - Username: from Settings → SFTP Details
   - Password: your fps.ms account password  
   See [Connecting to SFTP – fps.ms](https://docs.fps.ms/getting-started/connecting-to-sftp).
4. **Upload** the project into `/home/container`: `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `content/`. Do **not** upload `node_modules` or `dist/`.  
   **Upload a `.env` file** with `BOT_TOKEN`, `TEACHER_CHAT_ID`, etc. (same as locally). The bot loads it via dotenv. That way you don't have to put secrets in the panel (see [Secrets](#secrets)). Keep `.env` only on your machine and on the server; it's in `.gitignore` so it never goes in git.
5. **Build and install on the server:** In the fps.ms panel, open the **Console** (or use SSH if available) and run:
   ```bash
   npm install && npm run build
   ```
   If there is no console, you can run the server once so it runs `npm install` (and postinstall will run `npm run build`), then the next start will use `dist/`.
6. **Startup Variables:** On the Startup page set **MAIN_FILE** to `dist/index.js`. You do **not** need to add BOT_TOKEN or other bot vars in the panel if you uploaded `.env`.
7. **Start** the server. Renew before 24h if your plan requires it.

---

## Where overrides are stored

- **`data/overrides.json`** — lesson and FAQ text edited via `/admin`.
- **`data/admins.json`** — admin IDs added via `/add_admin`.

On fps.ms the filesystem is usually ephemeral: these files can be lost on redeploy. After a deploy, the teacher can re-edit content via `/admin` and re-add admins via `/add_admin`. Check fps.ms docs for persistent storage if needed.

Locally, `data/` is a normal folder (in `.gitignore`); overrides and admins persist until you delete them.

---

## Check after deploy

1. Open the bot in Telegram and send `/start` — main menu appears.
2. Test forwarding (if `TEACHER_CHAT_ID` is set): "Задать вопрос" → "Задать свой вопрос" → send a message; it should arrive in the teacher's chat.
3. If `TEACHER_USER_ID` is set, send `/admin` — editing menu opens.

Logs should show: `DreamMusic bot is running (long polling).`
