import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["worker/index.ts"], bundle: true, format: "esm",
  platform: "browser", target: "es2022", write: false,
});
const worker = (await import("data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].contents).toString("base64"))).default;

class BookingDB {
  sessions = new Map([
    ["session-booking-0001", {
      trip_id: "trip-0001", version: 7,
      state_json: JSON.stringify({
        adults: 2, children: 1, days: 3, nights: 2,
        checkin: "2030-01-10", checkout: "2030-01-12",
        interests: ["Safari", "Hòn Thơm", "private-phone-123"],
        raw: "Please call me at private-phone-123",
        budgetVnd: 99999999, language: "en",
      }),
    }],
  ]);
  tombstones = new Set();
  leads = new Map();
  consents = new Map();
  audit = new Map();
  beforeBatch = null;
  prepare(sql) {
    return {
      sql,
      bind: (...params) => ({
        sql, params,
        first: async () => {
          if (/FROM booking_lead_erasure_audit/i.test(sql))
            return this.audit.has(params[0]) ? { erased: 1 } : null;
          if (/FROM booking_leads/i.test(sql)) {
            const lead = this.leads.get(params[0]);
            return lead ? { session_id: lead.sessionId, contact: lead.contact, trip_context_json: lead.context } : null;
          }
          if (/FROM trip_deleted_sessions_v2/i.test(sql))
            return this.tombstones.has(params[0]) ? { blocked: 1 } : null;
          if (/FROM trip_sessions_v2/i.test(sql))
            return this.sessions.get(params[0]) || null;
          return null;
        },
      }),
    };
  }
  async batch(statements) {
    if (/INSERT OR IGNORE INTO booking_leads/i.test(statements[0].sql)) {
      this.beforeBatch?.();
      const [id, sessionId, contact, channel, language, note, context,
        guardedSession, guardedTrip, guardedVersion] = statements[0].params;
      const [consentVersion, consentId, consentSession, consentContact, consentVersionNumber] =
        statements[1].params;
      assert.equal(id, consentId);
      const session = this.sessions.get(guardedSession);
      const insert = !this.leads.has(id) && !this.audit.has(id) &&
        !this.tombstones.has(sessionId) && session &&
        session.trip_id === guardedTrip && session.version === guardedVersion;
      if (insert) this.leads.set(id, { sessionId, contact, channel, language, note, context });
      const lead = this.leads.get(consentId);
      const consent = lead && !this.consents.has(consentId) &&
        lead.sessionId === consentSession && lead.contact === consentContact &&
        JSON.parse(lead.context).tripVersion === consentVersionNumber;
      if (consent) this.consents.set(consentId, consentVersion);
      return [{ meta: { changes: insert ? 1 : 0 } }, { meta: { changes: consent ? 1 : 0 } }];
    }
    if (/INSERT OR IGNORE INTO booking_lead_erasure_audit/i.test(statements[0].sql)) {
      const [reason, id] = statements[0].params;
      const existed = this.leads.has(id);
      if (existed) this.audit.set(id, reason);
      const hadConsent = this.consents.delete(id);
      this.leads.delete(id);
      return [
        { meta: { changes: existed ? 1 : 0 } },
        { meta: { changes: hadConsent ? 1 : 0 } },
        { meta: { changes: existed ? 1 : 0 } },
      ];
    }
    throw Error("Unexpected D1 batch: " + statements[0].sql);
  }
}
const endpoint = "https://trip.test";
const leadIdentity = { clientLeadId: "11111111-1111-4111-8111-111111111111", expectedTripId: "trip-0001", expectedVersion: 7 };
function post(path, payload, token) {
  return new Request(endpoint + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(payload),
  });
}

test("booking handoff requires explicit separate consent and canonical session", async () => {
  const db = new BookingDB();
  const base = { ...leadIdentity, sessionId: "session-booking-0001", contact: "guest@example.com" };
  const denied = await worker.fetch(post("/api/booking/lead", base), { DB: db });
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).error, "consent_required");
  assert.equal(db.leads.size, 0);
  const missing = await worker.fetch(post("/api/booking/lead", {
    ...base, sessionId: "session-not-found", consent: true,
  }), { DB: db });
  assert.equal(missing.status, 404);
  db.tombstones.add("session-booking-0001");
  const deleted = await worker.fetch(post("/api/booking/lead", {
    ...base, consent: true,
  }), { DB: db });
  assert.equal(deleted.status, 410);
  assert.equal(db.leads.size, 0);
});

test("booking lead saves only allowlisted server state, not client raw text or plan", async () => {
  const db = new BookingDB();
  const response = await worker.fetch(post("/api/booking/lead", {
    sessionId: "session-booking-0001", ...leadIdentity,
    contact: "guest@example.com", consent: true,
    tripContext: { raw: "client-injected secret", plan: { privateRates: [999] } },
    language: "vi",
  }), { DB: db });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "NEW");
  assert.equal(db.leads.size, 1);
  const lead = db.leads.get(result.id);
  const summary = JSON.parse(lead.context);
  assert.equal(summary.schema, "booking_handoff_v2");
  assert.equal(summary.tripId, "trip-0001");
  assert.equal(summary.tripVersion, 7);
  assert.equal(summary.language, "en");
  assert.deepEqual(summary.interests, ["Safari", "Hòn Thơm"]);
  assert.equal(summary.checkin, "2030-01-10");
  assert.equal(summary.checkout, "2030-01-12");
  assert.equal(JSON.stringify(summary).includes("private-phone"), false);
  assert.equal(JSON.stringify(summary).includes("99999999"), false);
  assert.equal(JSON.stringify(summary).includes("client-injected"), false);
  assert.equal(db.consents.get(result.id), "booking_contact_v2_2026-09-26");
});

test("staff erasure uses a separate secret, leaves no contact and records reason", async () => {
  const db = new BookingDB();
  const lead = await worker.fetch(post("/api/booking/lead", {
    sessionId: "session-booking-0001", ...leadIdentity,
    contact: "guest@example.com", consent: true,
  }), { DB: db });
  const { id } = await lead.json();
  const env = { DB: db, INTERNAL_API_TOKEN: "analytics-readonly", LEAD_ADMIN_TOKEN: "staff-only" };
  for (const token of [undefined, "analytics-readonly"]) {
    const denied = await worker.fetch(post("/api/internal/booking-lead/erase", {
      leadId: id, reason: "verified_customer_request",
    }, token), env);
    assert.equal(denied.status, 401);
    assert.equal(db.leads.size, 1);
  }
  const erased = await worker.fetch(post("/api/internal/booking-lead/erase", {
    leadId: id, reason: "verified_customer_request",
  }, "staff-only"), env);
  assert.equal(erased.status, 200);
  const body = await erased.json();
  assert.equal(body.deleted, true);
  assert.equal(db.leads.size, 0);
  assert.equal(db.consents.size, 0);
  assert.equal(db.audit.get(id), "verified_customer_request");
  assert.equal(JSON.stringify(body).includes("guest@example.com"), false);
  // Chat remains independently managed by its own retention policy.
  assert.equal(db.sessions.size, 1);
});
