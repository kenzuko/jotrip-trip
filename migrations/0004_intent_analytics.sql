PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trip_intent_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  days INTEGER,
  nights INTEGER,
  adults INTEGER,
  children INTEGER,
  budget_vnd INTEGER,
  interests_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intent_events_time
  ON trip_intent_events(created_at);

CREATE INDEX IF NOT EXISTS idx_intent_events_budget
  ON trip_intent_events(budget_vnd);
