PRAGMA foreign_keys = ON;

ALTER TABLE hotel_private_rates ADD COLUMN public_display_policy TEXT NOT NULL DEFAULT 'QUERY_ONLY';
ALTER TABLE hotel_private_rates ADD COLUMN minimum_margin_vnd INTEGER;
ALTER TABLE hotel_private_rates ADD COLUMN minimum_margin_pct REAL;
ALTER TABLE hotel_private_rates ADD COLUMN stop_sell INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hotel_private_rates ADD COLUMN notes_public_rule TEXT;

ALTER TABLE hotel_public_offers ADD COLUMN benchmark_price_vnd INTEGER;
ALTER TABLE hotel_public_offers ADD COLUMN saving_vnd INTEGER;
ALTER TABLE hotel_public_offers ADD COLUMN pricing_reason TEXT;
ALTER TABLE hotel_public_offers ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_private_rate_public_policy
  ON hotel_private_rates(public_display_policy, stop_sell, rule_state);
