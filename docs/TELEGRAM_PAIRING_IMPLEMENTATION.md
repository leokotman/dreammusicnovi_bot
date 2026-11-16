# Telegram pairing implementation checkpoint

Updated: 2026-11-16. Implementation started; visitor pairing is not activated.
Authoritative design: website repository `docs/TELEGRAM_CONNECTION_SIMPLIFICATION_PLAN.md`.

## First increment: authenticated Telegram transport and pairing protocol

- Webhook POSTs require `TELEGRAM_WEBHOOK_SECRET` in Telegram's
  `X-Telegram-Bot-Api-Secret-Token` header before content/admin loading or bot work.
  Missing/invalid server configuration returns 503; missing/wrong/ambiguous headers
  return 403. Secrets must be independent random base64url values, 32–256 characters.
- Explicit existing administrative webhook setup configures `secret_token`, keeps
  an existing webhook URL, retains pending updates and preserves subscriptions and
  max connections. Add `my_chat_member` to explicit subscriptions. Telegram's default
  subscription already includes it and is preserved without enumerating update types.
  First registration requires `TELEGRAM_WEBHOOK_URL`; request Host is never a target.
  Setup failures and webhook exceptions are redacted at this route boundary.
- Long-polling startup inspects webhook state and refuses an active webhook instead
  of allowing Telegraf launch to delete it. Inspection failure also prevents launch.
- Pairing protocol helpers validate the canonical `dmn1_` plus 256-bit base64url
  attempt format (48 characters), hash attempts, validate real private-chat identity
  with a username, and derive deterministic six-digit codes and domain-separated
  code hashes. These helpers do not authenticate a transport, grant consent, store
  candidates, or issue website connection proofs on their own.
- Coverage collection now includes the webhook route. New tests cover the route,
  setup, polling guard and protocol, including failure paths and identity isolation.

## Configuration boundary

Do not deploy the authenticated handler against an unconfigured existing webhook:
Telegram's configured `secret_token` and runtime `TELEGRAM_WEBHOOK_SECRET` must match.
Otherwise all webhook updates are rejected, including ordinary bot commands.
Coordinate that isolated-staging configuration as a separate authorized operation.
Neither administrative registration, credential changes nor deployment was executed
by this implementation increment. Polling environments do not need a webhook secret.

No runtime databases, credentials, webhook registrations, queues or delivery
behavior were changed. The additive consent migration described below has only
been applied in a disposable scratch database. Ordinary commands and visitor OIDC remain the current flow.
The code helpers are deliberately not wired into Start until the durable consent
and browser pairing implementation is complete.

## Second increment: durable consent storage

- Added explicit additive `migrations/002_website_consent.sql`: per-account monotonic
  generations and permanent revocation timestamps, attempt-unique candidate grants,
  and authenticated-update revocation tombstones. No startup migration or schema push.
- `ConsentStore` serializes candidates for the same attempt and operations for the
  same account. First identity wins; retries retain the original expiry and grant.
  Five distinct attempts per account in a sliding ten-minute window are enforced
  transactionally, including concurrent attempts; retries do not consume quota.
- Candidate creation does not activate consent. Explicit activation checks the
  exact account, grant, current generation and original expiry. Old pending and
  active grants are fenced by revocation. Reconnecting never revives older grants.
- Legacy authorization is allowed only before the first account-wide revocation;
  the permanent marker survives reconnection. Activated grants outlive the short
  candidate expiry so delayed delivery can remain authorized until revoked.
- Duplicate disconnect/block update IDs are idempotent, including after reconnect.
  Distinct delayed revocation updates fail closed and revoke the current generation.
  Callers must authenticate updates first; unblock and ordinary Start must never
  call activation or revocation. These helpers are not exposed as public endpoints.
- Tests use a new temporary loopback PostgreSQL cluster and unique scratch schemas,
  synthetic identities and messages, with no dotenv/runtime database access. They
  cover real concurrent transactions, rollback, retries, expiry, account isolation,
  reconnect fencing and compatibility with existing delivery tables and rows.

This is a storage foundation, not completed disconnect behavior. No command/menu,
Start handler, service endpoint, acceptance check or send check uses this store yet.
Do not enable pairing/disconnect until those paths enforce it together. Migration
002 still requires reviewed-target/backup/readiness gates before any runtime use.
Keep additive tables and tombstones on rollback; never deploy a runtime that
bypasses consent enforcement after this feature is activated.

## Remaining work

1. Wire the durable consent foundation into authenticated candidate/activation
   services and account-wide disconnect/block handling; keep controls disabled
   until delivery enforcement is complete.
2. Versioned cancelled visitor outcomes, merged visitor/staff destinations and
   revocation checks at acceptance and immediately before each visitor message part.
3. Website additive schema, persistent limits, begin/candidate/verify/cancel APIs,
   reproducible browser-bound proof, revocation-aware enrollment and Russian UI/QR.
4. Actual verified local database migration/readiness gates, cross-repository tests,
   isolated staging acceptance and separately authorized production release.

Preserve both OIDC archive branches. Never deploy an old runtime that bypasses
revocation after the consent feature launches.

Official references: [webhooks](https://core.telegram.org/bots/api#setwebhook),
[deep links](https://core.telegram.org/bots/features#deep-linking).

## Second-increment validation (2026-11-16)

- Final actual bot working tree: build and `git diff --check` passed.
- Final `npm run test:coverage` with the dedicated temporary scratch database:
  **33 suites, 402 tests passed; none skipped**. This includes the nine pre-existing
  delivery PostgreSQL tests and eight new real-database consent tests.
- `src/pairing/consent.ts`: 100% statements, branches, functions and lines.
- Migration 002 preserved synthetic existing delivery records in its compatibility
  check. This is scratch evidence only, not a runtime migration/readiness claim.
- No runtime migration, credential change, external Telegram call, commit, push
  or deployment performed. The temporary test PostgreSQL server was stopped.
