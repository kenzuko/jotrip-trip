PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS watch_notifications (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  read_at TEXT,
  FOREIGN KEY (watch_id) REFERENCES price_watches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watch_notifications_watch_time
  ON watch_notifications(watch_id, created_at);

CREATE INDEX IF NOT EXISTS idx_watch_notifications_delivery
  ON watch_notifications(delivered_at, created_at);
