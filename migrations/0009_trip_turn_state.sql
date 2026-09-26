-- Living Trip V2: one authoritative trip context per anonymous browser session.
-- This migration is additive and does not drop legacy tables or user data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trip_sessions_v2 (
  session_id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trip_turns_v2 (
  session_id TEXT NOT NULL,
  client_turn_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  input_text TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, client_turn_id),
  FOREIGN KEY (session_id) REFERENCES trip_sessions_v2(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_turns_v2_trip
  ON trip_turns_v2(trip_id, created_at);
