import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["worker/index.ts"], bundle: true, format: "esm",
  platform: "browser", target: "es2022", write: false,
});
const worker = (await import("data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].contents).toString("base64"))).default;
const leadBundle = await build({
  entryPoints: ["worker/bookingLead.ts"], bundle: true, format: "esm",
  platform: "browser", target: "es2022", write: false,
});
const bookingLead = await import("data:text/javascript;base64," +
  Buffer.from(leadBundle.outputFiles[0].contents).toString("base64"));

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
  auditTimes = new Map();
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
        run: async () => this.runStatement(sql, params),
      }),
    };
  }
  async runStatement(sql, params) {
    const lead = this.leads.get(params[0]);
    if (/lifecycle_status='OPEN'/i.test(sql)) {
      if (!lead || lead.lifecycleStatus === "FULFILLED") return { meta: { changes: 0 } };
      lead.lifecycleStatus = "OPEN";
      lead.lastContactAt = new Date().toISOString();
      lead.completedAt = null;
      return { meta: { changes: 1 } };
    }
    if (/lifecycle_status='UNRESPONSIVE'/i.test(sql)) {
      if (!lead || lead.lifecycleStatus === "FULFILLED") return { meta: { changes: 0 } };
      lead.lifecycleStatus = "UNRESPONSIVE";
      return { meta: { changes: 1 } };
    }
    if (/lifecycle_status='FULFILLED'/i.test(sql)) {
      if (!lead || lead.lifecycleStatus === "FULFILLED") return { meta: { changes: 0 } };
      lead.lifecycleStatus = "FULFILLED";
      lead.completedAt = new Date().toISOString();
      return { meta: { changes: 1 } };
    }
    throw Error("Unexpected D1 run: " + sql);
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
      if (insert) this.leads.set(id, {
        sessionId, contact, channel, language, note, context,
        lifecycleStatus: "OPEN", createdAt: new Date().toISOString(),
        lastContactAt: new Date().toISOString(), completedAt: null,
      });
      const lead = this.leads.get(consentId);
      const consent = lead && !this.consents.has(consentId) &&
        lead.sessionId === consentSession && lead.contact === consentContact &&
        JSON.parse(lead.context).tripVersion === consentVersionNumber;
      if (consent) this.consents.set(consentId, consentVersion);
      return [{ meta: { changes: insert ? 1 : 0 } }, { meta: { changes: consent ? 1 : 0 } }];
    }
    if (/booking_leads_expired_v2/i.test(statements[0].sql)) {
      const now = Date.now();
      const expired = [...this.leads.entries()].filter(([, lead]) => {
        const reference = lead.lifecycleStatus === "FULFILLED"
          ? lead.completedAt
          : lead.lastContactAt || lead.createdAt;
        const age = now - Date.parse(reference || "");
        return lead.lifecycleStatus === "FULFILLED"
          ? Number.isFinite(age) && age >= 30 * 86_400_000
          : ["OPEN", "UNRESPONSIVE"].includes(lead.lifecycleStatus) &&
            Number.isFinite(age) && age >= 90 * 86_400_000;
      }).map(([id]) => id);
      let tombstonesAdded = 0;
      for (const id of expired) {
        if (!this.audit.has(id)) {
          this.audit.set(id, "operational_cleanup");
          this.auditTimes.set(id, now);
          tombstonesAdded++;
        }
      }
      let consentsDeleted = 0;
      for (const id of expired) if (this.consents.delete(id)) consentsDeleted++;
      for (const id of expired) this.leads.delete(id);
      let tombstonesExpired = 0;
      for (const [id, erasedAt] of this.auditTimes) {
        if (erasedAt <= now - 180 * 86_400_000) {
          this.audit.delete(id);
          this.auditTimes.delete(id);
          tombstonesExpired++;
        }
      }
      return [
        { meta: { changes: tombstonesAdded } },
        { meta: { changes: consentsDeleted } },
        { meta: { changes: expired.length } },
        { meta: { changes: tombstonesExpired } },
      ];
    }
    if (/INSERT OR IGNORE INTO booking_lead_erasure_audit/i.test(statements[0].sql)) {
      const [reason, id] = statements[0].params;
      const existed = this.leads.has(id);
      if (existed) {
        this.audit.set(id, reason);
        this.auditTimes.set(id, Date.now());
      }
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

test("lost-response retry creates only one lead and rejects changed contact", async () => {
  const db = new BookingDB();
  const payload = { ...leadIdentity, sessionId: "session-booking-0001",
    contact: "guest@example.com", consent: true };
  const first = await worker.fetch(post("/api/booking/lead", payload), { DB: db });
  assert.equal(first.status, 200);
  const retry = await worker.fetch(post("/api/booking/lead", payload), { DB: db });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).alreadyReceived, true);
  assert.equal(db.leads.size, 1);
  const changed = await worker.fetch(post("/api/booking/lead", {
    ...payload, contact: "another@example.com",
  }), { DB: db });
  assert.equal(changed.status, 409, JSON.stringify(await changed.clone().json()));
  assert.equal((await changed.json()).error, "lead_id_conflict");
  assert.equal(db.leads.size, 1);
});

