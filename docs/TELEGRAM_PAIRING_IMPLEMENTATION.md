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

## Third increment: consent enforcement and authenticated consent interfaces

- Delivery acceptance checks the durable authority using the event's optional exact
  `{ id, userId, generation }` consent grant. Grant fields are strictly validated;
  recipient mismatch, noncanonical generation and values above PostgreSQL bigint
  are rejected. Legacy events retain the permanent first-revocation fence.
- Every visitor message part checks consent again after claiming, immediately
  before sending. Authority failures fail closed and leave the lease recoverable.
  Staff-only destinations do not depend on visitor consent during sending.
- Revoked acceptance still durably accepts the immutable event and preserves staff
  destinations. Visitor cancellation is terminal, including across duplicate
  acceptance, queue recovery, process restart and later reconnection. No previously
  cancelled job is assigned a new grant.
- Additive `003_website_delivery_consent.sql` adds one nullable boolean, without
  rewriting existing snapshots, state constraints, indexes or migration history.
  Internally, visitor-only cancellation uses terminal `failed` storage with
  `consent-revoked`; the versioned public contract distinguishes cancellation from
  transport failure. Existing queue claim/recovery filters remain correct.
- Status responses now have `version: 2`, per-destination `visitorOutcome` (null for
  staff-only destinations), terminal visitor `cancelled`, and aggregate
  `cancelled`/`partial-cancellation`. Failed staff transport remains a failure even
  when the visitor was cancelled. The acceptance response remains its existing
  jobId/state shape and may also return the new aggregate cancellation states.
- Merged visitor/staff destinations retain one destination record. Revocation
  preserves sent message IDs, replaces only the unsent suffix with the staff
  template, resets that template's part retry counter and rotates the claim token.
  Stale completion/cancellation cannot restore visitor text. Later retries use
  the persisted staff-only suffix even after reconnect. Staff authorization can
  repeat submission details already present in a sent visitor prefix; it does not
  re-send those visitor parts or their welcome heading.
- Authenticated POST `/api/website/consent/check` accepts `{ userId, consent? }`
  and returns `{ version: 1, allowed }`. POST `/api/website/consent/activate`
  accepts `{ consent }` and returns `{ version: 1, active: true }` only after
  durable activation. Both use website API bearer secrets (not execution secrets),
  existing delivery enable/configuration checks, bounded strict JSON, persistent
  rate limits, no-store responses and redacted errors. Activation cannot create a
  candidate; only an existing matching, unexpired candidate can activate.

This increment does not expose disconnect or Start pairing. No new enable switch
or runtime configuration was introduced. Before deployment, reviewed migrations
002 and 003 and a website reader supporting status v2 are required; the current
website still expects the earlier contract. This is a code compatibility boundary,
not an infrastructure or credential prerequisite for continued implementation.
Neither migration has been applied to a runtime database. Never roll back to a
runtime that bypasses these checks after account-wide revocation is exposed.

## Fourth increment: Start, candidate callbacks and account disconnect

- Registered pairing middleware before ordinary commands, callbacks and text handling.
  Only recognized `dmn1_` Start payloads enter pairing; malformed pairing payloads
  are consumed without reaching question forwarding. Ordinary Start, help, admin,
  unrelated callbacks and questions retain their existing paths. No ordinary bot
  interaction activates consent.
- Start validates the authenticated private-chat user and public username, reserves
  the website candidate, registers durable bot consent, binds that exact grant back
  to the website, then rechecks the original candidate before returning the stable
  six-digit code. No code is sent before both authorities accept the binding. Start
  does not activate the grant: activation still requires browser code verification.
- The website supplies both immutable original attempt timestamps. New candidate
  creation rejects attempts created at/before the account's last revocation, even
  when that link had never reached this account before disconnect. Expiry is bounded
  to ten minutes from creation and remains unchanged on retry. Excess future clock
  skew is rejected (30-second ceiling). Creation minus that same 30-second
  uncertainty must be strictly later than revocation; ambiguous links are rejected.
  Reconnection may therefore require waiting and creating a fresh link. The future website handler must return stored timestamps, never refreshed
  timestamps, and must not take them from public request bodies.
