PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT,
  display_name TEXT,
  locale TEXT DEFAULT 'vi-VN',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS traveler_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT,
  adult_count INTEGER DEFAULT 1,
  child_count INTEGER DEFAULT 0,
  preferences_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  raw_intent TEXT,
  start_date TEXT,
  end_date TEXT,
  budget_vnd INTEGER,
  status TEXT NOT NULL DEFAULT 'planning',
  intent_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS hotels_public (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  area_code TEXT,
  latitude REAL,
  longitude REAL,
  cms_ref TEXT,
  public_status TEXT NOT NULL DEFAULT 'content_only',
  fit_tags_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hotel_private_rates (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL,
  room_key TEXT NOT NULL,
  market_scope TEXT NOT NULL,
  stay_from TEXT,
  stay_to TEXT,
  booking_from TEXT,
  booking_to TEXT,
  meal_plan TEXT,
  occupancy_key TEXT,
  base_net_vnd INTEGER NOT NULL,
  discount_type TEXT,
  discount_value REAL,
  effective_net_vnd INTEGER,
  currency TEXT NOT NULL DEFAULT 'VND',
  source_ref TEXT,
  source_version TEXT,
  rule_state TEXT NOT NULL DEFAULT 'REVIEW',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels_public(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hotel_public_offers (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL,
  room_key TEXT NOT NULL,
  checkin_date TEXT NOT NULL,
  checkout_date TEXT NOT NULL,
  occupancy_key TEXT,
  meal_plan TEXT,
  sell_price_vnd INTEGER NOT NULL,
  total_nights INTEGER NOT NULL,
  availability_state TEXT NOT NULL DEFAULT 'on_request',
  price_state TEXT NOT NULL DEFAULT 'checked',
  checked_at TEXT NOT NULL,
  customer_conditions_json TEXT,
  FOREIGN KEY (hotel_id) REFERENCES hotels_public(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_products (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  provider TEXT,
  area_code TEXT,
  latitude REAL,
  longitude REAL,
  cms_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public_activity_rates (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  audience TEXT NOT NULL,
  price_vnd INTEGER NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  source_ref TEXT,
  observed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending_verification',
  FOREIGN KEY (product_id) REFERENCES activity_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS travel_matrix (
  from_ref TEXT NOT NULL,
  to_ref TEXT NOT NULL,
  distance_km REAL NOT NULL,
  normal_minutes INTEGER,
  source TEXT,
  checked_at TEXT,
  PRIMARY KEY (from_ref, to_ref)
);

CREATE TABLE IF NOT EXISTS price_watches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id TEXT,
  watch_type TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  params_json TEXT,
  threshold_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  subject_ref TEXT NOT NULL,
  stay_date TEXT,
  source TEXT NOT NULL,
  comparable_key TEXT,
  price_vnd INTEGER,
  availability_state TEXT,
  observed_at TEXT NOT NULL,
  raw_meta_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_private_hotel_rates_lookup
  ON hotel_private_rates(hotel_id, room_key, market_scope, stay_from, stay_to, rule_state);
CREATE INDEX IF NOT EXISTS idx_public_hotel_offers_lookup
  ON hotel_public_offers(hotel_id, checkin_date, checkout_date, checked_at);
CREATE INDEX IF NOT EXISTS idx_rates_product ON public_activity_rates(product_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_snapshots_subject_date ON market_snapshots(subject_ref, stay_date, observed_at);
CREATE INDEX IF NOT EXISTS idx_watches_user ON price_watches(user_id, enabled);
