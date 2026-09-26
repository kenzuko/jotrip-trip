import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["worker/tripState.ts"], bundle: true, format: "esm",
  platform: "browser", target: "es2022", write: false,
});
const state = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

test("short acknowledgement keeps all trip context without resetting", () => {
  const first = state.resolveTripTurn(null, "3 ngày 2 đêm, 2 người lớn, 1 bé, Safari và VinWonders");
  const ack = state.resolveTripTurn(first.parsed, "a");
  assert.equal(ack.action, "acknowledgement");
  assert.deepEqual(ack.parsed, first.parsed);
  assert.deepEqual(ack.nextNeeded, []);
});

test("substantive follow-up with new duration preserves the same trip", () => {
  const first = state.resolveTripTurn(null, "3 ngày 2 đêm, 2 người lớn, Safari");
  const changed = state.resolveTripTurn(first.parsed, "đổi thành 4 ngày 3 đêm và thêm Hòn Thơm");
  assert.equal(changed.action, "request");
  assert.equal(changed.parsed.days, 4);
  assert.equal(changed.parsed.nights, 3);
  assert.equal(changed.parsed.adults, 2);
  assert.deepEqual(changed.parsed.interests, ["Safari", "Hòn Thơm"]);
});

test("removing one stop and adding another updates, not resets, the itinerary", () => {
  const first = state.resolveTripTurn(null, "3 ngày 2 đêm, Safari và VinWonders");
  const changed = state.resolveTripTurn(first.parsed, "bỏ Safari, thêm Hòn Thơm");
  assert.deepEqual(changed.parsed.interests, ["VinWonders", "Hòn Thơm"]);
  assert.equal(changed.parsed.days, 3);
});

test("explicit new trip alone creates a fresh context", () => {
  const first = state.resolveTripTurn(null, "3 ngày 2 đêm, Safari");
  const second = state.resolveTripTurn(first.parsed, "chuyến mới cho 2 người lớn, muốn đi Hòn Thơm");
  assert.equal(second.action, "new_trip");
  assert.equal(second.parsed.days, undefined);
  assert.equal(second.parsed.adults, 2);
  assert.deepEqual(second.parsed.interests, ["Hòn Thơm"]);
});

test("simple food follow-up retains duration and party size", () => {
  const first = state.resolveTripTurn(null, "3 ngày 2 đêm, 2 người lớn, Safari");
  const next = state.resolveTripTurn(first.parsed, "Tối ăn gì ở Dương Đông?");
  assert.equal(next.parsed.mode, "food");
  assert.equal(next.parsed.days, 3);
  assert.equal(next.parsed.adults, 2);
  assert.deepEqual(next.parsed.interests, ["Safari", "Ăn uống"]);
});

test("a revised duration clears saved dates rather than showing stale priced results", () => {
  const first = state.resolveTripTurn(null, "3 ngày 2 đêm, 2 người lớn, Safari");
  const dated = { ...first.parsed, checkin: "2030-01-10", checkout: "2030-01-12" };
  const revised = state.resolveTripTurn(dated, "đổi thành 4 ngày 3 đêm");
  assert.equal(revised.parsed.days, 4);
  assert.equal(revised.parsed.nights, 3);
  assert.equal(revised.parsed.checkin, undefined);
  assert.ok(revised.nextNeeded.includes("travel_dates"));
});
