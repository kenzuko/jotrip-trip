import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["worker/index.ts"], bundle: true, format: "esm",
  platform: "browser", target: "es2022", write: false,
});
const worker = (await import("data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].contents).toString("base64"))).default;

class D1Fixture {
  sessions = new Map();
  turns = new Map();
  prepare(sql) {
    return {
      bind: (...params) => ({
        sql, params,
        first: async () => {
          if (/FROM trip_turns_v2 WHERE/i.test(sql)) {
            return this.turns.get(params[0] + ":" + params[1]) || null;
          }
          if (/FROM trip_sessions_v2 WHERE/i.test(sql)) {
            return this.sessions.get(params[0]) || null;
          }
          return null;
        },
        all: async () => ({ results: [] }),
      }),
    };
  }
  async batch(statements) {
    const [first, second] = statements;
    let changes = 0;
    if (/INSERT OR IGNORE INTO trip_sessions_v2/i.test(first.sql)) {
      const [id, trip_id, state_json, last_turn_id, updated_at] = first.params;
      if (!this.sessions.has(id)) {
        this.sessions.set(id, { state_json, trip_id, version: 1, last_turn_id, updated_at });
        changes = 1;
      }
    } else if (/UPDATE trip_sessions_v2/i.test(first.sql)) {
      const [trip_id, state_json, version, last_turn_id, updated_at, id, expected] = first.params;
      const old = this.sessions.get(id);
      if (old && old.version === expected) {
        this.sessions.set(id, { state_json, trip_id, version, last_turn_id, updated_at });
        changes = 1;
      }
    } else throw Error("Unexpected SQL " + first.sql);
    let inserted = 0;
    if (changes) {
      const [id, turn, trip_id, input_text, response_json, created_at, guardId, guardVersion, guardTurn] = second.params;
      const current = this.sessions.get(guardId);
      const key = id + ":" + turn;
      if (current && current.version === guardVersion && current.last_turn_id === guardTurn && !this.turns.has(key)) {
        this.turns.set(key, { input_text, response_json, trip_id, created_at });
        inserted = 1;
      }
    }
    return [{ meta: { changes } }, { meta: { changes: inserted } }];
  }
}

async function turn(db, text, id, sessionId = "session-qa-0001") {
  const res = await worker.fetch(new Request("https://trip.test/api/trip/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, sessionId, clientTurnId: id }),
  }), { DB: db });
  return { status: res.status, body: await res.json() };
}

test("single authoritative turn preserves context and returns identical duplicate response", async () => {
  const db = new D1Fixture();
  const first = await turn(db, "3 ngày 2 đêm, 2 người lớn, Safari và VinWonders", "client-turn-001");
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.parsed.days, 3);
  assert.equal(first.body.version, 1);
  assert.ok(first.body.plan?.ok);
  const retry = await turn(db, "3 ngày 2 đêm, 2 người lớn, Safari và VinWonders", "client-turn-001");
  assert.deepEqual(retry, first);
  assert.equal(db.turns.size, 1);

  const ack = await turn(db, "a", "client-turn-002");
  assert.equal(ack.status, 200, JSON.stringify(ack.body));
  assert.equal(ack.body.action, "acknowledgement");
  assert.equal(ack.body.parsed.days, 3);
  assert.equal(ack.body.plan, null);
  assert.equal(db.turns.size, 2);

  const add = await turn(db, "thêm Hòn Thơm", "client-turn-003");
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.deepEqual(add.body.parsed.interests, ["VinWonders", "Safari", "Hòn Thơm"]);
  assert.equal(add.body.parsed.days, 3);
  assert.equal(add.body.tripId, first.body.tripId);
  assert.equal(add.body.version, 3);

  const fresh = await turn(db, "chuyến mới cho 2 người lớn, muốn đi Hòn Thơm", "client-turn-004");
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.equal(fresh.body.action, "new_trip");
  assert.notEqual(fresh.body.tripId, first.body.tripId);
  assert.equal(fresh.body.parsed.days, undefined);
  assert.deepEqual(fresh.body.parsed.interests, ["Hòn Thơm"]);
  assert.equal(db.turns.size, 4);
});

test("turn ID cannot be reused with different text", async () => {
  const db = new D1Fixture();
  const first = await turn(db, "a", "client-turn-100");
  assert.equal(first.status, 200);
  const second = await turn(db, "Safari", "client-turn-100");
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "turn_id_reused_with_different_text");
  assert.equal(db.turns.size, 1);
});

test("missing D1 never pretends the trip has been saved", async () => {
  const res = await worker.fetch(new Request("https://trip.test/api/trip/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Safari", sessionId: "session-qa-0002", clientTurnId: "client-turn-200" }),
  }), {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "trip_state_unavailable");
});
