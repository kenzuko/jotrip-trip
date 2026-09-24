import test from "node:test";
import assert from "node:assert/strict";
import { buildParseResponse, isShortAcknowledgement, parseTripText } from "../worker/scenario.ts";

test("short acknowledgement is a continuation, not a new plan", () => {
  for (const text of ["a", "À", "ừ", "ok", "tiếp đi", "yes", "네", "да"]) {
    const result = buildParseResponse(text);
    assert.equal(result.conversationAction, "acknowledgement", text);
    assert.deepEqual(result.nextNeeded, [], text);
    assert.deepEqual(result.assumptions, [], text);
    assert.deepEqual(result.parsed.interests, [], text);
  }
});

test("substantive updates are not swallowed as acknowledgements", () => {
  for (const text of ["thêm Hòn Thơm", "chuyến mới cho hai vợ chồng", "ở Dương Đông thì sao?", "3 ngày 2 đêm"]) {
    assert.equal(isShortAcknowledgement(text), false, text);
    assert.equal(buildParseResponse(text).conversationAction, "request", text);
  }
  assert.deepEqual(parseTripText("thêm Hòn Thơm").interests, ["Hòn Thơm"]);
});

test("original multi-fact trip request keeps its stated facts", () => {
  const parsed = parseTripText("3 ngày 2 đêm, nhà có bé, muốn đi VinWonders và Safari");
  assert.equal(parsed.days, 3);
  assert.equal(parsed.nights, 2);
  assert.deepEqual(parsed.interests, ["VinWonders", "Safari"]);
  assert.ok(parsed.stayPreferences.includes("family"));
});
