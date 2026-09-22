import { quotePublicActivity } from "../publicCatalog";
import { estimateSevenSeatPrice } from "../rules/mobility";
import { selectMeaningfulScenarios, type TripScenarioInput } from "./tripScenario";
import { matchPlanningHotels } from "../publicHotels";
import { explainTopScenarios } from "./explain";
import { buildDestinationContext } from "../destinationContext";
import { buildStayContext, type StayPreference } from "./stayContext";

type Env = {
  DB?: D1Database;
};

type BuildTripRequest = {
  checkin?: string;
  checkout?: string;
  adults?: number;
  children?: number;
  interests?: string[];
  stayPreferences?: StayPreference[];
  budgetVnd?: number;
};

const PRODUCT_BY_INTEREST: Record<string, { product: string; adult: string; child: string }> = {
  VinWonders: {
    product: "vinwonders-phu-quoc-standard",
    adult: "adult",
    child: "child",
  },
  Safari: {
    product: "vinpearl-safari-standard",
    adult: "adult",
    child: "child",
  },
  "Hòn Thơm": {
    product: "sunworld-hon-thom-cablecar-2way",
    adult: "adult",
    child: "child",
  },
};

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nightsBetween(checkin?: string, checkout?: string) {
  if (!checkin || !checkout) return null;
  const start = new Date(`${checkin}T00:00:00Z`).getTime();
  const end = new Date(`${checkout}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 86_400_000);
}

function activityCost(
  interests: string[],
  adults: number,
  children: number,
  date: string,
) {
  let total = 0;
  const lines: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];

  for (const interest of interests) {
    const mapping = PRODUCT_BY_INTEREST[interest];
    if (!mapping) continue;

    const adultQuote = adults
      ? quotePublicActivity(mapping.product, mapping.adult, date)
      : null;
    const childQuote = children
      ? quotePublicActivity(mapping.product, mapping.child, date)
      : null;

    let lineTotal = 0;

    if (adults && adultQuote?.ok) {
      lineTotal += Number(adultQuote.priceVnd) * adults;
    } else if (adults) {
      warnings.push(`${interest}: chưa có giá người lớn phù hợp ngày ${date}`);
    }

    if (children && childQuote?.ok) {
      lineTotal += Number(childQuote.priceVnd) * children;
    } else if (children) {
      warnings.push(`${interest}: chưa có giá trẻ em phù hợp ngày ${date}`);
    }

    total += lineTotal;
    lines.push({ interest, totalVnd: lineTotal, adultQuote, childQuote });
  }

  return { total, lines, warnings };
}

export async function buildTripScenarios(env: Env, request: BuildTripRequest) {
  const adults = Math.max(1, Math.floor(request.adults || 2));
  const children = Math.max(0, Math.floor(request.children || 0));
  const interests = request.interests || [];
  const stayPreferences = request.stayPreferences || [];
  const referenceDate = request.checkin || todayInVietnam();
  const nights = nightsBetween(request.checkin, request.checkout);
  const activities = activityCost(interests, adults, children, referenceDate);
  const planningBase = matchPlanningHotels(interests, 12);
  const planningEnriched = await Promise.all(
    planningBase.map(async (item) => ({
      ...item,
      stayContext: await buildStayContext(env, item.hotel.area_code, stayPreferences),
    })),
  );

  const hasGeoAnchor = interests.some((x) =>
    ["VinWonders","Safari","Hòn Thơm","Sunset Town","Chợ đêm"].includes(x),
  );

  const planningHotels = planningEnriched
    .sort((a, b) => {
      const spatialWeight = (value: typeof a.spatialFit) =>
        value === "direct" ? 100 : value === "balanced" ? 50 : 0;

      if (hasGeoAnchor) {
        const spatialDelta = spatialWeight(b.spatialFit) - spatialWeight(a.spatialFit);
        if (spatialDelta !== 0) return spatialDelta;
      }

      const contextDelta = b.stayContext.fitScore - a.stayContext.fitScore;
      if (contextDelta !== 0) return contextDelta;

      return a.hotel.canonical_name.localeCompare(b.hotel.canonical_name);
    })
    .slice(0, 4);
  const contextIntents = [
    interests.includes("Ăn uống") || stayPreferences.includes("food") ? "eat" : null,
    interests.includes("Cà phê") || stayPreferences.includes("cafe") ? "cafe" : null,
    interests.some((x) => ["VinWonders","Safari","Hòn Thơm","Sunset Town","Biển","Chợ đêm"].includes(x)) ? "do" : null,
  ].filter(Boolean) as string[];
  const destinationContext = await buildDestinationContext(env, {
    zoneCode: planningHotels[0]?.hotel.area_code,
    intents: contextIntents,
    limitPerGroup: 4,
  });

  if (!env.DB || !request.checkin || !request.checkout || !nights) {
    return {
      ok: true,
      mode: "planning",
      referenceDate,
      assumptions: [
        !request.checkin || !request.checkout
          ? "Chưa có ngày ở chính xác nên JoTrip chưa dùng hotel public offer."
          : "",
      ].filter(Boolean),
      activityCostVnd: activities.total,
      activityLines: activities.lines,
      warnings: activities.warnings,
      planningHotels,
      stayPreferences,
      destinationContext,
      scenarios: [],
      nextNeeded: [
        !request.checkin || !request.checkout ? "travel_dates" : null,
      ].filter(Boolean),
    };
  }

  const offers = await env.DB.prepare(
    `SELECT
       o.id AS offer_id,
       o.hotel_id,
       h.canonical_name,
       h.area_code,
       h.fit_tags_json,
       o.sell_price_vnd,
       o.availability_state,
       o.price_state,
       o.checked_at
     FROM hotel_public_offers o
     JOIN hotels_public h ON h.id = o.hotel_id
     WHERE o.checkin_date = ?
       AND o.checkout_date = ?
       AND o.total_nights = ?
     ORDER BY o.sell_price_vnd ASC
     LIMIT 100`,
  ).bind(request.checkin, request.checkout, nights).all();

  const candidates: TripScenarioInput[] = [];

  for (const offer of offers.results || []) {
    const hotelId = String(offer.hotel_id);
    const routeRows = await env.DB.prepare(
      `SELECT to_ref, distance_km, normal_minutes
       FROM travel_matrix
       WHERE from_ref = ?
         AND to_ref IN ('activity:vinwonders', 'activity:safari', 'activity:hon-thom', 'airport:pq')`,
    ).bind(`hotel:${hotelId}`).all();

    const routes = new Map(
      (routeRows.results || []).map((row) => [String(row.to_ref), row]),
    );

    const routeKeys = interests
      .map((interest) => {
        if (interest === "VinWonders") return "activity:vinwonders";
        if (interest === "Safari") return "activity:safari";
        if (interest === "Hòn Thơm") return "activity:hon-thom";
        return null;
      })
      .filter(Boolean) as string[];

    let distanceKm = 0;
    let driveMinutes = 0;
    let missingRoutes = 0;

    for (const key of routeKeys) {
      const row = routes.get(key);
      if (!row) {
        missingRoutes += 1;
        continue;
      }
      distanceKm += Number(row.distance_km || 0) * 2;
      driveMinutes += Number(row.normal_minutes || 0) * 2;
    }

    const airport = routes.get("airport:pq");
    if (airport) {
      distanceKm += Number(airport.distance_km || 0) * 2;
      driveMinutes += Number(airport.normal_minutes || 0) * 2;
    } else {
      missingRoutes += 1;
    }

    // Never turn missing route data into a fake 0-minute / 0-VND advantage.
    // Until all required legs are known, this hotel stays in planning only.
    if (missingRoutes > 0) {
      continue;
    }

    const mobilityCostVnd = estimateSevenSeatPrice(distanceKm);

    let fitTags: string[] = [];
    try {
      fitTags = JSON.parse(String(offer.fit_tags_json || "[]"));
    } catch {}

    let activityFit = 60;
    if (interests.includes("VinWonders") && fitTags.includes("north")) activityFit += 20;
    if (interests.includes("Safari") && fitTags.includes("north")) activityFit += 15;
    if (interests.includes("Hòn Thơm") && fitTags.includes("south")) activityFit += 20;
    activityFit = Math.min(100, activityFit);

    const stayContext = await buildStayContext(
      env,
      String(offer.area_code || "long_beach"),
      stayPreferences,
    );

    const preferenceWeight = stayPreferences.length ? (hasGeoAnchor ? 0.35 : 0.6) : 0.2;
    const stayFit = Math.round(
      activityFit * (1 - preferenceWeight) + stayContext.fitScore * preferenceWeight,
    );

    const confidence = Math.round(100 * 0.7 + stayContext.confidence * 0.3);

    candidates.push({
      id: String(offer.offer_id),
      hotelRef: hotelId,
      hotelName: String(offer.canonical_name),
      hotelCostVnd: Number(offer.sell_price_vnd),
      mobilityCostVnd,
      activityCostVnd: activities.total,
      driveMinutes,
      stayFit,
      confidence,
      stayContext,
      guestReasons: [
        distanceKm > 0 ? `Ước tính khoảng ${Math.round(distanceKm)} km di chuyển cho các chặng đã biết.` : "",
        ...stayContext.reasons,
      ].filter(Boolean),
      cautions: [
        ...stayContext.cautions,
        String(offer.availability_state) === "on_request" ? "Phòng cần JoTrip xác nhận lại." : "",
      ].filter(Boolean),
    });
  }

  const scenarios = selectMeaningfulScenarios(candidates, {
    minimumStayFit: 50,
    minimumConfidence: 50,
    maxResults: 4,
  });

  const insights = explainTopScenarios(scenarios);

  return {
    ok: true,
    mode: "priced",
    planningHotels,
    stayPreferences,
    destinationContext,
    insights,
    referenceDate,
    checkin: request.checkin,
    checkout: request.checkout,
    adults,
    children,
    activityCostVnd: activities.total,
    activityLines: activities.lines,
    warnings: activities.warnings,
    hotelOfferCount: offers.results?.length || 0,
    scenarioReadyCount: scenarios.length,
    scenarioDataIncompleteCount: Math.max(0, (offers.results?.length || 0) - candidates.length),
    scenarios,
  };
}
