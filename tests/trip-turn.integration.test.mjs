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
          if (/FROM trip_turns_v2\s+WHERE/i.test(sql)) {
            if (/client_turn_id=\?/i.test(sql)) {
              return this.turns.get(params[0] + ":" + params[1]) || null;
            }
            const records = [...this.turns.entries()]
              .filter(([key, value]) => key.startsWith(params[0] + ":") && value.trip_id === params[1])
              .map(([, value]) => value)
              .sort((a, b) => JSON.parse(b.response_json).version - JSON.parse(a.response_json).version);
            return records.find(item => {
              const response = JSON.parse(item.response_json);
              if (/!= 'acknowledgement'/i.test(sql) && response.action === "acknowledgement") return false;
              if (/\$\.plan/i.test(sql) && !response.plan) return false;
              if (/\$\.advisor/i.test(sql) && !response.advisor) return false;
              return true;
            }) || null;
          }
          if (/FROM trip_sessions_v2 WHERE/i.test(sql)) {
            return this.sessions.get(params[0]) || null;
          }
          return null;
        },
        all: async () => {
          if (/FROM trip_turns_v2/i.test(sql)) {
            return { results: [...this.turns.entries()]
              .filter(([key, value]) => key.startsWith(params[0] + ":") && value.trip_id === params[1])
              .map(([key, value]) => ({ ...value, client_turn_id: key.split(":")[1] }))
              .sort((a, b) => JSON.parse(b.response_json).version - JSON.parse(a.response_json).version)
              .slice(0, 6) };
          }
          return { results: [] };
        },
      }),
    };
  }
  async batch(statements) {
    const [first, second] = statements;
    if (/^DELETE FROM trip_turns_v2/i.test(first.sql)) {
      const id = first.params[0];
      const isRetention = /SELECT session_id/i.test(first.sql);
      const cutoff = isRetention ? id : null;
      const ids = isRetention
        ? [...this.sessions.entries()].filter(([, row]) => row.updated_at < cutoff).map(([key]) => key)
        : [id];
      let turnsDeleted = 0, sessionsDeleted = 0;
      for (const sessionId of ids) {
        for (const key of [...this.turns.keys()]) {
          if (key.startsWith(sessionId + ":")) { this.turns.delete(key); turnsDeleted++; }
        }
        if (this.sessions.delete(sessionId)) sessionsDeleted++;
      }
      return [{ meta: { changes: turnsDeleted } }, { meta: { changes: sessionsDeleted } }];
    }
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

test("session context can be restored after refresh", async () => {
  const db = new D1Fixture();
  const first = await turn(db, "3 ngày 2 đêm, 2 người lớn, Safari", "client-turn-300", "session-qa-0003");
  assert.equal(first.status, 200);
  const res = await worker.fetch(
    new Request("https://trip.test/api/trip/session", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session-qa-0003" }),
    }),
    { DB: db },
  );
  assert.equal(res.status, 200);
  const snapshot = await res.json();
  assert.equal(snapshot.parsed.days, 3);
  assert.equal(snapshot.parsed.adults, 2);
  assert.equal(snapshot.tripId, first.body.tripId);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.history.length, 2);
  assert.ok(snapshot.plan?.ok);
});

test("date selection is saved and repriced in the same authoritative trip", async () => {
  const db = new D1Fixture();
  const first = await turn(db, "3 ngày 2 đêm, 2 người lớn, Safari", "client-turn-400", "session-qa-0004");
  assert.equal(first.status, 200);
  const body = {
    text: "Tính chuyến từ 2030-01-10 đến 2030-01-12",
    sessionId: "session-qa-0004", clientTurnId: "client-turn-401",
    checkin: "2030-01-10", checkout: "2030-01-12",
  };
  const request = () => new Request("https://trip.test/api/trip/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const selected = await worker.fetch(request(), { DB: db });
  assert.equal(selected.status, 200);
  const result = await selected.json();
  assert.equal(result.action, "set_dates");
  assert.equal(result.tripId, first.body.tripId);
  assert.equal(result.parsed.checkin, "2030-01-10");
  assert.equal(result.parsed.checkout, "2030-01-12");
  assert.equal(result.parsed.nights, 2);
  assert.ok(result.plan?.ok);
  assert.ok(!result.nextNeeded.includes("travel_dates"));

  const duplicate = await worker.fetch(request(), { DB: db });
  assert.deepEqual(await duplicate.json(), result);
  assert.equal(db.turns.size, 2);

  const next = await turn(db, "thêm Hòn Thơm", "client-turn-402", "session-qa-0004");
  assert.equal(next.status, 200);
  assert.equal(next.body.parsed.checkin, "2030-01-10");
  assert.equal(next.body.parsed.checkout, "2030-01-12");

  const changed = await turn(db, "đổi thành 4 ngày 3 đêm", "client-turn-403", "session-qa-0004");
  assert.equal(changed.status, 200);
  assert.equal(changed.body.parsed.checkin, undefined);
  assert.equal(changed.body.parsed.checkout, undefined);

  const newTrip = await turn(db, "chuyến mới cho 2 người lớn", "client-turn-404", "session-qa-0004");
  assert.equal(newTrip.status, 200);
  assert.equal(newTrip.body.parsed.checkin, undefined);
  assert.notEqual(newTrip.body.tripId, first.body.tripId);
});

test("invalid or conflicting date selections do not change the saved trip", async () => {
  const db = new D1Fixture();
  const invalid = await worker.fetch(new Request("https://trip.test/api/trip/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Tính ngày", sessionId: "session-qa-0005", clientTurnId: "client-turn-500",
      checkin: "2030-02-30", checkout: "2030-03-03",
    }),
  }), { DB: db });
  assert.equal(invalid.status, 400);
  assert.equal(db.sessions.size, 0);

  const first = await worker.fetch(new Request("https://trip.test/api/trip/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Tính ngày", sessionId: "session-qa-0005", clientTurnId: "client-turn-500",
      checkin: "2030-02-10", checkout: "2030-02-12",
    }),
  }), { DB: db });
  assert.equal(first.status, 200);
  const changedDates = await worker.fetch(new Request("https://trip.test/api/trip/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Tính ngày", sessionId: "session-qa-0005", clientTurnId: "client-turn-500",
      checkin: "2030-02-11", checkout: "2030-02-13",
    }),
  }), { DB: db });
  assert.equal(changedDates.status, 409);
  assert.equal((await changedDates.json()).error, "turn_id_reused_with_different_dates");
  assert.equal(db.turns.size, 1);
});

