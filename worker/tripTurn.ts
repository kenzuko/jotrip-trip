import { buildParseResponse } from "./scenario";
import { resolveTripTurn, type TripContext } from "./tripState";
import { buildTripScenarios } from "./engine/buildTrip";
import { answerAdvisor } from "./advisor";

type Env = { DB?: D1Database };
type RequestBody = { sessionId?: string; clientTurnId?: string; text?: string; checkin?: string; checkout?: string };
type SessionRow = { state_json: string; trip_id: string; version: number };
type StoredTurn = { input_text: string; response_json: string };

const MAX_TEXT = 2000;
const VALID_ID = /^[a-zA-Z0-9_-]{8,100}$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): number | null {
  if (!DATE_ISO.test(value)) return null;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
function validatedDates(checkin?: string, checkout?: string) {
  if (!checkin && !checkout) return null;
  if (!checkin || !checkout) return false;
  const start = validDate(checkin), end = validDate(checkout);
  if (start === null || end === null) return false;
  const nights = Math.round((end - start) / 86_400_000);
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (checkin < today || nights < 1 || nights > 30) return false;
  return { checkin, checkout, nights };
}


function resultError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
}

function replyForPlanning(
  parsed: TripContext,
  plan: Awaited<ReturnType<typeof buildTripScenarios>>,
  fallback: string,
): string {
  const top = plan.planningHotels?.[0];
  if (!top) return fallback;
  const areas: Record<string, Record<string, string>> = {
    north: { vi: "Bắc đảo", en: "the north", ko: "북부", ru: "север острова", zh: "北岛" },
    south: { vi: "Nam đảo", en: "the south", ko: "남부", ru: "юг острова", zh: "南岛" },
    duong_dong: { vi: "Dương Đông", en: "Duong Dong", ko: "즈엉동", ru: "Зыонгдонг", zh: "阳东" },
    long_beach: { vi: "Bãi Trường", en: "Long Beach", ko: "롱비치", ru: "Лонг-Бич", zh: "长滩" },
  };
  const area = areas[top.hotel.area_code]?.[parsed.language] || top.hotel.area_code;
  if (parsed.language === "en") return `Let's compare ${area} with another area for this trip, including travel and evening tradeoffs, before looking at room prices.`;
  if (parsed.language === "ko") return `이번 여행에서는 ${area}와 다른 지역의 이동과 저녁 동선을 비교해볼게요. 객실 가격은 그다음에 볼게요.`;
  if (parsed.language === "ru") return `Сравним ${area} с другим районом по дороге и вечерним планам, прежде чем смотреть цены на номера.`;
  if (parsed.language === "zh") return `先比较${area}与另一个区域的交通和晚间安排，再看房价。`;
  return `Mình đặt ${area} cạnh một hướng khác để bạn nhìn rõ phần thuận tiện và phần phải đánh đổi trước khi bàn tới giá phòng nha.`;
}

