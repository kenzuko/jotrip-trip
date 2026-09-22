PRAGMA foreign_keys = ON;

ALTER TABLE hotel_private_rates ADD COLUMN rate_plan TEXT;
ALTER TABLE hotel_private_rates ADD COLUMN minimum_stay INTEGER;
ALTER TABLE hotel_private_rates ADD COLUMN minimum_advance_days INTEGER;
ALTER TABLE hotel_private_rates ADD COLUMN non_refundable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hotel_private_rates ADD COLUMN tax_included INTEGER;
ALTER TABLE hotel_private_rates ADD COLUMN breakfast_included INTEGER;
ALTER TABLE hotel_private_rates ADD COLUMN blackout_json TEXT;
ALTER TABLE hotel_private_rates ADD COLUMN availability_mode TEXT NOT NULL DEFAULT 'ON_REQUEST';

ALTER TABLE hotel_rate_import_rows ADD COLUMN rate_plan TEXT;
ALTER TABLE hotel_rate_import_rows ADD COLUMN minimum_stay INTEGER;
ALTER TABLE hotel_rate_import_rows ADD COLUMN minimum_advance_days INTEGER;
ALTER TABLE hotel_rate_import_rows ADD COLUMN non_refundable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hotel_rate_import_rows ADD COLUMN tax_included INTEGER;
ALTER TABLE hotel_rate_import_rows ADD COLUMN breakfast_included INTEGER;
ALTER TABLE hotel_rate_import_rows ADD COLUMN blackout_json TEXT;

CREATE INDEX IF NOT EXISTS idx_private_rate_rules
  ON hotel_private_rates(hotel_id, rate_plan, stay_from, stay_to, minimum_stay, minimum_advance_days);