test("another tab editing the trip before or during lead submission blocks handoff", async () => {
  const db = new BookingDB();
  const payload = { ...leadIdentity, sessionId: "session-booking-0001",
    contact: "guest@example.com", consent: true };
  db.sessions.get(payload.sessionId).version = 8;
  const stale = await worker.fetch(post("/api/booking/lead", payload), { DB: db });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error, "stale_trip_refresh_required");
  assert.equal(db.leads.size, 0);
  db.beforeBatch = () => { db.sessions.get(payload.sessionId).trip_id = "trip-changed-in-other-tab"; };
  const racing = await worker.fetch(post("/api/booking/lead", {
    ...payload, clientLeadId: "22222222-2222-4222-8222-222222222222", expectedVersion: 8,
  }), { DB: db });
  assert.equal(racing.status, 409);
  assert.equal((await racing.json()).error, "stale_trip_refresh_required");
  assert.equal(db.leads.size, 0);
});

test("erased lead cannot be recreated by a delayed browser retry", async () => {
  const db = new BookingDB();
  const payload = { ...leadIdentity, sessionId: "session-booking-0001",
    contact: "guest@example.com", consent: true };
  const saved = await worker.fetch(post("/api/booking/lead", payload), { DB: db });
  assert.equal(saved.status, 200);
  const erased = await worker.fetch(post("/api/internal/booking-lead/erase", {
    leadId: leadIdentity.clientLeadId, reason: "verified_customer_request",
  }, "staff-only"), { DB: db, LEAD_ADMIN_TOKEN: "staff-only" });
  assert.equal(erased.status, 200);
  const replay = await worker.fetch(post("/api/booking/lead", payload), { DB: db });
  assert.equal(replay.status, 410);
  assert.equal((await replay.json()).error, "lead_erased");
  assert.equal(db.leads.size, 0);
});

