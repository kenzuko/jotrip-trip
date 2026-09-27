-- Approved booking-lead lifecycle and retention policy.
-- Applies to the D1 copy only; external CRM exports and encrypted backups have separate handling.
ALTER TABLE booking_leads
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'OPEN'
  CHECK (lifecycle_status IN ('OPEN', 'UNRESPONSIVE', 'FULFILLED'));
ALTER TABLE booking_leads ADD COLUMN last_contact_at TEXT;
ALTER TABLE booking_leads ADD COLUMN completed_at TEXT;

-- The original handoff is the only recorded human contact for existing leads.
UPDATE booking_leads
SET last_contact_at = created_at
WHERE last_contact_at IS NULL OR TRIM(last_contact_at) = '';

CREATE INDEX IF NOT EXISTS idx_booking_leads_lifecycle_contact
  ON booking_leads(lifecycle_status, last_contact_at);
CREATE INDEX IF NOT EXISTS idx_booking_leads_lifecycle_completion
  ON booking_leads(lifecycle_status, completed_at);
CREATE INDEX IF NOT EXISTS idx_booking_lead_erasure_audit_erased_at
  ON booking_lead_erasure_audit(erased_at);

-- Open/unresponsive: 90 days since last human contact. Fulfilled: 30 days after completion.
CREATE VIEW IF NOT EXISTS booking_leads_expired_v2 AS
SELECT id
FROM booking_leads
WHERE (
  lifecycle_status IN ('OPEN', 'UNRESPONSIVE')
  AND datetime(COALESCE(NULLIF(last_contact_at, ''), created_at)) <= datetime('now', '-90 days')
) OR (
  lifecycle_status = 'FULFILLED'
  AND completed_at IS NOT NULL
  AND datetime(completed_at) <= datetime('now', '-30 days')
);
