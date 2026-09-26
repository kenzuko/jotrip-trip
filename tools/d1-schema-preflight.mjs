#!/usr/bin/env node
// Read-only analysis of a Wrangler D1 --no-data schema export.
// Never connects to Cloudflare, prints customer data or applies migrations.
import { readFileSync } from "node:fs";

export const REQUIRED = Object.freeze({
  trip_sessions_v2: ["session_id", "trip_id", "state_json", "version", "last_turn_id", "updated_at"],
  trip_turns_v2: ["session_id", "client_turn_id", "trip_id", "input_text", "response_json", "created_at"],
  trip_deleted_sessions_v2: ["session_id", "deleted_at"],
  booking_leads: ["id", "session_id", "contact", "contact_channel", "language", "note",
    "trip_context_json", "status", "created_at"],
  booking_lead_consents_v2: ["lead_id", "consent_version", "consent_at"],
  booking_lead_erasure_audit: ["lead_id", "erased_at", "reason"],
});

function tableDefinitions(sql) {
  // Export is schema-only SQL; never parse or print INSERT rows.
  const noComments = sql.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
  const definitions = new Map();
  const create = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"main"|main)\.)?["'`\[]?([a-z_][\w]*)["'`\]]?\s*\(/ig;
  let match;
  while ((match = create.exec(noComments)) !== null) {
    let depth = 1, end = create.lastIndex, quote = null;
    for (; end < noComments.length && depth > 0; end++) {
      const char = noComments[end];
      if (quote) {
        if (char === quote && noComments[end - 1] !== "\\") quote = null;
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "(") depth++;
      else if (char === ")") depth--;
    }
    if (depth !== 0) throw new Error("Unclosed CREATE TABLE definition");
    const body = noComments.slice(create.lastIndex, end - 1);
    // Split only at top-level commas, not CHECK expressions.
    const segments = [];
    let start = 0, level = 0, inside = null;
    for (let i = 0; i < body.length; i++) {
      const char = body[i];
      if (inside) {
        if (char === inside && body[i - 1] !== "\\") inside = null;
      } else if (char === '"' || char === "'" || char === "`") inside = char;
      else if (char === "(") level++;
      else if (char === ")") level--;
      else if (char === "," && level === 0) {
        segments.push(body.slice(start, i)); start = i + 1;
      }
    }
    segments.push(body.slice(start));
    const columns = new Set();
    for (const segment of segments) {
      const name = segment.trim().match(/^(?:["'`\[])?([a-z_][\w]*)(?:["'`\]])?/i)?.[1]?.toLowerCase();
      if (name && !["primary", "foreign", "unique", "constraint", "check"].includes(name))
        columns.add(name);
    }
    definitions.set(match[1].toLowerCase(), columns);
    create.lastIndex = end;
  }
  return definitions;
}

export function inspectSchema(schema) {
  const tables = tableDefinitions(schema);
  const missingTables = [];
  const incompatible = [];
  for (const [name, required] of Object.entries(REQUIRED)) {
    const columns = tables.get(name);
    if (!columns) { missingTables.push(name); continue; }
    const missingColumns = required.filter(column => !columns.has(column));
    if (missingColumns.length) incompatible.push({ table: name, missingColumns });
  }
  const tripTables = ["trip_sessions_v2", "trip_turns_v2", "trip_deleted_sessions_v2"];
  const bookingTables = ["booking_lead_consents_v2", "booking_lead_erasure_audit"];
  const partialTrip = tripTables.some(name => tables.has(name)) &&
    tripTables.some(name => !tables.has(name));
  const partialBooking = bookingTables.some(name => tables.has(name)) &&
    bookingTables.some(name => !tables.has(name));
  const state = incompatible.length || partialTrip || partialBooking ? "STOP_SCHEMA_DRIFT" :
    missingTables.length ? "MIGRATIONS_PENDING_REVIEW" : "SCHEMA_COLUMNS_PRESENT";
  return {
    state, schemaOnly: true,
    presentTables: Object.keys(REQUIRED).filter(name => tables.has(name)),
    missingTables, incompatible,
    partialTrip, partialBooking,
    // Column presence is not sufficient to approve remote migrations or deploy.
    remoteMigrationApproved: false,
  };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    console.error("Usage: node tools/d1-schema-preflight.mjs <wrangler-no-data-schema-export.sql>");
    process.exitCode = 2;
  } else {
    try {
      const result = inspectSchema(readFileSync(file, "utf8"));
      console.log(JSON.stringify(result, null, 2));
      if (result.state === "STOP_SCHEMA_DRIFT") process.exitCode = 1;
    } catch {
      console.error("Cannot inspect schema export. No remote action was taken.");
      process.exitCode = 2;
    }
  }
}
