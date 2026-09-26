-- The booking_leads shape formerly created at runtime by worker/bookingLead.ts.
-- This fixture must run BEFORE migration 0010 on a separate local D1.
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
