# Website enrollment confirmations

Status: step 3 implementation and local verification complete, owner-accepted
2026-11-08. New delivery remains disabled and undeployed; service provisioning,
recipient verification, and message-copy review remain release gates.
This document does not authorize deployment, provisioning, production sends,
database access, or changes to incoming webhook routing.

## Boundary

The website verifies Telegram authorization and stores the enrollment before
calling this API. Only saved, connected Telegram leads qualify. The bot owns
message templates, explicit staff destinations, durable delivery jobs, and sends.
Existing question/menu handlers and Blob content/admin storage remain intact.
The website continues its existing support email independently.

Use separate test and production bot tokens, databases, API secrets, queue
bindings, and endpoints. Default delivery off; incomplete configuration rejects
acceptance rather than acknowledging a job that cannot be processed. Never infer
notification subscriptions from TEACHER_USER_ID, DEV_ID, ADMIN_IDS, or saved admins.

## HTTP contract v1

All endpoints require HTTPS and a dedicated bearer secret. Compare secrets in
constant time; allow a current and previous secret during rotation. Execution
endpoints use a separate secret from website acceptance/status access. Return
Cache-Control: no-store. Never include request bodies, secrets, bot tokens, or
raw Telegram errors in logs. Apply durable authenticated request limits and
bounded body limits; process-local limits alone are insufficient on Vercel.

### Acceptance

`POST /api/website/enrollment-confirmations`

Example request (synthetic values):

```json
{
  "eventId": "e858af47-9168-420d-9323-bd48763c5af8",
  "enrollmentReference": "123",
  "submittedAt": "2026-11-08T14:00:00.000Z",
  "telegramUserId": "123456789",
  "templateVersion": "enrollment-v1",
  "submission": {
    "name": "Example",
    "contact": "@example_user",
    "lessonName": "Example lesson",
    "comment": ""
  }
}
```

The example is an API fixture, not user-facing copy. Production messages use
Russian. The website supplies saved values, not a second browser payload.
Telegram IDs remain decimal strings, never floating-point conversions.

Implemented limits: 16 KiB JSON body; UUID event ID; enrollment reference 128
characters; name 200; contact 254; lesson/course 500; comment 500. Reject unknown
properties, unsupported template versions, invalid timestamps, empty required
fields, and nonpositive visitor IDs. Do not truncate accepted values. Website
alignment with these limits belongs to step 4; current lesson length is unbounded.

Insert the event and deduplicated destination snapshot in one PostgreSQL
transaction. Uniqueness on event ID serializes duplicate acceptance. Compare the
canonical validated immutable request on repeats; conflicting reuse returns 409.
Snapshot explicit notification destinations only for first acceptance.

Return 202 for a newly durable job and 200 for an identical repeat:

```json
{
  "jobId": "e858af47-9168-420d-9323-bd48763c5af8",
  "state": "accepted"
}
```

Acceptance means queued, never delivered. Commit a durable wake-up obligation
with the job before publishing its opaque reference to Cloudflare. A publish
failure leaves the obligation recoverable; do not roll back an accepted job or
lose its wake-up. Duplicate acceptance may republish unfinished work safely.

### Status

`GET /api/website/enrollment-confirmations/:jobId`

Return 404 for an unknown event. Return aggregate state and one record for each
unique destination: stable delivery reference, roles (visitor/admin or both),
state, attempts, next retry time, Telegram message IDs for completed parts, and
safe error code. Do not expose raw error responses or credentials.

Delivery states: pending, processing, retrying, sent, failed. Aggregate states:
accepted (no active delivery yet), processing (any unfinished delivery), sent
(all sent), partial-failure (terminal mix), failed (all failed). A visitor who is
also a configured admin gets one destination record with both roles and a
combined template that includes the admin reference/time requirements.

Only report a terminal aggregate after every destination is terminal. A single
successful visitor/admin send must not hide other failures.

### Processing and recovery

`POST /api/website/enrollment-confirmations/process` accepts only `{ "jobId":
"<UUID>" }` and the execution secret. Return whether work remains and a bounded
retry delay; return success only after results and the next wake-up obligation
are durable. Use a small bounded batch so requests fit the hosting timeout.

`POST /api/website/enrollment-confirmations/recover` uses the execution secret
and republishes a bounded page of due/stranded job references. The daily sweep
must page through all outstanding records; stable ordering/cursors must not
starve jobs beyond the first page. Website outbox recovery is separate (step 4).

## Durable storage and processing

Use the separately provisioned bot PostgreSQL database. Keep additive schema SQL
reviewable and do not auto-migrate at startup or touch the website database.

- Events: immutable canonical JSON payload, template version, and creation time.
  The recipient snapshot is in the associated delivery rows. Those unfinished
  rows are the durable wake-up obligation: they exist in the acceptance
  transaction and remain recoverable independently of queue publication.
- Deliveries: unique `(event_id, destination)`, roles, state, attempt count,
  next-attempt time, claim token, lease expiry, and safe terminal error.
- Message parts: stable ordering and message IDs, allowing long submissions to
  span messages without resending already recorded parts.
- Execution limits: 120 authenticated acceptance requests/minute, 300/minute
  for each other endpoint, and conservative global pacing of one Telegram send
  per second. Buckets and the send clock are stored in PostgreSQL; retries do
  not create new events. Review these defaults before activation.

