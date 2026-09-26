import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.WORKER_BASE_URL || "http://127.0.0.1:8787";
const staffToken = "local-e2e-only";

async function call(path, { method = "GET", body, token } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

const health = await call("/api/health");
assert.equal(health.status, 200);
assert.equal(health.payload.schemaReady, true);

const legacyEstimate = await call("/api/mobility/estimate", {
  method: "POST",
  body: { distanceKm: 5 },
});
assert.equal(legacyEstimate.status, 200);
assert.equal(legacyEstimate.payload.ok, true);
assert.equal(legacyEstimate.payload.vehicle, "7_SEAT");

const sessionId = `e2e_${randomUUID()}`;
const firstTurnId = `turn_${randomUUID()}`;
const retryTurnId = `turn_${randomUUID()}`;
const today = new Date();
const checkinDate = new Date(today);
checkinDate.setUTCDate(today.getUTCDate() + 14);
const checkoutDate = new Date(today);
checkoutDate.setUTCDate(today.getUTCDate() + 16);
const checkin = checkinDate.toISOString().slice(0, 10);
const checkout = checkoutDate.toISOString().slice(0, 10);
const firstTurnBody = {
  text: "a",
  sessionId,
  clientTurnId: firstTurnId,
  checkin,
  checkout,
};

const firstTurn = await call("/api/trip/turn", { method: "POST", body: firstTurnBody });
assert.equal(firstTurn.status, 200);
assert.equal(firstTurn.payload.action, "set_dates");
assert.equal(firstTurn.payload.version, 1);
assert.equal(firstTurn.payload.parsed.checkin, checkin);
assert.equal(firstTurn.payload.parsed.checkout, checkout);

const retriedTurn = await call("/api/trip/turn", { method: "POST", body: firstTurnBody });
assert.equal(retriedTurn.status, 200);
assert.deepEqual(retriedTurn.payload, firstTurn.payload);

const retryTurn = await call("/api/trip/turn", {
  method: "POST",
  body: { text: "a", sessionId, clientTurnId: retryTurnId },
});
assert.equal(retryTurn.status, 200);
assert.equal(retryTurn.payload.action, "acknowledgement");
assert.equal(retryTurn.payload.version, 2);

const restored = await call("/api/trip/session", {
  method: "POST",
  body: { sessionId },
});
assert.equal(restored.status, 200);
assert.equal(restored.payload.version, 2);
assert.equal(restored.payload.parsed.checkin, checkin);
assert.equal(restored.payload.parsed.checkout, checkout);
assert.equal(restored.payload.history.length, 4);

const leadId = randomUUID();
const leadBody = {
  sessionId,
  clientLeadId: leadId,
  expectedTripId: firstTurn.payload.tripId,
  expectedVersion: 2,
  contact: `e2e-${leadId}@example.invalid`,
  contactChannel: "email",
  consent: true,
};

const deniedConsent = await call("/api/booking/lead", {
  method: "POST",
  body: { ...leadBody, consent: false },
});
assert.equal(deniedConsent.status, 400);
assert.equal(deniedConsent.payload.error, "consent_required");

const staleLead = await call("/api/booking/lead", {
  method: "POST",
  body: { ...leadBody, expectedVersion: 1 },
});
assert.equal(staleLead.status, 409);
assert.equal(staleLead.payload.error, "stale_trip_refresh_required");

const acceptedLead = await call("/api/booking/lead", {
  method: "POST",
  body: leadBody,
});
assert.equal(acceptedLead.status, 200);
assert.equal(acceptedLead.payload.ok, true);
assert.equal(acceptedLead.payload.alreadyReceived, false);

const retriedLead = await call("/api/booking/lead", {
  method: "POST",
  body: leadBody,
});
assert.equal(retriedLead.status, 200);
assert.equal(retriedLead.payload.alreadyReceived, true);

const deniedErasure = await call("/api/internal/booking-lead/erase", {
  method: "POST",
  body: { leadId, reason: "verified_customer_request" },
});
assert.equal(deniedErasure.status, 401);

const deletedSession = await call("/api/trip/session", {
  method: "DELETE",
  body: { sessionId },
});
assert.equal(deletedSession.status, 200);
assert.equal(deletedSession.payload.tombstoneCreated, true);
assert.equal(deletedSession.payload.bookingLeadsAffected, false);

const leadSurvivesChatDeletion = await call("/api/booking/lead", {
  method: "POST",
  body: leadBody,
});
assert.equal(leadSurvivesChatDeletion.status, 200);
assert.equal(leadSurvivesChatDeletion.payload.alreadyReceived, true);

const missingSession = await call("/api/trip/session", {
  method: "POST",
  body: { sessionId },
});
assert.equal(missingSession.status, 410);
const blockedRetry = await call("/api/trip/turn", {
  method: "POST",
  body: { text: "a", sessionId, clientTurnId: `turn_${randomUUID()}` },
});
assert.equal(blockedRetry.status, 410);

const erasedLead = await call("/api/internal/booking-lead/erase", {
  method: "POST",
  body: { leadId, reason: "verified_customer_request" },
  token: staffToken,
});
assert.equal(erasedLead.status, 200);
assert.equal(erasedLead.payload.deleted, true);
assert.equal(erasedLead.payload.consentDeleted, true);
assert.equal(erasedLead.payload.auditRecorded, true);

const blockedLeadReplay = await call("/api/booking/lead", {
  method: "POST",
  body: leadBody,
});
assert.equal(blockedLeadReplay.status, 410);
assert.equal(blockedLeadReplay.payload.error, "lead_erased");

console.log("Local Worker HTTP e2e passed: legacy route, saved turns, retries, restore, consent, stale version, independent lead erasure and session tombstone.");
