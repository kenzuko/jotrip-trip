PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  trip_id TEXT,
  locale TEXT DEFAULT 'vi-VN',
  source TEXT DEFAULT 'web',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  parsed_intent_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time
  ON chat_messages(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_events_session_time
  ON chat_events(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON chat_sessions(user_id, last_seen_at);
