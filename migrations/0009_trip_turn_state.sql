-- Living Trip V2: one authoritative trip context per anonymous browser session.
-- This migration is additive and does not drop legacy tables or user data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trip_sessions_v2 (
  session_id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  last_turn_id TEXT,
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

CREATE INDEX IF NOT EXISTS idx_trip_sessions_v2_updated_at
  ON trip_sessions_v2(updated_at);

-- A deleted session cannot be recreated by an old browser tab.
CREATE TABLE IF NOT EXISTS trip_deleted_sessions_v2 (
  session_id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trip_deleted_sessions_v2_deleted_at
  ON trip_deleted_sessions_v2(deleted_at);
