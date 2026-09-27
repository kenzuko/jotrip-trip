import test from "node:test";
import assert from "node:assert/strict";
import { interpretTravelNeeds, parseAISignals, shouldUseAI, AI_MODEL } from "../worker/aiIntent.ts";

test("Workers AI is opt-in and short structured turns are free", () => {
  assert.equal(shouldUseAI("Thêm Hòn Thơm", true), false);
  assert.equal(shouldUseAI("Nhà mình muốn đi chơi thật nhẹ nhàng và không phải di chuyển nhiều trong chuyến này", false), false);
});

test("contact details are never forwarded to Workers AI", () => {
  assert.equal(shouldUseAI("Nhà mình muốn đi nghỉ dưỡng. Liên hệ với tôi qua anh@example.com để đặt phòng nhé", true), false);
  assert.equal(shouldUseAI("Nhà mình muốn đi nghỉ dưỡng. Liên hệ với tôi qua số điện thoại 0901234567 nhé", true), false);
});

test("AI output accepts only known qualitative signals, max three", () => {
  const value = parseAISignals({ response: 'Here: {"signals":["slow_pace","family_focus","unknown","slow_pace","food_focus","quiet_focus"]}' });
  assert.deepEqual(value, ["slow_pace", "family_focus", "food_focus"]);
});

test("invalid AI output does not leak text or hallucinated facts", () => {
  assert.deepEqual(parseAISignals({ response: "I recommend a 5-star hotel for 1 million VND" }), []);
  assert.deepEqual(parseAISignals({ response: '{"signals":"slow_pace"}' }), []);
  assert.deepEqual(parseAISignals(null), []);
});

test("missing AI binding returns deterministic fallback without network call", async () => {
  const result = await interpretTravelNeeds(undefined, "Nhà mình có hai bé nhỏ và muốn chơi nhẹ nhàng không đi lại nhiều trong ba ngày", true);
  assert.deepEqual(result, []);
});

test("model errors do not block the trip request", async () => {
  const fakeAI = { run: async () => { throw new Error("quota"); } };
  assert.deepEqual(await interpretTravelNeeds(fakeAI, "Nhà mình có hai bé nhỏ và muốn chơi nhẹ nhàng không đi lại nhiều trong ba ngày", true), []);
});

test("long natural utterance calls only the approved model once", async () => {
  const calls = [];
  const fakeAI = { run: async (...args) => {
    calls.push(args);
    return { response: '{"signals":["slow_pace","family_focus"]}' };
  } };
  const text = "Nhà mình có hai bé nhỏ và muốn chơi nhẹ nhàng không đi lại nhiều trong ba ngày";
  assert.deepEqual(await interpretTravelNeeds(fakeAI, text, true), ["slow_pace", "family_focus"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], AI_MODEL);
  assert.equal(calls[0][1].messages[1].content, text);
});
