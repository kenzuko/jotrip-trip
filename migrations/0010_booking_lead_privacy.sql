-- Living Trip V2: separately consented booking leads.
-- Compatible with the legacy runtime-created booking_leads table.
-- No automatic lead deletion: retention must be approved by the operator.
CREATE TABLE IF NOT EXISTS booking_leads (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  contact TEXT NOT NULL,
  contact_channel TEXT,
  language TEXT,
  note TEXT,
  trip_context_json TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_booking_leads_status_created
  ON booking_leads(status, created_at);
CREATE INDEX IF NOT EXISTS idx_booking_leads_session
  ON booking_leads(session_id);

-- Audit of staff-verified erasure; never store contact, raw chat or trip data.
CREATE TABLE IF NOT EXISTS booking_lead_erasure_audit (
  lead_id TEXT PRIMARY KEY,
  erased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT NOT NULL CHECK (reason IN ('verified_customer_request', 'operational_cleanup'))
);
