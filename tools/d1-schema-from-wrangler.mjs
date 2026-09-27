#!/usr/bin/env node
// Convert Wrangler's read-only sqlite_master JSON into schema-only SQL.
// Do not process user rows or emit raw Wrangler output in CI logs.
import { readFileSync, writeFileSync } from "node:fs";

const ALLOWED = new Set([
  "booking_leads", "trip_sessions_v2", "trip_turns_v2",
  "trip_deleted_sessions_v2", "booking_lead_consents_v2",
  "booking_lead_erasure_audit", "d1_migrations",
]);

export function extractAllowlistedSchema(json) {
  const payload = typeof json === "string" ? JSON.parse(json) : json;
  const responses = Array.isArray(payload) ? payload : [payload];
  const rows = responses.flatMap(item => Array.isArray(item?.results) ? item.results :
    Array.isArray(item?.result?.results) ? item.result.results : []);
  if (!responses.length || !responses.every(item => item?.success !== false))
    throw new Error("Wrangler query did not succeed");
  if (!rows.every(row => row && ALLOWED.has(row.name) &&
    typeof row.sql === "string" && /^\s*CREATE\s+TABLE\b/i.test(row.sql)))
    throw new Error("Unexpected sqlite_master response; no output written");
  const names = rows.map(row => row.name);
  if (new Set(names).size !== names.length)
    throw new Error("Duplicate sqlite_master table definitions");
  return rows.map(row => row.sql.trim().replace(/;?$/, ";")).join("\n\n");
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  if (process.argv.length !== 4) {
    console.error("Usage: node tools/d1-schema-from-wrangler.mjs <wrangler-json> <schema-sql>");
    process.exitCode = 2;
  } else {
    try {
      const sql = extractAllowlistedSchema(readFileSync(process.argv[2], "utf8"));
      writeFileSync(process.argv[3], sql, { mode: 0o600 });
      console.log("Allowlisted table definitions converted; no customer rows printed.");
    } catch {
      console.error("Cannot validate Wrangler schema response. No remote mutation occurred.");
      process.exitCode = 2;
    }
  }
}