Claim due deliveries with a short transaction and FOR UPDATE SKIP LOCKED. Save a
unique claim token and lease before committing; perform Telegram calls outside
the transaction. Result writes must match the token. Expired leases can be
reclaimed. Send timeout and lease duration must prevent ordinary overlap; stop
before the request execution budget expires. Persist each successful message
part before sending the next. Resolve destinations once, never on a retry.

Retry Telegram 429 using retry_after; retry transient network/5xx failures with
bounded exponential backoff and jitter. Permanent 400/403 destination failures
stop that delivery. Proposed maximum: eight attempts per part. Apply Telegram
rate-limit cooldown across the bot, not only to one failed destination. A failed
recipient must not prevent the others from progressing. Ambiguous network
timeouts may duplicate a message; exactly-once Telegram delivery is not promised.

Cloudflare tasks contain only versioned opaque job references. A consumer calls
the fixed configured processing endpoint, never a URL supplied in a message.
Authenticate queue publication separately. Acknowledge only after processing
and durable next-work recording; delayed retries and a daily sweep recover
unfinished jobs. Queue duplicates and exhausted/expired tasks must not lose
durable jobs. Service provisioning and live verification remain steps 3–5 gates;
do not silently mark them complete after mocked tests.

## Message intent for owner review

Visitor: acknowledge receipt; include name, contact, lesson/course, and optional
comment. Do not claim delivery to staff, promise response timing, or suggest
ordinary replies are forwarded. Admin: identify a new website submission and
include those fields plus enrollment reference and UTC submission time.

Render literal plain text without parse_mode; disable link previews. Split long
text safely below Telegram's 4096-character limit without dropping fields or
breaking surrogate pairs. Snapshot the rendered version/parts at acceptance so
future template edits do not change a retry's content. Exact Russian copy and
staff notification recipients require owner review before enabling sends.

## Environment configuration and current verification

All recipient choices come from `WEBSITE_NOTIFICATION_CHAT_IDS` in the deployment
environment; no real recipient usernames or IDs are embedded in runtime code.
The owner manages the local values in `.env.local`. See `.env.example` for the
disabled default and blank configuration keys. Configure a private recipient's
numeric chat ID after that person starts the appropriate bot. Telegram app
username search does not establish a private Bot API destination. Support for
public channel usernames is pending clarification of the intended recipient type.

Bot API files live in `api/website/enrollment-confirmations/`; delivery modules
are in `src/delivery/`. The Cloudflare entry point is `src/delivery/worker.ts`,
deployed independently of the bot. It expects `DELIVERY_QUEUE` (a Queue binding),
`DELIVERY_ENABLED`, `PUBLISH_SECRET`, `EXECUTION_SECRET`, and `BOT_BASE_URL`
(an HTTPS origin without a trailing slash). The publication URL is `/publish`.
Use separate secrets and bindings per environment. Worker resource names,
dead-letter policy, deployment configuration, and cron wiring await service setup;
this repository change does not provision them or alter the incoming webhook.

`migrations/001_website_delivery.sql` is an explicit, transactional schema for a
new separate bot database. It has no destructive statements or startup hook.
Do not apply it to any existing runtime until the target and SQL are reviewed.
New delivery endpoints need a hosting timeout of at least 30 seconds; the Worker
uses a 20-second processing timeout and Telegram calls have a 5-second timeout.

Verified locally: TypeScript build and 298 tests passed, including real SQL
transaction/concurrency tests on a newly initialized PostgreSQL 18 scratch
cluster. Coverage of every new delivery runtime module and API route is 100%
of lines. The Worker has 98.82% statement and 98.27% branch coverage; other new
runtime modules have 100% statement/branch coverage. These are code checks,
not proof of live Cloudflare, Telegram, Neon, or deployed routing behavior.

Run unit coverage with a synthetic `BOT_TOKEN` using `npm run test:coverage`.
The PostgreSQL suite is opt-in through `DELIVERY_TEST_DATABASE_URL`; it rejects
non-loopback targets, non-`delivery_scratch_*` database names, and URL overrides.
It creates a fresh test-owned schema per run. Supply only a newly created
scratch database; no environment files or existing database credentials are
required. Without that variable, the SQL integration suite is explicitly skipped.

Still pending as later provisioning/release gates: recipient reachability verification,
owner review of the Russian templates in `src/delivery/contract.ts`, isolated
service setup, and live test delivery. No step 4 website code has been changed.

The owner currently has only the production Vercel bot deployment; the test
Telegram bot has no separate backend deployment yet. Before later live tests,
provision an isolated test backend, database, and queue. Until then keep
`WEBSITE_DELIVERY_ENABLED=false` (or unset) on production, and preserve its
production `BOT_TOKEN`. An owner push may deploy the disabled code through the
existing Vercel integration; this is not proof of live delivery and must not
change incoming webhook routing.

## Verification gates

Test strict validation/authentication, disabled configuration, canonical duplicate
acceptance/conflicts, recipient snapshots/deduplication, transaction rollback,
concurrent claims, expired leases and stale tokens, partial failures, retry_after,
timeouts, split-message progress, queue publication failure/recovery, and safe
status output. Exercise SQL concurrency against an isolated scratch PostgreSQL
database; mocks alone do not prove locking. Preserve existing question/menu tests.

Build and run the full bot coverage suite after implementation. No production
send is permitted to establish correctness. Real acceptance/delivery checks use
the test bot and explicitly verified test recipients after isolated services are
available. Finish step 3 before requesting approval for website work in step 4.

References: [Telegram Bot API](https://core.telegram.org/bots/api),
[PostgreSQL transactions with node-postgres](https://node-postgres.com/features/transactions),
[Cloudflare Queue APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/).
