# Cloudflare Worker dashboard scripts

These secret-free JavaScript files are ready to paste into the corresponding Cloudflare Worker editor. Replace the entire editor contents and deploy. Keep DELIVERY_ENABLED=false until staging readiness checks pass.

- bot-worker.mjs: dmn-telegram-bot-staging. Generated from src/delivery/worker.ts in this repository.
- website-worker.mjs: dmn-telegram-website-staging. Generated from lib/telegram/worker.ts in the website repository.

These are deployment copies, not separate implementations. Regenerate them from the TypeScript sources after source changes; do not edit these copies independently. Credentials belong in Cloudflare secrets, never in these files.
