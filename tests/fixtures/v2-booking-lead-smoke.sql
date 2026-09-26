-- Local-only D1 smoke for additive booking lead migration and consent erasure.
CREATE TABLE IF NOT EXISTS qa_booking_assert (
  id INTEGER PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid=1)
);
INSERT INTO booking_leads
  (id, session_id, contact, contact_channel, language, trip_context_json)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'qa-session-booking',
   'qa@example.invalid', 'email', 'vi',
   '{"schema":"booking_handoff_v2","adults":2,"interests":["Safari"]}');
INSERT INTO booking_lead_consents_v2(lead_id,consent_version)
VALUES ('11111111-1111-4111-8111-111111111111', 'booking_contact_v2_2026-09-26');
INSERT INTO qa_booking_assert(valid)
SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END
FROM booking_leads AS lead
JOIN booking_lead_consents_v2 AS consent ON consent.lead_id=lead.id
WHERE lead.id='11111111-1111-4111-8111-111111111111'
  AND consent.consent_version='booking_contact_v2_2026-09-26'
  AND json_extract(lead.trip_context_json,'$.adults')=2
  AND json_extract(lead.trip_context_json,'$.query') IS NULL;
INSERT INTO booking_lead_erasure_audit(lead_id,reason)
SELECT id,'verified_customer_request' FROM booking_leads
WHERE id='11111111-1111-4111-8111-111111111111';
DELETE FROM booking_lead_consents_v2
WHERE lead_id='11111111-1111-4111-8111-111111111111';
DELETE FROM booking_leads
WHERE id='11111111-1111-4111-8111-111111111111';
INSERT INTO qa_booking_assert(valid)
SELECT CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END
FROM booking_leads WHERE id='11111111-1111-4111-8111-111111111111';
INSERT INTO qa_booking_assert(valid)
SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END
FROM booking_lead_erasure_audit
WHERE lead_id='11111111-1111-4111-8111-111111111111'
  AND reason='verified_customer_request';
DELETE FROM booking_lead_erasure_audit
WHERE lead_id='11111111-1111-4111-8111-111111111111';
DROP TABLE qa_booking_assert;