test("staff-only lifecycle records human contact and makes fulfilled leads final", async () => {
  const db = new BookingDB();
  const saved = await worker.fetch(post("/api/booking/lead", {
    sessionId: "session-booking-0001", ...leadIdentity,
    contact: "guest@example.com", consent: true,
  }), { DB: db });
  const { id } = await saved.json();
  const env = { DB: db, LEAD_ADMIN_TOKEN: "staff-only", INTERNAL_API_TOKEN: "analytics-readonly" };

  const denied = await worker.fetch(post("/api/internal/booking-lead/lifecycle", {
    leadId: id, action: "mark_unresponsive",
  }), env);
  assert.equal(denied.status, 401);

  const lead = db.leads.get(id);
  lead.lastContactAt = "2000-01-01T00:00:00.000Z";
  const unresponsive = await worker.fetch(post("/api/internal/booking-lead/lifecycle", {
    leadId: id, action: "mark_unresponsive",
  }, "staff-only"), env);
  assert.equal(unresponsive.status, 200);
  assert.equal((await unresponsive.json()).status, "UNRESPONSIVE");
  assert.equal(lead.lastContactAt, "2000-01-01T00:00:00.000Z");

  const contacted = await worker.fetch(post("/api/internal/booking-lead/lifecycle", {
    leadId: id, action: "record_contact",
  }, "staff-only"), env);
  assert.equal(contacted.status, 200);
  assert.equal((await contacted.json()).status, "OPEN");
  assert.notEqual(lead.lastContactAt, "2000-01-01T00:00:00.000Z");

  const fulfilled = await worker.fetch(post("/api/internal/booking-lead/lifecycle", {
    leadId: id, action: "mark_fulfilled",
  }, "staff-only"), env);
  assert.equal(fulfilled.status, 200);
  assert.equal((await fulfilled.json()).status, "FULFILLED");
  assert.ok(lead.completedAt);

  const lateContact = await worker.fetch(post("/api/internal/booking-lead/lifecycle", {
    leadId: id, action: "record_contact",
  }, "staff-only"), env);
  assert.equal(lateContact.status, 409);
  assert.equal(lead.lifecycleStatus, "FULFILLED");
});

test("scheduled lead retention deletes expired lead data and ages out tombstones", async () => {
  const db = new BookingDB();
  const stale = new Date(Date.now() - 91 * 86_400_000).toISOString();
  const done = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const almostStale = new Date(Date.now() - 89 * 86_400_000).toISOString();
  const almostDone = new Date(Date.now() - 29 * 86_400_000).toISOString();
  db.leads.set("old-open", {
    contact: "old-open@example.invalid", context: "{}", lifecycleStatus: "OPEN",
    createdAt: stale, lastContactAt: stale,
  });
  db.leads.set("old-unresponsive", {
    contact: "old-unresponsive@example.invalid", context: "{}", lifecycleStatus: "UNRESPONSIVE",
    createdAt: stale, lastContactAt: stale,
  });
  db.leads.set("old-fulfilled", {
    contact: "old-fulfilled@example.invalid", context: "{}", lifecycleStatus: "FULFILLED",
    createdAt: done, lastContactAt: done, completedAt: done,
  });
  db.leads.set("fresh-open", {
    contact: "fresh-open@example.invalid", context: "{}", lifecycleStatus: "OPEN",
    createdAt: almostStale, lastContactAt: almostStale,
  });
  db.leads.set("fresh-fulfilled", {
    contact: "fresh-fulfilled@example.invalid", context: "{}", lifecycleStatus: "FULFILLED",
    createdAt: almostDone, lastContactAt: almostDone, completedAt: almostDone,
  });
  db.consents.set("old-open", "booking_contact_v2");
  const now = Date.now();
  db.audit.set("old-erasure", "verified_customer_request");
  db.auditTimes.set("old-erasure", now - 181 * 86_400_000);
  db.audit.set("recent-erasure", "verified_customer_request");
  db.auditTimes.set("recent-erasure", now - 179 * 86_400_000);

  const result = await bookingLead.purgeExpiredBookingLeads({ DB: db });
  assert.equal(result.ok, true);
  assert.equal(result.leadsDeleted, 3);
  assert.equal(result.tombstonesAdded, 3);
  assert.equal(result.tombstonesExpired, 1);
  assert.equal(result.consentsDeleted, 1);
  assert.equal(db.leads.has("old-open"), false);
  assert.equal(db.leads.has("old-unresponsive"), false);
  assert.equal(db.leads.has("old-fulfilled"), false);
  assert.equal(db.leads.has("fresh-open"), true);
  assert.equal(db.leads.has("fresh-fulfilled"), true);
  assert.equal(db.consents.has("old-open"), false);
  assert.equal(db.audit.get("old-open"), "operational_cleanup");
  assert.equal(db.audit.has("old-erasure"), false);
  assert.equal(db.audit.has("recent-erasure"), true);
});

