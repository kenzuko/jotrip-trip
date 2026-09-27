-- Runs only against the local legacy-table compatibility D1 after migration 0011.
CREATE TABLE IF NOT EXISTS qa_retention_backfill_assert (
  id INTEGER PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid=1)
);
INSERT INTO qa_retention_backfill_assert(valid)
SELECT CASE WHEN COUNT(*)=1
  AND MIN(lifecycle_status)='OPEN'
  AND MIN(last_contact_at)=MIN(created_at)
  AND MIN(completed_at) IS NULL
THEN 1 ELSE 0 END
FROM booking_leads WHERE id='legacy-retention-seed';
DELETE FROM booking_leads WHERE id='legacy-retention-seed';
DROP TABLE qa_retention_backfill_assert;
