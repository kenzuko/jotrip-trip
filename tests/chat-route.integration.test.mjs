import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle the real Worker (including its parser), not a hand-copied mock.
const bundle = await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const workerUrl = "data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].contents).toString("base64");
const worker = (await import(workerUrl)).default;

class D1Fixture {
  batches = [];
  prepare(sql) {
    return { bind: (...params) => ({ sql, params }) };
  }
  async batch(statements) {
    this.batches.push(statements);
    return [];
  }
}

async function parse(text, env, sessionId = "session-qa-1") {
  const response = await worker.fetch(new Request("https://trip.test/api/trip/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, sessionId }),
  }), env);
  assert.equal(response.status, 200);
  return response.json();
}

test("Worker persists and answers a short follow-up without replaying the recommendation", async () => {
  const fixture = new D1Fixture();
  const env = { DB: fixture };
  const first = await parse("3 ngày 2 đêm, nhà có bé, muốn đi VinWonders và Safari", env);
  const second = await parse("a", env);
  assert.equal(first.conversationAction, "request");
  assert.equal(second.conversationAction, "acknowledgement");
  assert.match(second.assistantText, /muốn xem tiếp phần nào/i);
  assert.notEqual(second.assistantText, first.assistantText);
  assert.deepEqual(second.nextNeeded, []);
  assert.equal(fixture.batches.length, 2);
  for (const batch of fixture.batches) {
    assert.equal(batch.filter((item) => /INSERT INTO chat_messages/i.test(item.sql)).length, 2);
  }
  const third = await parse("thêm Hòn Thơm", env);
  assert.equal(third.conversationAction, "request");
  assert.deepEqual(third.parsed.interests, ["Hòn Thơm"]);
});

test("empty input cannot create a transcript entry", async () => {
  const fixture = new D1Fixture();
  const response = await worker.fetch(new Request("https://trip.test/api/trip/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "  ", sessionId: "session-qa-2" }),
  }), { DB: fixture });
  assert.equal(response.status, 400);
  assert.equal(fixture.batches.length, 0);
});
