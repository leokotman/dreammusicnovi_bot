-- Explicit migration only, after 002; preserve existing delivery snapshots and leases.
BEGIN;
ALTER TABLE website_deliveries ADD COLUMN visitor_cancelled boolean;
COMMIT;
