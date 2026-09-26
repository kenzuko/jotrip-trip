import { buildParseResponse } from "./scenario";
import { resolveTripTurn, type TripContext } from "./tripState";
import { buildTripScenarios } from "./engine/buildTrip";
import { answerAdvisor } from "./advisor";

type Env = { DB?: D1Database };
type RequestBody = { sessionId?: string; clientTurnId?: string; text?: string };
type SessionRow = { state_json: string; trip_id: string; version: number };
type StoredTurn = { input_text: string; response_json: string };

const MAX_TEXT = 2000;
const VALID_ID = /^[a-zA-Z0-9_-]{8,100}$/;

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
  if (!env.DB) return resultError("trip_state_unavailable", 503);
  const db = env.DB;

  try {
    const duplicate = await db.prepare(
      "SELECT input_text, response_json FROM trip_turns_v2 WHERE session_id=? AND client_turn_id=?",
    ).bind(sessionId, turnId).first<StoredTurn>();
    if (duplicate) {
      if (duplicate.input_text !== text) return resultError("turn_id_reused_with_different_text", 409);
      return Response.json(JSON.parse(duplicate.response_json), { headers: { "cache-control": "no-store" } });
    }

    const row = await db.prepare(
      "SELECT state_json, trip_id, version FROM trip_sessions_v2 WHERE session_id=?",
    ).bind(sessionId).first<SessionRow>();
    let previous: TripContext | null = null;
    if (row) previous = JSON.parse(row.state_json) as TripContext;

    const turn = resolveTripTurn(previous, text);
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
        });
        if (!plan.ok) return resultError("trip_build_failed", 503);
        assistantText = replyForPlanning(turn.parsed, plan, assistantText);
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
      action: turn.action,
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
