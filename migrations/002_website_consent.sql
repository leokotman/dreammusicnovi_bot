-- Additive consent foundation. Apply explicitly to a verified bot database only.
-- No runtime schema push and no changes to existing delivery records.
BEGIN;
CREATE TABLE website_consent_users (
  user_id text PRIMARY KEY CHECK (user_id ~ '^[1-9][0-9]{0,15}$'),
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  revoked_at timestamptz
);
CREATE TABLE website_consent_grants (
  id uuid PRIMARY KEY,
  attempt_hash text NOT NULL UNIQUE CHECK (attempt_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL REFERENCES website_consent_users(user_id),
  generation bigint NOT NULL CHECK (generation >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  activated_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX website_consent_grants_user_created ON website_consent_grants(user_id, created_at);
-- Authenticated Telegram update IDs make repeated disconnect/block events idempotent.
-- Retain these tombstones: deleting them would allow an old event to revoke a new grant.
CREATE TABLE website_consent_revocations (
  update_id bigint PRIMARY KEY CHECK (update_id >= 0),
  user_id text NOT NULL REFERENCES website_consent_users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
