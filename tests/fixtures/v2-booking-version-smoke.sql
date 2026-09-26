-- Local D1 regression: the booking lead must match the authoritative trip version.
-- Only run after migrations 0009 and 0010; never against remote production.
CREATE TABLE qa_booking_version_assert (
  valid INTEGER NOT NULL CHECK(valid=1)
);
INSERT INTO trip_sessions_v2(session_id,trip_id,state_json,version,last_turn_id)
VALUES('qa-booking-version','qa-trip-version','{"days":3,"nights":2}',1,'qa-turn-version');

INSERT OR IGNORE INTO booking_leads
  (id,session_id,contact,contact_channel,language,note,trip_context_json,status)
SELECT '33333333-3333-4333-8333-333333333333',
  'qa-booking-version','qa@example.invalid','email','vi',NULL,
  '{"schema":"booking_handoff_v2","tripId":"qa-trip-version","tripVersion":1}', 'NEW'
FROM trip_sessions_v2
WHERE session_id='qa-booking-version' AND trip_id='qa-trip-version' AND version=1
  AND NOT EXISTS (SELECT 1 FROM trip_deleted_sessions_v2 WHERE session_id='qa-booking-version')
  AND NOT EXISTS (SELECT 1 FROM booking_lead_erasure_audit WHERE lead_id='33333333-3333-4333-8333-333333333333');
INSERT OR IGNORE INTO booking_lead_consents_v2(lead_id,consent_version)
SELECT id,'booking_contact_v2_2026-09-26' FROM booking_leads
WHERE id='33333333-3333-4333-8333-333333333333'
  AND session_id='qa-booking-version' AND contact='qa@example.invalid'
  AND json_extract(trip_context_json,'$.tripVersion')=1;
INSERT INTO qa_booking_version_assert(valid)
SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END FROM booking_lead_consents_v2
WHERE lead_id='33333333-3333-4333-8333-333333333333';

UPDATE trip_sessions_v2 SET version=2 WHERE session_id='qa-booking-version';
-- The same INSERT from a stale browser must not create a new lead.
INSERT OR IGNORE INTO booking_leads
  (id,session_id,contact,contact_channel,language,note,trip_context_json,status)
SELECT '44444444-4444-4444-8444-444444444444',
  'qa-booking-version','qa@example.invalid','email','vi',NULL,
  '{"schema":"booking_handoff_v2","tripId":"qa-trip-version","tripVersion":1}', 'NEW'
FROM trip_sessions_v2
WHERE session_id='qa-booking-version' AND trip_id='qa-trip-version' AND version=1
  AND NOT EXISTS (SELECT 1 FROM trip_deleted_sessions_v2 WHERE session_id='qa-booking-version')
  AND NOT EXISTS (SELECT 1 FROM booking_lead_erasure_audit WHERE lead_id='44444444-4444-4444-8444-444444444444');
INSERT INTO qa_booking_version_assert(valid)
SELECT CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END FROM booking_leads
WHERE id='44444444-4444-4444-8444-444444444444';

-- Retry the first UUID. No duplicate lead or duplicate consent.
INSERT OR IGNORE INTO booking_leads
  (id,session_id,contact,contact_channel,language,note,trip_context_json,status)
SELECT '33333333-3333-4333-8333-333333333333',
  'qa-booking-version','qa@example.invalid','email','vi',NULL,
  '{"schema":"booking_handoff_v2","tripId":"qa-trip-version","tripVersion":1}', 'NEW'
FROM trip_sessions_v2
WHERE session_id='qa-booking-version' AND trip_id='qa-trip-version' AND version=1;
INSERT INTO qa_booking_version_assert(valid)
SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END FROM booking_leads
WHERE session_id='qa-booking-version';

INSERT INTO booking_lead_erasure_audit(lead_id,reason)
VALUES('33333333-3333-4333-8333-333333333333','verified_customer_request');
DELETE FROM booking_lead_consents_v2 WHERE lead_id='33333333-3333-4333-8333-333333333333';
DELETE FROM booking_leads WHERE id='33333333-3333-4333-8333-333333333333';
INSERT INTO qa_booking_version_assert(valid)
SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END FROM booking_lead_erasure_audit
WHERE lead_id='33333333-3333-4333-8333-333333333333';
DELETE FROM booking_lead_erasure_audit WHERE lead_id='33333333-3333-4333-8333-333333333333';
DELETE FROM trip_sessions_v2 WHERE session_id='qa-booking-version';
DROP TABLE qa_booking_version_assert;