- `/disconnect` and the Russian command/inline menu action revoke by authenticated
  update ID before acknowledging success. Revocation does not require a username.
  Group, bot and inconsistent user/chat identities cannot revoke. Repeated update
  IDs cannot revoke a later reconnection. Failed writes remain retryable. An expired
  callback acknowledgement cannot prevent the durable revocation.
- Private `my_chat_member` updates revoke only when this configured bot is kicked
  and the real actor matches the private chat. Unblock, unrelated member changes,
  ordinary Start and menu navigation never restore consent. Block processing runs
  whenever delivery is enabled, independently of the pairing-controls switch and
  website availability. Authority errors propagate for webhook retry.
- A definitive Telegram 403 with `Forbidden: bot was blocked by the user` revokes
  the sending authorization and terminally cancels remaining visitor parts. Generic
  403 errors are not inferred to be blocks. Shared staff destinations retain their
  independent transport outcome. Repeated/late failures for an old grant or legacy
  job cannot revoke a later reconnection; the original generation is fenced under
  the account lock. No additional migration is needed for this operation.
- Telegraf's default update-dumping error handler is replaced with a redacted,
  retryable error. Caught pairing failures log only `telegram-pairing-failed`.
  Callback and pairing failures never log bodies, codes, tokens,
  identity payloads or raw transport errors. Sending a code still uses plain text.

### Candidate callback contract (website implementation pending)

The bot calls one fixed HTTPS URL whose path is
`/api/telegram/connection/candidate`. Credentials, query strings and fragments in
that URL are rejected. Requests use `Authorization: Bearer` with the configured
current `WEBSITE_DELIVERY_API_SECRET`, a five-second deadline, `redirect: error`,
and a maximum 4096-byte response. The website must authenticate before reading
candidate data, accept the intended current/rotation service secrets, validate the
fixed configured bot ID/environment, bound/validate the body, return no-store
responses and redact failures. It must not follow credentialed redirects.

Reserve request:

```json
{
  "version": 1,
  "botId": "<configured bot ID>",
  "phase": "reserve",
  "attempt": "dmn1_<canonical 256-bit base64url material>",
  "userId": "<authenticated private Telegram ID>",
  "username": "<authenticated public username without @>",
  "codeHash": "<domain-separated 64-character lowercase SHA-256 hex>"
}
```

The website atomically fixes the first account and code hash on the original
unexpired, uncancelled pairing attempt. Another account cannot replace them.
Same-account response-loss retries retain the original timestamps and candidate.
Successful response has exactly:
`{ "version": 1, "createdAt": "<canonical ISO UTC>", "expiresAt": "<canonical ISO UTC>" }`.

Bind repeats the same request fields with `phase: "bind"` and
`consent: { id, userId, generation }` from the bot authority. The website atomically
binds that exact grant to its previously reserved account/hash/attempt; retries
cannot replace a grant or resurrect cancelled, expired or revoked attempts.
Successful response has exactly `{ "version": 1, "registered": true }`.
The public browser can only submit its attempt/code; it cannot call this service
callback or supply recipient/grant identity. A reserve without successful bind
must never become verifiable. Neither phase issues a website proof or grants
historical access. Keep later browser verification's authoritative activation and
consent checks; the final bot check cannot remove all distributed revocation races.

### Activation boundary

`WEBSITE_PAIRING_ENABLED=true` plus `WEBSITE_DELIVERY_ENABLED=true` exposes the new
pairing/disconnect controls. Pairing stays disabled by default. When eventually
configured, `WEBSITE_PAIRING_CANDIDATE_URL` must point to the intended website's
fixed callback above. These are code configuration interfaces, not a request to
change any current secrets, registration or deployment. Do not enable controls
before the compatible website APIs/UI/status-v2 reader and reviewed runtime
migrations 002/003 are ready. Existing runtime OIDC remains unchanged.

## Remaining work

1. Website additive schema and persistent limits; authenticated two-phase candidate
   callback; begin/verify/cancel APIs; reproducible browser-bound proof; consent-aware
   enrollment; status-v2 validation/reconciliation/read-only admin display; and
   Russian Start/code/QR UI. Remove website connection OIDC only with its replacement.
2. Actual verified local database migration/readiness gates, cross-repository tests,
   isolated staging acceptance and separately authorized production release. Manual
   device/browser checks have not been performed for this inactive bot increment.

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

## Third-increment validation (2026-11-16)

