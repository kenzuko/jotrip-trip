import { buildParseResponse } from "./scenario";
import { estimateSevenSeatPrice } from "./rules/mobility";
import { chatAnalyticsOverview, isInternalAuthorized, tripV2AnalyticsOverview } from "./internal";
import { quotePublicActivity } from "./publicCatalog";
import { buildTripScenarios } from "./engine/buildTrip";
import { importPrivateHotelRates } from "./privateHotelImport";
import { generatePublicHotelOffer } from "./internalOffer";
import { evaluatePriceWatches } from "./engine/watch";
import { importTravelMatrix } from "./travelMatrixImport";
import { buildDestinationContext } from "./destinationContext";
import { importDestinationVenues } from "./destinationImport";
import { answerAdvisor } from "./advisor";
import { eraseBookingLead, saveBookingLead } from "./bookingLead";
import { deleteTripSession, getTripSession, processTripTurn, purgeExpiredTripSessions } from "./tripTurn";

type Env = {
  DB?: D1Database;
  INTERNAL_API_TOKEN?: string;
  LEAD_ADMIN_TOKEN?: string;
  TRIP_RETENTION_DAYS?: string;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function localizedInterest(value: string, lang: string) {
  const labels: Record<string, Record<string, string>> = {
    en: {
      "Biển": "beach",
      "Chợ đêm": "night market",
      "Cà phê": "coffee",
      "Ăn uống": "food",
      "Hòn Thơm": "Hon Thom",
      "Sunset Town": "Sunset Town",
      "VinWonders": "VinWonders",
      "Safari": "Safari",
    },
    ko: {
      "Biển": "해변",
      "Chợ đêm": "야시장",
      "Cà phê": "카페",
      "Ăn uống": "맛집",
      "Hòn Thơm": "혼똠",
      "Sunset Town": "선셋 타운",
      "VinWonders": "빈원더스",
      "Safari": "사파리",
    },
    ru: {
      "Biển": "пляж",
      "Chợ đêm": "ночной рынок",
      "Cà phê": "кафе",
      "Ăn uống": "еда",
      "Hòn Thơm": "Хон Тхом",
      "Sunset Town": "Sunset Town",
      "VinWonders": "VinWonders",
      "Safari": "сафари",
    },
    zh: {
      "Biển": "海滩",
      "Chợ đêm": "夜市",
      "Cà phê": "咖啡",
      "Ăn uống": "美食",
      "Hòn Thơm": "香岛",
      "Sunset Town": "日落小镇",
      "VinWonders": "VinWonders",
      "Safari": "Safari",
    },
  };
  return labels[lang]?.[value] || value;
}

function assistantTextFor(result: ReturnType<typeof buildParseResponse>) {
  const p = result.parsed;
  const lang = p.language || "vi";
  if (result.conversationAction === "acknowledgement") {
    // Never repeat the previous recommendation or imply the guest supplied new facts.
    return ({
      vi: "Ừ, mình nghe đây. Bạn muốn xem tiếp phần nào của chuyến đi?",
      en: "Got it. Which part of the trip would you like to explore next?",
      ko: "네, 듣고 있어요. 여행의 어느 부분을 더 살펴볼까요?",
      ru: "Понял. Какую часть поездки обсудим дальше?",
      zh: "好的，我在听。接下来想了解行程的哪一部分？",
    } as const)[lang];
  }

  const duration = p.days && p.nights
    ? lang === "en" ? `${p.days} days, ${p.nights} nights`
    : lang === "ko" ? `${p.nights}박 ${p.days}일`
    : lang === "ru" ? `${p.days} дн., ${p.nights} ноч.`
    : lang === "zh" ? `${p.days}天${p.nights}晚`
    : `${p.days} ngày ${p.nights} đêm`
    : "";

  const party = p.adults
    ? lang === "en" ? `${p.adults} adults`
    : lang === "ko" ? `성인 ${p.adults}명`
    : lang === "ru" ? `${p.adults} взрослых`
    : lang === "zh" ? `${p.adults}位成人`
    : `${p.adults} người lớn`
    : "";

  const interestText = p.interests
    .slice(0, 2)
    .map((value) => localizedInterest(value, lang))
    .join(" + ");
  const bits = [duration, party, interestText].filter(Boolean);
  const summary = bits.join(", ");

  if (lang === "en") {
    return summary
      ? `Yep, I’ve got it: ${summary}. I’ll narrow the trip down first instead of throwing a long list at you.`
      : "Ask naturally. I’ll only ask for the bits I still need.";
  }
  if (lang === "ko") {
    return summary
      ? `네, 이렇게 이해했어요: ${summary}. 후보를 길게 나열하지 않고 먼저 동선이 좋은 쪽부터 좁혀볼게요.`
      : "편하게 말해 주세요. 꼭 필요한 정보만 더 물어볼게요.";
  }
  if (lang === "ru") {
    return summary
      ? `Да, понял: ${summary}. Я сначала сузю варианты по логике поездки, а не выдам длинный список.`
      : "Спрашивайте свободно. Я уточню только то, чего действительно не хватает.";
  }
  if (lang === "zh") {
    return summary
      ? `嗯，我明白了：${summary}。我先按行程逻辑帮你缩小范围，不会丢一长串选择给你。`
      : "你直接自然地问就好，我只会追问真正缺的信息。";
  }

  return summary
    ? `Ừ, mình bắt được ý rồi: ${summary}. Mình lọc theo cách đi trước, không quăng một đống lựa chọn cho bạn.`
    : "Bạn cứ nói tự nhiên nha. Chỗ nào thật sự còn thiếu thì mình mới hỏi thêm.";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      let tripStateReady = false;
      if (env.DB) {
        try {
          await env.DB.prepare("SELECT 1 FROM trip_sessions_v2 LIMIT 1").first();
          await env.DB.prepare("SELECT 1 FROM trip_turns_v2 LIMIT 1").first();
          await env.DB.prepare("SELECT 1 FROM trip_deleted_sessions_v2 LIMIT 1").first();
          tripStateReady = true;
        } catch {
          tripStateReady = false;
        }
      }
      let bookingLeadReady = false;
      if (env.DB) {
        try {
          await env.DB.prepare("SELECT 1 FROM booking_leads LIMIT 1").first();
          await env.DB.prepare("SELECT 1 FROM booking_lead_consents_v2 LIMIT 1").first();
          await env.DB.prepare("SELECT 1 FROM booking_lead_erasure_audit LIMIT 1").first();
          bookingLeadReady = true;
        } catch {
          bookingLeadReady = false;
        }
      }
      const ready = tripStateReady && bookingLeadReady;
      return json({
        ok: ready,
        service: "jotrip-trip",
        dbBound: Boolean(env.DB),
        schemaReady: ready,
        tripStateReady,
        chatLoggingReady: tripStateReady,
        bookingLeadReady,
        naturalVoiceReady: false,
        time: new Date().toISOString(),
      }, ready ? 200 : 503);
    }

    if (url.pathname === "/api/trip/session" && request.method === "POST") {
      const body = await request.json<{ sessionId?: string }>().catch(() => ({}));
      return getTripSession(env, body.sessionId || "");
    }

    if (url.pathname === "/api/trip/session" && request.method === "DELETE") {
      const body = await request.json<{ sessionId?: string }>().catch(() => ({}));
      return deleteTripSession(env, body.sessionId || "");
    }

    if (url.pathname === "/api/trip/turn" && request.method === "POST") {
      const body = await request.json<{
        text?: string; sessionId?: string; clientTurnId?: string;
        checkin?: string; checkout?: string;
      }>().catch(() => ({}));
      return processTripTurn(env, body, assistantTextFor);
    }

    if (url.pathname === "/api/internal/booking-lead/erase" && request.method === "POST") {
      // Separate secret from analytics; never permit deletion with an
      // anonymous trip session ID or a read-only analytics token.
      if (!env.LEAD_ADMIN_TOKEN ||
          request.headers.get("authorization") !== `Bearer ${env.LEAD_ADMIN_TOKEN}`) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      const body = await request.json<{
        leadId?: string; reason?: "verified_customer_request" | "operational_cleanup";
      }>().catch(() => ({}));
      if (body.reason !== "verified_customer_request" &&
          body.reason !== "operational_cleanup") {
        return json({ ok: false, error: "invalid_reason" }, 400);
      }
      try {
        const result = await eraseBookingLead(env, body.leadId || "", body.reason);
        return json(result, result.ok ? 200 : result.error === "db_not_bound" ? 503 : 400);
      } catch {
        return json({ ok: false, error: "lead_erasure_unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/booking/lead" && request.method === "POST") {
      const body = await request
        .json<{
          sessionId?: string | null;
          clientLeadId?: string;
          expectedTripId?: string;
          expectedVersion?: number;
          contact?: string;
          contactChannel?: "phone" | "email" | "whatsapp" | "other";
          language?: string;
          note?: string;
          tripContext?: unknown;
          consent?: boolean;
          website?: string;
        }>()
        .catch(() => ({}));

      try {
        const result = await saveBookingLead(env, {
          sessionId: body.sessionId,
          clientLeadId: body.clientLeadId,
          expectedTripId: body.expectedTripId,
          expectedVersion: body.expectedVersion,
          contact: String(body.contact || ""),
          contactChannel: body.contactChannel,
          note: body.note,
          consent: body.consent,
          website: body.website,
          // Client-provided tripContext is intentionally never trusted.
        });
        const status = result.ok ? 200 :
          result.error === "session_deleted" || result.error === "lead_erased" ? 410 :
          result.error === "stale_trip_refresh_required" || result.error === "lead_id_conflict" ? 409 :
          result.error === "trip_session_not_found" ? 404 :
          result.error === "db_not_bound" ? 503 : 400;
        return json(result, status);
      } catch {
        console.error("booking_lead_failed");
        return json({
          ok:false,
          error:"booking_lead_failed",
          // Never expose database errors or customer information to the browser.
        },500);
      }
    }

    if (url.pathname === "/api/advisor/answer" && request.method === "POST") {
      const body = await request
        .json<{
          rawText?: string;
          language?: "vi" | "en" | "ko" | "ru" | "zh";
          mode?: "trip_plan" | "food" | "cafe" | "things_to_do" | "where_to_stay" | "compare" | "contact";
          interests?: string[];
          stayPreferences?: Array<"food" | "cafe" | "evening" | "walkable" | "quiet" | "local" | "family" | "airport">;
          mentionedZone?: string | null;
        }>()
        .catch(() => ({}));

      if (!body.rawText?.trim() || !body.language || !body.mode) {
        return json({ ok: false, error: "advisor_request_incomplete" }, 400);
      }

      try {
        return json(await answerAdvisor(env, {
          rawText: body.rawText,
          language: body.language,
          mode: body.mode,
          interests: body.interests || [],
          stayPreferences: body.stayPreferences || [],
          mentionedZone: body.mentionedZone || null,
        }));
      } catch (error) {
        console.error("advisor_answer_failed", error);
        return json({
          ok: false,
          error: "advisor_answer_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/api/destination/context" && request.method === "POST") {
      const body = await request
        .json<{
          zoneCode?: string;
          latitude?: number;
          longitude?: number;
          intents?: string[];
          daypart?: "morning" | "afternoon" | "evening" | "night";
          limitPerGroup?: number;
        }>()
        .catch(() => ({}));

      try {
        return json(await buildDestinationContext(env, body));
      } catch (error) {
        console.error("destination_context_failed", error);
        return json({
          ok: false,
          error: "destination_context_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/api/trip/build" && request.method === "POST") {
      const body = await request
        .json<{
          checkin?: string;
          checkout?: string;
          adults?: number;
          children?: number;
          interests?: string[];
          stayPreferences?: Array<"food" | "cafe" | "evening" | "walkable" | "quiet" | "local" | "family" | "airport">;
          language?: "vi" | "en" | "ko" | "ru" | "zh";
          days?: number;
          nights?: number;
          budgetVnd?: number;
        }>()
        .catch(() => ({}));

      try {
        return json(await buildTripScenarios(env, body));
      } catch (error) {
        console.error("trip_build_failed", error);
        return json({
          ok: false,
          error: "trip_build_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/api/internal/destination/venues/import" && request.method === "POST") {
      if (!isInternalAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }

      const body = await request
        .json<{ rows?: any[] }>()
        .catch(() => ({}));

      try {
        return json(await importDestinationVenues(env, body.rows || []));
      } catch (error) {
        console.error("destination_venue_import_failed", error);
        return json({
          ok: false,
          error: "destination_venue_import_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/api/internal/travel-matrix/import" && request.method === "POST") {
      if (!isInternalAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }

      const body = await request
        .json<{ rows?: any[] }>()
        .catch(() => ({}));

      try {
        return json(await importTravelMatrix(env, body.rows || []));
      } catch (error) {
        console.error("travel_matrix_import_failed", error);
        return json({
          ok: false,
          error: "travel_matrix_import_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/api/internal/watches/evaluate" && request.method === "POST") {
      if (!isInternalAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }

      const body = await request
        .json<{ watchId?: string }>()
        .catch(() => ({}));

      try {
        return json(await evaluatePriceWatches(env, body));
      } catch (error) {
        console.error("watch_evaluation_failed", error);
        return json({
          ok: false,
          error: "watch_evaluation_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/api/internal/hotel-offers/generate" && request.method === "POST") {
      if (!isInternalAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }

      const body = await request.json().catch(() => null);
      if (!body) return json({ ok: false, error: "invalid_json" }, 400);

      try {
        return json(await generatePublicHotelOffer(env, body as any));
      } catch (error) {
        console.error("offer_generation_failed", error);
        return json({
          ok: false,
          error: "offer_generation_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/api/internal/hotel-rates/import" && request.method === "POST") {
      if (!isInternalAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }

      const body = await request.json().catch(() => null);
      if (!body) return json({ ok: false, error: "invalid_json" }, 400);

      try {
        return json(await importPrivateHotelRates(env, body as any));
      } catch (error) {
        console.error("hotel_import_failed", error);
        return json({
          ok: false,
          error: "hotel_import_failed",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
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

    if (url.pathname === "/api/internal/analytics/trip-v2" && request.method === "GET") {
      if (!isInternalAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
      return json(await tripV2AnalyticsOverview(env));
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
  async scheduled(_controller: ScheduledController, env: Env) {
    const days = Number(env.TRIP_RETENTION_DAYS || "90");
    const result = await purgeExpiredTripSessions(env, Number.isFinite(days) ? days : 90);
    if (!result.ok) console.error("trip_retention_purge_failed", result.error);
  },
} satisfies ExportedHandler<Env>;
