type Env = { DB?: D1Database };

export type BookingLeadPayload = {
  sessionId?: string | null;
  clientLeadId?: string;
  expectedTripId?: string;
  expectedVersion?: number;
  contact: string;
  contactChannel?: "phone" | "email" | "whatsapp" | "other";
  language?: string;
  note?: string;
  // Legacy client payload is deliberately ignored. Only server-owned state
  // is eligible for the booking handoff.
  tripContext?: unknown;
  consent?: boolean;
  website?: string;
};

const SESSION_ID = /^[a-zA-Z0-9_-]{8,100}$/;
const LEAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const BOOKING_CONTACT_CONSENT_VERSION = "booking_contact_v2_2026-09-26";
const LANGUAGES = new Set(["vi", "en", "ko", "ru", "zh"]);
const INTERESTS = new Set([
  "Safari", "VinWonders", "Hòn Thơm", "Sunset Town", "Biển",
  "Chợ đêm", "Cà phê", "Ăn uống",
]);
const ZONES = new Set(["north", "south", "duong_dong", "long_beach"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type State = Record<string, unknown>;
function count(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= 0 && value <= max ? value : undefined;
}
function date(value: unknown): string | undefined {
  return typeof value === "string" && DATE.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
    ? value : undefined;
}

/** No chat transcript, free-form raw query, hotel quote or price payload. */
export function minimalBookingContext(state: State, tripId: string, tripVersion: number) {
  const interests = Array.isArray(state.interests)
    ? state.interests.filter((v): v is string =>
        typeof v === "string" && INTERESTS.has(v)).slice(0, 8)
    : [];
  const language = typeof state.language === "string" && LANGUAGES.has(state.language)
    ? state.language : "vi";
  const zone = typeof state.mentionedZone === "string" && ZONES.has(state.mentionedZone)
    ? state.mentionedZone : undefined;
  return {
    schema: "booking_handoff_v2",
    tripId,
    tripVersion,
    language,
    adults: count(state.adults, 30),
    children: count(state.children, 30),
    days: count(state.days, 31),
    nights: count(state.nights, 30),
    checkin: date(state.checkin),
    checkout: date(state.checkout),
    interests,
    zone,
  };
}

export async function saveBookingLead(env: Env, payload: BookingLeadPayload) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };
  if (payload.website) return { ok: true, status: "ignored" };
  if (payload.consent !== true) return { ok: false, error: "consent_required" };
  const sessionId = payload.sessionId;
  if (!sessionId || !SESSION_ID.test(sessionId)) {
    return { ok: false, error: "invalid_session_id" };
  }
  const id = payload.clientLeadId || "";
  if (!LEAD_ID.test(id)) return { ok: false, error: "invalid_client_lead_id" };
  const expectedTripId = payload.expectedTripId || "";
  const expectedVersion = payload.expectedVersion;
  if (!expectedTripId || expectedTripId.length > 100 ||
      typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return { ok: false, error: "invalid_trip_identity" };
  }
  const contact = String(payload.contact || "").trim();
  if (contact.length < 5 || contact.length > 160 ||
      /[<>\\r\\n]/.test(contact)) return { ok: false, error: "contact_invalid" };
  const channel = payload.contactChannel === "phone" ||
    payload.contactChannel === "email" || payload.contactChannel === "whatsapp"
    ? payload.contactChannel : "other";
  const note = typeof payload.note === "string"
    ? payload.note.trim().slice(0, 300) || null : null;

  // Never recreate a lead already erased by staff if a browser retries.
  const erased = await env.DB.prepare(
    "SELECT 1 FROM booking_lead_erasure_audit WHERE lead_id=?",
  ).bind(id).first();
  if (erased) return { ok: false, error: "lead_erased" };

  const matchesExisting = async () => {
    const existing = await env.DB!.prepare(
      "SELECT session_id, contact, trip_context_json FROM booking_leads WHERE id=?",
    ).bind(id).first<{ session_id: string; contact: string; trip_context_json: string }>();
    if (!existing) return null;
    let context: { tripId?: string; tripVersion?: number };
    try { context = JSON.parse(existing.trip_context_json); }
    catch { return { ok: false, error: "lead_id_conflict" }; }
    if (existing.session_id !== sessionId || existing.contact !== contact ||
        context.tripId !== expectedTripId || context.tripVersion !== expectedVersion) {
      return { ok: false, error: "lead_id_conflict" };
    }
    return { ok: true, id, status: "NEW", alreadyReceived: true };
  };
  const duplicate = await matchesExisting();
  if (duplicate) return duplicate;

  const tombstone = await env.DB.prepare(
    "SELECT 1 FROM trip_deleted_sessions_v2 WHERE session_id=?",
  ).bind(sessionId).first();
  if (tombstone) return { ok: false, error: "session_deleted" };
  const session = await env.DB.prepare(
    "SELECT trip_id, state_json, version FROM trip_sessions_v2 WHERE session_id=?",
  ).bind(sessionId).first<{ trip_id: string; state_json: string; version: number }>();
  if (!session) return { ok: false, error: "trip_session_not_found" };
  if (session.trip_id !== expectedTripId || session.version !== expectedVersion) {
    return { ok: false, error: "stale_trip_refresh_required" };
  }

  const context = minimalBookingContext(
    JSON.parse(session.state_json) as State, session.trip_id, session.version,
  );
  // Both writes run in one D1 transaction. Re-check trip/version inside the
  // INSERT so a second browser tab cannot change the trip between our read
  // and the booking handoff. Retries reuse the caller's stable UUID.
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO booking_leads
       (id,session_id,contact,contact_channel,language,note,trip_context_json,status)
       SELECT ?,?,?,?,?,?,?,'NEW' FROM trip_sessions_v2
       WHERE session_id=? AND trip_id=? AND version=?
         AND NOT EXISTS (SELECT 1 FROM trip_deleted_sessions_v2 WHERE session_id=?)
         AND NOT EXISTS (SELECT 1 FROM booking_lead_erasure_audit WHERE lead_id=?)`,
    ).bind(id, sessionId, contact, channel, context.language, note,
      JSON.stringify(context), sessionId, expectedTripId, expectedVersion, sessionId, id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO booking_lead_consents_v2 (lead_id, consent_version)
       SELECT id,? FROM booking_leads WHERE id=? AND session_id=? AND contact=?
         AND json_extract(trip_context_json,'$.tripVersion')=?`,
    ).bind(BOOKING_CONTACT_CONSENT_VERSION, id, sessionId, contact, expectedVersion),
  ]);
  if (Number(inserted.meta.changes) !== 1) {
    const received = await matchesExisting();
    if (received) return received;
    const erasedAfter = await env.DB.prepare(
      "SELECT 1 FROM booking_lead_erasure_audit WHERE lead_id=?",
    ).bind(id).first();
    return { ok: false, error: erasedAfter ? "lead_erased" : "stale_trip_refresh_required" };
  }
  return { ok: true, id, status: "NEW", alreadyReceived: false };
}

/** Staff-only after identity verification through the existing customer channel.
 * Do not expose this function to an anonymous bearer session.
 */
export async function eraseBookingLead(
  env: Env, leadId: string, reason: "verified_customer_request" | "operational_cleanup",
) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };
  if (!LEAD_ID.test(leadId)) return { ok: false, error: "invalid_lead_id" };
  if (reason !== "verified_customer_request" && reason !== "operational_cleanup") {
    return { ok: false, error: "invalid_reason" };
  }
  const [audit, consent, lead] = await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO booking_lead_erasure_audit (lead_id,reason) SELECT id,? FROM booking_leads WHERE id=?",
    ).bind(reason, leadId),
    env.DB.prepare("DELETE FROM booking_lead_consents_v2 WHERE lead_id=?").bind(leadId),
    env.DB.prepare("DELETE FROM booking_leads WHERE id=?").bind(leadId),
  ]);
  return {
    ok: true, deleted: Number(lead.meta.changes) > 0,
    consentDeleted: Number(consent.meta.changes) > 0,
    auditRecorded: Number(audit.meta.changes) > 0,
  };
}
