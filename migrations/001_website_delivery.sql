-- Run explicitly against the separate, verified bot database only.
-- No startup schema push. Existing content/admin Blob storage is unrelated.
BEGIN;
CREATE TABLE website_delivery_events (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE website_deliveries (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES website_delivery_events(id),
  destination text NOT NULL,
  roles text[] NOT NULL,
  parts jsonb NOT NULL,
  next_part integer NOT NULL DEFAULT 0,
  part_attempts integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','retrying','sent','failed')),
  next_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  lease_until timestamptz,
  error_code text,
  UNIQUE (event_id, destination)
);
CREATE INDEX website_deliveries_due ON website_deliveries(next_at, event_id)
  WHERE state NOT IN ('sent','failed');
CREATE TABLE website_delivery_clock (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_send_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO website_delivery_clock(id) VALUES (true);
CREATE TABLE website_delivery_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);
COMMIT;
