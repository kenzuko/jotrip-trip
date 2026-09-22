PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS destination_venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  zone_code TEXT,
  latitude REAL,
  longitude REAL,
  address TEXT,
  phone TEXT,
  tags_json TEXT,
  opening_hours_json TEXT,
  price_level TEXT,
  source_ref TEXT,
  source_type TEXT,
  verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_destination_venues_category_zone
  ON destination_venues(category, zone_code, status);

CREATE INDEX IF NOT EXISTS idx_destination_venues_verified
  ON destination_venues(verified_at, status);
