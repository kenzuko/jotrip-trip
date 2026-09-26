import test from "node:test";
import assert from "node:assert/strict";
import { extractAllowlistedSchema } from "../tools/d1-schema-from-wrangler.mjs";

test("Wrangler array response produces only allowlisted CREATE TABLE definitions", () => {
  const sql = extractAllowlistedSchema([{ success: true, results: [
    { name: "trip_sessions_v2", sql: "CREATE TABLE trip_sessions_v2(session_id TEXT)" },
    { name: "booking_leads", sql: "CREATE TABLE booking_leads(id TEXT)" },
  ] }]);
  assert.match(sql, /CREATE TABLE trip_sessions_v2/);
  assert.match(sql, /CREATE TABLE booking_leads/);
  assert.equal(sql.includes("private@example.com"), false);
});

test("unexpected rows, failed queries and duplicate tables are rejected", () => {
  assert.throws(() => extractAllowlistedSchema([{ success: true, results: [
    { name: "chat_messages", sql: "CREATE TABLE chat_messages(message TEXT)" },
  ] }]));
  assert.throws(() => extractAllowlistedSchema([{ success: false, results: [] }]));
  assert.throws(() => extractAllowlistedSchema([{ success: true, results: [
    { name: "booking_leads", sql: "CREATE TABLE booking_leads(id TEXT)" },
    { name: "booking_leads", sql: "CREATE TABLE booking_leads(id TEXT)" },
  ] }]));
});