export async function processTripTurn(
  env: Env,
  body: RequestBody,
  baseReply: (parsedResponse: ReturnType<typeof buildParseResponse>) => string,
): Promise<Response> {
  const text = body.text?.trim() || "";
  const sessionId = body.sessionId || "";
  const turnId = body.clientTurnId || "";
  if (!text || text.length > MAX_TEXT) return resultError("invalid_text", 400);
  if (!VALID_ID.test(sessionId) || !VALID_ID.test(turnId)) return resultError("invalid_turn_identity", 400);
  const dates = validatedDates(body.checkin, body.checkout);
  if (dates === false) return resultError("invalid_travel_dates", 400);

  if (!env.DB) return resultError("trip_state_unavailable", 503);
  const db = env.DB;

  try {
    const tombstone = await db.prepare(
      "SELECT 1 AS blocked FROM trip_deleted_sessions_v2 WHERE session_id=?",
    ).bind(sessionId).first();
    if (tombstone) return resultError("session_deleted", 410);
    const duplicate = await db.prepare(
      "SELECT input_text, response_json FROM trip_turns_v2 WHERE session_id=? AND client_turn_id=?",
    ).bind(sessionId, turnId).first<StoredTurn>();
    if (duplicate) {
      if (duplicate.input_text !== text) return resultError("turn_id_reused_with_different_text", 409);
      const original = JSON.parse(duplicate.response_json) as {
        action?: string; parsed?: { checkin?: string; checkout?: string };
      };
      if (Boolean(dates) !== (original.action === "set_dates") ||
          (dates && (original.parsed?.checkin !== dates.checkin ||
                     original.parsed?.checkout !== dates.checkout))) {
        return resultError("turn_id_reused_with_different_dates", 409);
      }
      return Response.json(JSON.parse(duplicate.response_json), { headers: { "cache-control": "no-store" } });
    }

    const row = await db.prepare(
      "SELECT state_json, trip_id, version FROM trip_sessions_v2 WHERE session_id=?",
    ).bind(sessionId).first<SessionRow>();
    let previous: TripContext | null = null;
    if (row) previous = JSON.parse(row.state_json) as TripContext;

    const turn = resolveTripTurn(previous, text);
    if (dates) {
      // Date selection is a structured action, not an inference from free text.
      turn.parsed = {
        ...turn.parsed, checkin: dates.checkin, checkout: dates.checkout,
        nights: dates.nights, days: dates.nights + 1, mode: "trip_plan",
        language: previous?.language || turn.parsed.language,
      };
      turn.nextNeeded = turn.nextNeeded.filter(item => item !== "travel_dates" && item !== "duration");
    }
    const tripId = turn.action === "new_trip" || !row ? crypto.randomUUID() : row.trip_id;
    const base = buildParseResponse(text);
    const parsedResponse = {
      ...base,
      parsed: turn.parsed,
      nextNeeded: turn.nextNeeded,
      assumptions: turn.assumptions,
      conversationAction: turn.action === "acknowledgement" ? "acknowledgement" as const : "request" as const,
    };

    let plan: Awaited<ReturnType<typeof buildTripScenarios>> | null = null;
    let advisor: Awaited<ReturnType<typeof answerAdvisor>> | null = null;
    let assistantText = baseReply(parsedResponse);

    if (turn.action !== "acknowledgement") {
      if (turn.parsed.mode === "trip_plan") {
        plan = await buildTripScenarios(env, {
          adults: turn.parsed.adults, children: turn.parsed.children,
          interests: turn.parsed.interests,
          stayPreferences: turn.parsed.stayPreferences as Parameters<typeof buildTripScenarios>[1]["stayPreferences"],
          language: turn.parsed.language, days: turn.parsed.days,
          nights: turn.parsed.nights, budgetVnd: turn.parsed.budgetVnd,
          checkin: turn.parsed.checkin, checkout: turn.parsed.checkout,
        });
        if (!plan.ok) return resultError("trip_build_failed", 503);
        assistantText = replyForPlanning(turn.parsed, plan, assistantText);
        if (dates) {
          const window = dates.checkin + " - " + dates.checkout;
          assistantText = plan.mode === "priced" && plan.scenarios?.length
            ? (turn.parsed.language === "vi"
              ? "Mình đã lưu ngày " + window + " và tính các phương án có dữ liệu giá xác minh. Mình xem phần đi lại cùng bạn trước khi chốt nha."
              : "I've saved " + window + " and calculated options with available verified rates. Let's review the travel tradeoffs before booking.")
            : (turn.parsed.language === "vi"
              ? "Mình đã lưu ngày " + window + ". Chưa có đủ giá phòng xác minh cho khoảng này, nên mình chỉ so khu ở và đường đi, chưa báo tổng tiền nha."
              : "I've saved " + window + ". Verified room rates are not complete for these dates, so I can compare areas and routes but not quote a total yet.");
        }
      } else {
        advisor = await answerAdvisor(env, {
          rawText: text, language: turn.parsed.language, mode: turn.parsed.mode,
          interests: turn.parsed.interests,
          stayPreferences: turn.parsed.stayPreferences as Parameters<typeof answerAdvisor>[1]["stayPreferences"],
          mentionedZone: turn.parsed.mentionedZone || null,
        });
        if (!advisor.ok) return resultError("advisor_failed", 503);
        assistantText = advisor.answerText || assistantText;
      }
    }

    const version = (row?.version || 0) + 1;
    const response = {
      ...parsedResponse,
      ok: true,
      assistantText,
      aiSignals: [],
      action: dates ? "set_dates" as const : turn.action,
      tripId,
      clientTurnId: turnId,
      version,
      plan,
      advisor,
    };
    const now = new Date().toISOString();
    const state = JSON.stringify(turn.parsed);
    const payload = JSON.stringify(response);

    const changeState = row
      ? db.prepare(
        "UPDATE trip_sessions_v2 SET trip_id=?, state_json=?, version=?, last_turn_id=?, updated_at=? WHERE session_id=? AND version=?",
      ).bind(tripId, state, version, turnId, now, sessionId, row.version)
      : db.prepare(
        "INSERT OR IGNORE INTO trip_sessions_v2 (session_id, trip_id, state_json, version, last_turn_id, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      ).bind(sessionId, tripId, state, turnId, now);

    // D1 batch executes as a transaction. The turn row can only be inserted if
    // this request won the session version update; concurrent turns get 409.
    const [changed, inserted] = await db.batch([
      changeState,
      db.prepare(
        `INSERT OR IGNORE INTO trip_turns_v2
          (session_id, client_turn_id, trip_id, input_text, response_json, created_at)
          SELECT ?, ?, ?, ?, ?, ? FROM trip_sessions_v2
          WHERE session_id=? AND version=? AND last_turn_id=?`,
      ).bind(sessionId, turnId, tripId, text, payload, now, sessionId, version, turnId),
    ]);

    if (changed.meta.changes !== 1 || inserted.meta.changes !== 1) {
      const existing = await db.prepare(
        "SELECT input_text, response_json FROM trip_turns_v2 WHERE session_id=? AND client_turn_id=?",
      ).bind(sessionId, turnId).first<StoredTurn>();
      if (existing && existing.input_text === text) {
        return Response.json(JSON.parse(existing.response_json), { headers: { "cache-control": "no-store" } });
      }
      return resultError("concurrent_turn_retry", 409);
    }

    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("trip_turn_failed", error);
    return resultError("trip_turn_unavailable", 503);
  }
}

export async function getTripSession(env: Env, sessionId: string): Promise<Response> {
  if (!VALID_ID.test(sessionId)) return resultError("invalid_session_id", 400);
  if (!env.DB) return resultError("trip_state_unavailable", 503);
  try {
    const tombstone = await env.DB.prepare(
      "SELECT 1 AS blocked FROM trip_deleted_sessions_v2 WHERE session_id=?",
    ).bind(sessionId).first();
    if (tombstone) return resultError("session_deleted", 410);
    const row = await env.DB.prepare(
      "SELECT state_json, trip_id, version FROM trip_sessions_v2 WHERE session_id=?",
    ).bind(sessionId).first<SessionRow>();
    if (!row) return resultError("trip_session_not_found", 404);
    const latest = await env.DB.prepare(
      `SELECT client_turn_id, input_text, response_json FROM trip_turns_v2
       WHERE session_id=? AND trip_id=?
       ORDER BY CAST(json_extract(response_json, '$.version') AS INTEGER) DESC LIMIT 6`,
    ).bind(sessionId, row.trip_id).all<{ client_turn_id: string; input_text: string; response_json: string }>();
    const recent = (latest.results || []).reverse();
    const history = recent.flatMap(item => {
      const reply = JSON.parse(item.response_json) as { assistantText?: string; parsed?: { language?: string } };
      return [
        { id: item.client_turn_id, role: "user" as const, text: item.input_text },
        { id: item.client_turn_id + ":assistant", role: "assistant" as const,
          text: reply.assistantText || "", language: reply.parsed?.language || "vi" },
      ];
    });
    // The last substantive action determines the visible canvas. Do not
    // resurrect a priced plan after a food question simply because an older
    // turn had a non-null plan. Compare/contact deliberately retain the prior.
    const latestSubstantive = await env.DB.prepare(
      `SELECT response_json FROM trip_turns_v2
       WHERE session_id=? AND trip_id=?
         AND json_extract(response_json, '$.action') != 'acknowledgement'
       ORDER BY CAST(json_extract(response_json, '$.version') AS INTEGER) DESC LIMIT 1`,
    ).bind(sessionId, row.trip_id).first<{ response_json: string }>();
    const last = latestSubstantive
      ? JSON.parse(latestSubstantive.response_json) as {
          plan?: unknown; advisor?: unknown; parsed?: { mode?: string };
        }
      : null;
    const retainsPrevious = last?.parsed?.mode === "compare" || last?.parsed?.mode === "contact";
    let plan: unknown = last?.plan || null;
    let advisor: unknown = last?.advisor || null;
    if (retainsPrevious) {
      const planRow = await env.DB.prepare(
        `SELECT response_json FROM trip_turns_v2
         WHERE session_id=? AND trip_id=? AND json_extract(response_json, '$.plan') IS NOT NULL
         ORDER BY CAST(json_extract(response_json, '$.version') AS INTEGER) DESC LIMIT 1`,
      ).bind(sessionId, row.trip_id).first<{ response_json: string }>();
      const advisorRow = await env.DB.prepare(
        `SELECT response_json FROM trip_turns_v2
         WHERE session_id=? AND trip_id=? AND json_extract(response_json, '$.advisor') IS NOT NULL
         ORDER BY CAST(json_extract(response_json, '$.version') AS INTEGER) DESC LIMIT 1`,
      ).bind(sessionId, row.trip_id).first<{ response_json: string }>();
      plan ||= planRow ? (JSON.parse(planRow.response_json) as { plan: unknown }).plan : null;
      advisor ||= advisorRow ? (JSON.parse(advisorRow.response_json) as { advisor: unknown }).advisor : null;
    }
    return Response.json({
      ok: true, tripId: row.trip_id, version: row.version,
      parsed: JSON.parse(row.state_json), plan, advisor, history,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("trip_session_restore_failed", error);
    return resultError("trip_session_unavailable", 503);
  }
}

/** Deletion covers V2 chat/session only. A separately consented booking lead
 * remains subject to its own operational retention and deletion process.
 */
export async function deleteTripSession(env: Env, sessionId: string): Promise<Response> {
  if (!VALID_ID.test(sessionId)) return resultError("invalid_session_id", 400);
  if (!env.DB) return resultError("trip_state_unavailable", 503);
  try {
    const now = new Date().toISOString();
    const [marked, turns, session] = await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO trip_deleted_sessions_v2 (session_id, deleted_at) SELECT session_id, ? FROM trip_sessions_v2 WHERE session_id=?",
      ).bind(now, sessionId),
      env.DB.prepare("DELETE FROM trip_turns_v2 WHERE session_id=?").bind(sessionId),
      env.DB.prepare("DELETE FROM trip_sessions_v2 WHERE session_id=?").bind(sessionId),
    ]);
    return Response.json({
      ok: true, deleted: session.meta.changes > 0,
      tombstoneCreated: marked.meta.changes > 0,
      turnsDeleted: turns.meta.changes,
      bookingLeadsAffected: false,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("trip_session_delete_failed", error);
    return resultError("trip_session_delete_unavailable", 503);
  }
}

/** Invoked only by the Worker daily cron; retention is based on last activity. */
export async function purgeExpiredTripSessions(env: Env, days = 90) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };
  const retention = Math.max(7, Math.min(365, Math.floor(days)));
  const cutoff = new Date(Date.now() - retention * 86_400_000).toISOString();
  try {
    const [turns, sessions, tombstones] = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM trip_turns_v2 WHERE session_id IN (SELECT session_id FROM trip_sessions_v2 WHERE updated_at < ?)",
      ).bind(cutoff),
      env.DB.prepare("DELETE FROM trip_sessions_v2 WHERE updated_at < ?").bind(cutoff),
      env.DB.prepare("DELETE FROM trip_deleted_sessions_v2 WHERE deleted_at < ?").bind(cutoff),
    ]);
    return {
      ok: true, sessionsDeleted: sessions.meta.changes,
      turnsDeleted: turns.meta.changes, tombstonesDeleted: tombstones.meta.changes,
    };
  } catch (error) {
    console.error("trip_session_purge_failed", error);
    return { ok: false, error: "trip_session_purge_unavailable" };
  }
}