- Build and `git diff --check` passed. Final coverage: **33 suites, 426 tests
  passed, none skipped**, including all 23 real PostgreSQL integration tests.
- Changed runtime modules (`contract`, `http`, `service`, `store`) and both new
  consent routes: **100% statements, branches, functions and lines**. Existing
  consent storage retains 100% across those metrics. Whole-repository coverage:
  81.06% statements, 65.29% branches, 80.28% functions, 82.66% lines.
- Real SQL tests cover migration preservation of existing snapshots/message IDs,
  revoked acceptance, claim-time revocation, split legacy cancellation, modern
  grant fencing, immutable duplicate acceptance, staff-only replacements, stale
  token rejection, retry/recovery/restart and reconnection without revival.
- Tests used only a new temporary loopback PostgreSQL cluster with synthetic data
  and mocked Telegram/queue transport. No dotenv or runtime database access.
- No runtime migration, secrets/configuration change, external Telegram call,
  commit, push or deployment. Both OIDC archive branches remain intact.

## Fourth-increment validation (2026-11-16)

- Build and `git diff --check` passed. Final bot coverage run: **38 suites,
  465 tests passed, none skipped**, including 26 real PostgreSQL integration tests.
- All changed executable production modules have **100% statements, branches,
  functions and lines**: bot registration, command menus, main menu, pairing
  client/config/handlers/runtime/service/consent, delivery orchestration and Telegram
  transport. `store.ts` changes only its outcome type; its existing runtime remains
  fully covered. Coverage now includes `bot.ts` instead of excluding it.
- Whole repository: 82.36% statements, 68.60% branches, 81.26% functions,
  83.78% lines. No thresholds were lowered and no changed modules were excluded.
- Real SQL tests cover unopened pre-disconnect links, concurrent block failures,
  old-failure/reconnection isolation, stable Start retries, first-identity conflicts,
  immutable expiry and revocation during callback binding, alongside the existing
  delivery cancellation/recovery tests. Callback transport is mocked; there were
  no external website or Telegram calls.
- Only the dedicated temporary loopback scratch cluster was used; no runtime
  dotenv/database access, migration, secret change, registration, deployment,
  commit or push. The scratch PostgreSQL server was stopped after final validation.

## Review corrections (2026-11-17)

- Reproduced all three review defects with failing tests before fixing them:
  missing redacted handler diagnostics, rejection of valid ten-minute attempts
  under positive website clock skew, and reopening pre-disconnect links under skew.
- Client timestamp validation now uses named shared lifetime/skew constants, a
  canonical timestamp parser, one captured current time and separate readable checks
  for clock skew, lifetime and expiry. The conflicting `now + ten minutes` expiry
  ceiling is removed from both the client and consent authority; the ten-minute
  lifetime is measured from original creation, preserving the allowed clock skew.
- New candidate consent uses the earliest possible creation time: supplied creation
  minus the allowed 30-second uncertainty must be strictly after authority-owned
  revocation. Equality is rejected. A website clock twenty seconds ahead cannot
  make a link created five seconds before disconnect eligible. This assumes the
  configured 30-second clock uncertainty bound; arbitrarily drifting clocks are not
  supported. Recent legitimate links can also be rejected conservatively, so the
  Russian error response asks visitors to wait and create a fresh link. Manual
  submission remains available.
- Regression tests cover positive-skew acceptance in the client and real SQL,
  unopened old-link rejection, the exact uncertainty boundary, fresh activation
  beyond it, and fixed-marker logging without error payloads. Existing reconnect
  fixtures move only synthetic revocation timestamps to model elapsed time;
  generations, tombstones and cancellation assertions remain intact.
- Final build and diff checks passed. Full final-tree coverage: **38 suites,
  471 tests passed, none skipped**, including 29 real PostgreSQL tests. Changed
  runtime modules (`client`, `consent`, `handlers`, `timing`) have 100% statements,
  branches, functions and lines. Whole repository: 82.50% statements, 68.60%
  branches, 81.30% functions, 83.94% lines.
- Tests used the dedicated disposable loopback scratch PostgreSQL cluster with
  synthetic data and mocked external transport; it was stopped afterward. No
  runtime database, migration, credential, webhook registration, deployment,
  commit, push or staging-index change. Pairing remains disabled by default.
