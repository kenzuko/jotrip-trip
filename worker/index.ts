import { buildParseResponse } from "./scenario";
import { estimateSevenSeatPrice } from "./rules/mobility";
import { chatAnalyticsOverview, isInternalAuthorized } from "./internal";
import { quotePublicActivity } from "./publicCatalog";

type Env = {
  DB?: D1Database;
  INTERNAL_API_TOKEN?: string;
};

type ParsedShape = ReturnType<typeof buildParseResponse>["parsed"];

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function logConversationTurn(
  env: Env,
  sessionId: string | undefined,
  userText: string,
  parsed: ParsedShape,
  assistantText: string,
) {
  if (!env.DB || !sessionId) return;

  const now = new Date().toISOString();
  const userMessageId = crypto.randomUUID();

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
    ).bind(
      userMessageId,
      sessionId,
      userText,
      JSON.stringify(parsed),
      now,
    ),
    env.DB.prepare(
      `INSERT INTO chat_messages
        (id, session_id, role, content, created_at)
       VALUES (?, ?, 'assistant', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      sessionId,
      assistantText,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO trip_intent_events
        (id, session_id, message_id, days, nights, adults, children, budget_vnd, interests_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      sessionId,
      userMessageId,
      parsed.days ?? null,
      parsed.nights ?? null,
      parsed.adults ?? null,
      parsed.children ?? null,
      parsed.budgetVnd ?? null,
      JSON.stringify(parsed.interests || []),
      now,
    ),
  ]);
}

function assistantTextFor(result: ReturnType<typeof buildParseResponse>) {
  const p = result.parsed;
  const bits = [
    p.days && p.nights ? `${p.days} ngày ${p.nights} đêm` : "",
    p.adults ? `${p.adults} người lớn` : "",
    p.children ? `${p.children} trẻ em` : "",
    p.interests.length ? p.interests.join(" và ") : "",
  ].filter(Boolean);

  if (bits.length) {
    return `Mình hiểu rồi: ${bits.join(", ")}. Mình sẽ dùng dữ liệu thật để dựng phương án.`;
  }

  return "Mình hiểu rồi. Mình sẽ dùng dữ liệu thật để dựng phương án chuyến đi.";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      let schemaReady = false;
      if (env.DB) {
        try {
          await env.DB.prepare("SELECT 1 FROM chat_sessions LIMIT 1").first();
          schemaReady = true;
        } catch {
          schemaReady = false;
        }
      }

      return json({
        ok: true,
        service: "jotrip-trip",
        dbBound: Boolean(env.DB),
        schemaReady,
        chatLoggingReady: Boolean(env.DB) && schemaReady,
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
      const assistantText = assistantTextFor(result);

      try {
        await logConversationTurn(
          env,
          body.sessionId,
          body.text,
          result.parsed,
          assistantText,
        );
      } catch (error) {
        console.error("chat_log_failed", error);
      }

      return json({ ...result, assistantText });
    }

    if (url.pathname === "/api/activity/quote" && request.method === "GET") {
      const product = url.searchParams.get("product");
      const audience = url.searchParams.get("audience");
      const date = url.searchParams.get("date");

      if (!product || !audience || !date) {
        return json({ ok: false, error: "product_audience_date_required" }, 400);
      }

      return json(quotePublicActivity(product, audience, date));
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

    if (
      url.pathname === "/api/internal/analytics/chat-overview" &&
      request.method === "GET"
    ) {
      if (!isInternalAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      return json(await chatAnalyticsOverview(env));
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
