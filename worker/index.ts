import { buildParseResponse } from "./scenario";
import { estimateSevenSeatPrice } from "./rules/mobility";

type Env = {
  DB?: D1Database;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function logUserMessage(
  env: Env,
  sessionId: string | undefined,
  text: string,
  parsed: unknown,
) {
  if (!env.DB || !sessionId) return;

  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO chat_sessions (id, last_seen_at)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    ).bind(sessionId, now),
    env.DB.prepare(
      `INSERT INTO chat_messages
        (id, session_id, role, content, parsed_intent_json, created_at)
       VALUES (?, ?, 'user', ?, ?, ?)`,
    ).bind(messageId, sessionId, text, JSON.stringify(parsed), now),
  ]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "jotrip-trip",
        dbBound: Boolean(env.DB),
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/trip/parse" && request.method === "POST") {
      const body = await request
        .json<{ text?: string; sessionId?: string }>()
        .catch(() => ({}));

      if (!body.text?.trim()) {
        return json({ ok: false, error: "text_required" }, 400);
      }

      const result = buildParseResponse(body.text);

      try {
        await logUserMessage(env, body.sessionId, body.text, result.parsed);
      } catch (error) {
        console.error("chat_log_failed", error);
      }

      return json(result);
    }

    if (url.pathname === "/api/mobility/estimate" && request.method === "POST") {
      const body = await request
        .json<{ distanceKm?: number }>()
        .catch(() => ({}));

      if (typeof body.distanceKm !== "number") {
        return json({ ok: false, error: "distance_required" }, 400);
      }

      return json({
        ok: true,
        vehicle: "7_SEAT",
        distanceKm: body.distanceKm,
        rateVndPerKm: 15_000,
        estimatedPriceVnd: estimateSevenSeatPrice(body.distanceKm),
        status: "temporary_rule",
      });
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