test("anonymous traveler can delete the V2 transcript and trip without touching leads", async () => {
  const db = new D1Fixture();
  const first = await turn(db, "3 ngày 2 đêm, Safari", "client-turn-600", "session-qa-0006");
  assert.equal(first.status, 200);
  const res = await worker.fetch(new Request("https://trip.test/api/trip/session", {
    method: "DELETE", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-qa-0006" }),
  }), { DB: db });
  assert.equal(res.status, 200);
  const deleted = await res.json();
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.bookingLeadsAffected, false);
  assert.equal(db.turns.size, 0);
  assert.equal(db.sessions.size, 0);
  const restore = await worker.fetch(new Request("https://trip.test/api/trip/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-qa-0006" }),
  }), { DB: db });
  assert.equal(restore.status, 404);
});

test("scheduled retention purges only sessions idle beyond the configured period", async () => {
  const db = new D1Fixture();
  await turn(db, "Safari", "client-turn-700", "session-qa-0007");
  await turn(db, "Hòn Thơm", "client-turn-701", "session-qa-0008");
  db.sessions.get("session-qa-0007").updated_at = "2000-01-01T00:00:00.000Z";
  await worker.scheduled({ cron: "0 20 * * *" }, { DB: db, TRIP_RETENTION_DAYS: "90" });
  assert.equal(db.sessions.has("session-qa-0007"), false);
  assert.equal(db.sessions.has("session-qa-0008"), true);
});

test("V2 analytics requires internal authorization and returns only aggregates", async () => {
  const unauthorized = await worker.fetch(
    new Request("https://trip.test/api/internal/analytics/trip-v2"),
    { INTERNAL_API_TOKEN: "server-only-secret" },
  );
  assert.equal(unauthorized.status, 401);
  const db = {
    batch: async () => [
      { results: [{ count: 2 }] }, { results: [{ count: 5 }] },
      { results: [{ count: 1 }] }, { results: [{ days: 3, nights: 2, count: 2 }] },
      { results: [{ adults: 2, children: 1, count: 1 }] },
      { results: [{ interest: "Safari", count: 1 }] },
      { results: [{ action: "request", count: 5 }] },
      { results: [{ day: "2030-01-10", turns: 5 }] },
    ],
    prepare: sql => ({ sql }),
  };
  const authorized = await worker.fetch(new Request(
    "https://trip.test/api/internal/analytics/trip-v2",
    { headers: { authorization: "Bearer server-only-secret" } },
  ), { DB: db, INTERNAL_API_TOKEN: "server-only-secret" });
  assert.equal(authorized.status, 200);
  const body = await authorized.json();
  assert.equal(body.schema, "trip_v2");
  assert.equal(body.sessions, 2);
  assert.equal(body.sessionsWithDates, 1);
  assert.equal(JSON.stringify(body).includes("session-qa"), false);
  assert.equal(Object.hasOwn(body, "recent"), false);
});

test("restoration does not resurrect a stale plan after switching to food advice", async () => {
  const db = new D1Fixture();
  const first = await turn(db, "3 ngày 2 đêm, Safari", "client-turn-800", "session-qa-0009");
  assert.equal(first.status, 200);
  const food = await turn(db, "Tối ăn gì ở Dương Đông?", "client-turn-801", "session-qa-0009");
  assert.equal(food.status, 200, JSON.stringify(food.body));
  assert.equal(food.body.parsed.mode, "food");
  const restored = await worker.fetch(new Request("https://trip.test/api/trip/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-qa-0009" }),
  }), { DB: db });
  assert.equal(restored.status, 200);
  const snapshot = await restored.json();
  assert.equal(snapshot.plan, null);
  assert.ok(snapshot.advisor?.ok);
  assert.equal(snapshot.history.length, 4);
});

test("health is not ready until both canonical V2 D1 tables exist", async () => {
  const noDb = await worker.fetch(new Request("https://trip.test/api/health"), {});
  assert.equal(noDb.status, 503);
  assert.equal((await noDb.json()).tripStateReady, false);
  const readyDb = {
    prepare: sql => ({ first: async () => {
      if (!/trip_sessions_v2|trip_turns_v2/.test(sql)) throw Error("unexpected health query");
      return null;
    } }),
  };
  const ready = await worker.fetch(new Request("https://trip.test/api/health"), { DB: readyDb });
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).tripStateReady, true);
});
