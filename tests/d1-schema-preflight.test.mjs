import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectSchema } from "../tools/d1-schema-preflight.mjs";

const migration9 = readFileSync("migrations/0009_trip_turn_state.sql", "utf8");
const migration10 = readFileSync("migrations/0010_booking_lead_privacy.sql", "utf8");

test("both reviewed V2 migrations satisfy the expected schema column contract", () => {
  const result = inspectSchema(migration9 + "\n" + migration10);
  assert.equal(result.state, "SCHEMA_COLUMNS_PRESENT");
  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.incompatible, []);
  assert.equal(result.remoteMigrationApproved, false);
});

test("legacy booking table compatible with migration 0010 passes schema inspection", () => {
  const legacy = readFileSync("tests/fixtures/v2-legacy-booking-schema.sql", "utf8");
  const result = inspectSchema(migration9 + "\n" + legacy + "\n" + migration10);
  assert.equal(result.state, "SCHEMA_COLUMNS_PRESENT");
});

test("fresh remote database is pending manual migration review, never automatically approved", () => {
  const result = inspectSchema("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT);");
  assert.equal(result.state, "MIGRATIONS_PENDING_REVIEW");
  assert.equal(result.missingTables.length, 6);
  assert.equal(result.remoteMigrationApproved, false);
});

test("incompatible preexisting booking table forces stop even when migrations are present", () => {
  const result = inspectSchema(migration9 + "\n" +
    "CREATE TABLE booking_leads(id TEXT PRIMARY KEY, contact TEXT);" +
    "\nCREATE TABLE booking_lead_consents_v2(lead_id TEXT, consent_version TEXT, consent_at TEXT);" +
    "\nCREATE TABLE booking_lead_erasure_audit(lead_id TEXT, erased_at TEXT, reason TEXT);");
  assert.equal(result.state, "STOP_SCHEMA_DRIFT");
  assert.ok(result.incompatible.find(x => x.table === "booking_leads")
    .missingColumns.includes("session_id"));
});

test("partially applied V2 tables force stop instead of blind migrations", () => {
  const result = inspectSchema("CREATE TABLE trip_sessions_v2(" +
    "session_id TEXT, trip_id TEXT, state_json TEXT, version INTEGER, last_turn_id TEXT, updated_at TEXT);");
  assert.equal(result.state, "STOP_SCHEMA_DRIFT");
  assert.equal(result.partialTrip, true);
});

test("schema parser accepts quoted table names and ignores constraints and commas in CHECK", () => {
  const result = inspectSchema(migration9 + "\n" +
    migration10.replaceAll("CREATE TABLE IF NOT EXISTS ", 'CREATE TABLE IF NOT EXISTS "')
      .replaceAll(" (\n", '" (\n'));
  // The original migration has inline CHECK expressions; the parser must not
  // treat a comma inside them as a column delimiter.
  assert.equal(result.state, "SCHEMA_COLUMNS_PRESENT");
});

test("IF NOT EXISTS never masks an incompatible legacy table", () => {
  const oldTable = "CREATE TABLE booking_leads(id TEXT PRIMARY KEY, contact TEXT);";
  const result = inspectSchema(oldTable + "\n" + migration9 + "\n" + migration10);
  assert.equal(result.state, "STOP_SCHEMA_DRIFT");
  assert.ok(result.incompatible.find(x => x.table === "booking_leads")
    .missingColumns.includes("trip_context_json"));
});
