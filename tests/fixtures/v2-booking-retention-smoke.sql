-- Local D1 retention smoke. The same expiry selection and cleanup statements
-- are used by the Worker scheduled handler; no remote database is touched.
CREATE TABLE IF NOT EXISTS qa_retention_assert (
  id INTEGER PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid=1)
);

-- Legacy backfill is asserted separately in the legacy-schema CI run.
DELETE FROM booking_leads WHERE id='legacy-retention-seed';

INSERT INTO booking_leads
  (id, contact, lifecycle_status, last_contact_at, created_at)
VALUES
  ('retention-open-expired', 'open-old@example.invalid', 'OPEN', datetime('now','-91 days'), CURRENT_TIMESTAMP),
  ('retention-unresponsive-expired', 'unresponsive-old@example.invalid', 'UNRESPONSIVE', datetime('now','-91 days'), CURRENT_TIMESTAMP),
  ('retention-open-kept', 'open-new@example.invalid', 'OPEN', datetime('now','-89 days'), CURRENT_TIMESTAMP);
INSERT INTO booking_leads
  (id, contact, lifecycle_status, last_contact_at, completed_at, created_at)
VALUES
  ('retention-fulfilled-expired', 'fulfilled-old@example.invalid', 'FULFILLED', datetime('now','-31 days'), datetime('now','-31 days'), CURRENT_TIMESTAMP),
  ('retention-fulfilled-kept', 'fulfilled-new@example.invalid', 'FULFILLED', datetime('now','-29 days'), datetime('now','-29 days'), CURRENT_TIMESTAMP);
INSERT INTO booking_lead_consents_v2(lead_id, consent_version)
VALUES ('retention-open-expired', 'qa-retention-consent');
INSERT INTO booking_lead_erasure_audit(lead_id, erased_at, reason)
VALUES
  ('retention-tombstone-expired', datetime('now','-181 days'), 'verified_customer_request'),
  ('retention-tombstone-kept', datetime('now','-179 days'), 'verified_customer_request');

INSERT INTO qa_retention_assert(valid)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM booking_leads_expired_v2
   WHERE id IN ('retention-open-expired','retention-unresponsive-expired','retention-fulfilled-expired'))=3
  AND
  (SELECT COUNT(*) FROM booking_leads_expired_v2
   WHERE id IN ('retention-open-kept','retention-fulfilled-kept'))=0
THEN 1 ELSE 0 END;

-- Mirrors purgeExpiredBookingLeads()'s atomic D1 batch.
INSERT OR IGNORE INTO booking_lead_erasure_audit (lead_id,reason)
SELECT id,'operational_cleanup' FROM booking_leads_expired_v2;
DELETE FROM booking_lead_consents_v2
WHERE lead_id IN (SELECT id FROM booking_leads_expired_v2);
DELETE FROM booking_leads WHERE id IN
  (SELECT id FROM booking_leads_expired_v2);
DELETE FROM booking_lead_erasure_audit
WHERE datetime(erased_at) <= datetime('now','-180 days');

INSERT INTO qa_retention_assert(valid)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM booking_leads
   WHERE id IN ('retention-open-expired','retention-unresponsive-expired','retention-fulfilled-expired'))=0
  AND
  (SELECT COUNT(*) FROM booking_leads
   WHERE id IN ('retention-open-kept','retention-fulfilled-kept'))=2
  AND
  (SELECT COUNT(*) FROM booking_lead_consents_v2 WHERE lead_id='retention-open-expired')=0
  AND
  (SELECT COUNT(*) FROM booking_lead_erasure_audit
   WHERE lead_id IN ('retention-open-expired','retention-unresponsive-expired','retention-fulfilled-expired')
     AND reason='operational_cleanup')=3
  AND
  (SELECT COUNT(*) FROM booking_lead_erasure_audit
   WHERE lead_id='retention-tombstone-expired')=0
  AND
  (SELECT COUNT(*) FROM booking_lead_erasure_audit
   WHERE lead_id='retention-tombstone-kept')=1
THEN 1 ELSE 0 END;

DELETE FROM booking_lead_consents_v2 WHERE lead_id LIKE 'retention-%';
DELETE FROM booking_leads WHERE id LIKE 'retention-%';
DELETE FROM booking_lead_erasure_audit WHERE lead_id LIKE 'retention-%';
DROP TABLE qa_retention_assert;
