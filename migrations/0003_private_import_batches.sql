PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hotel_rate_import_batches (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_version TEXT,
  imported_by TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS hotel_rate_import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  hotel_key TEXT,
  room_key TEXT,
  market_scope TEXT,
  stay_from TEXT,
  stay_to TEXT,
  booking_from TEXT,
  booking_to TEXT,
  meal_plan TEXT,
  occupancy_key TEXT,
  base_net_vnd INTEGER,
  discount_type TEXT,
  discount_value REAL,
  effective_net_vnd INTEGER,
  review_state TEXT NOT NULL DEFAULT 'REVIEW',
  review_reason TEXT,
  normalized_json TEXT,
  source_locator TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES hotel_rate_import_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_import_rows_batch_state
  ON hotel_rate_import_rows(batch_id, review_state);

CREATE INDEX IF NOT EXISTS idx_import_rows_hotel_room
  ON hotel_rate_import_rows(hotel_key, room_key);
