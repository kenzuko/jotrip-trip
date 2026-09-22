import { decidePublicHotelPrice, type PublicDisplayPolicy } from "./engine/publicOffer";

type Env = { DB?: D1Database };

export type GenerateOfferPayload = {
  privateRateId: string;
  checkin: string;
  checkout: string;
  totalNights: number;
  benchmarkPriceVnd: number;
  occupancyKey?: string;
  mealPlan?: string;
  availabilityState?: string;
  minimumMarginVnd?: number;
  minimumMarginPct?: number;
  targetAdvantagePct?: number;
  targetAdvantageVnd?: number;
  expiresAt?: string | null;
};

export async function generatePublicHotelOffer(
  env: Env,
  payload: GenerateOfferPayload,
) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };
  if (!payload.privateRateId || !payload.checkin || !payload.checkout) {
    return { ok: false, error: "private_rate_dates_required" };
  }

  const rate = await env.DB.prepare(
    `SELECT
       id, hotel_id, room_key, meal_plan, occupancy_key,
       effective_net_vnd, rule_state, public_display_policy,
       minimum_margin_vnd, minimum_margin_pct, stop_sell
     FROM hotel_private_rates
     WHERE id = ?
     LIMIT 1`,
  ).bind(payload.privateRateId).first<Record<string, unknown>>();

  if (!rate) return { ok: false, error: "private_rate_not_found" };
  if (String(rate.rule_state) !== "ACCEPTED") {
    return { ok: false, error: "private_rate_not_accepted" };
  }
  if (Number(rate.stop_sell || 0) === 1) {
    return { ok: false, error: "stop_sell" };
  }

  const effectivePrivateNetVnd = Number(rate.effective_net_vnd || 0);
  const publicDisplayPolicy = String(
    rate.public_display_policy || "QUERY_ONLY",
  ) as PublicDisplayPolicy;

  const decision = decidePublicHotelPrice({
    effectivePrivateNetVnd,
    benchmarkPriceVnd: payload.benchmarkPriceVnd,
    publicDisplayPolicy,
    minimumMarginVnd:
      payload.minimumMarginVnd ??
      (rate.minimum_margin_vnd == null ? undefined : Number(rate.minimum_margin_vnd)),
    minimumMarginPct:
      payload.minimumMarginPct ??
      (rate.minimum_margin_pct == null ? undefined : Number(rate.minimum_margin_pct)),
    targetAdvantagePct: payload.targetAdvantagePct,
    targetAdvantageVnd: payload.targetAdvantageVnd,
  });

  await env.DB.prepare(
    `INSERT INTO market_snapshots
      (id, subject_ref, stay_date, source, comparable_key, price_vnd, availability_state, observed_at, raw_meta_json)
     VALUES (?, ?, ?, 'internal_comparable_input', ?, ?, NULL, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    `hotel:${String(rate.hotel_id)}`,
    payload.checkin,
    `room:${String(rate.room_key)}|occ:${payload.occupancyKey || String(rate.occupancy_key || "")}|meal:${payload.mealPlan || String(rate.meal_plan || "")}`,
    Math.round(payload.benchmarkPriceVnd),
    new Date().toISOString(),
    JSON.stringify({
      sourceType: "comparable_market_benchmark",
      publicDisplayPolicy,
    }),
  ).run();

  if (!decision.ok) {
    return {
      ok: false,
      error: "no_public_offer",
      reason: decision.reason,
      publicDisplayPolicy: decision.publicDisplayPolicy,
    };
  }

  const offerId = crypto.randomUUID();
  const checkedAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO hotel_public_offers
      (id, hotel_id, room_key, checkin_date, checkout_date, occupancy_key,
       meal_plan, sell_price_vnd, total_nights, availability_state, price_state,
       checked_at, benchmark_price_vnd, saving_vnd, pricing_reason, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'checked', ?, ?, ?, ?, ?)`,
  ).bind(
    offerId,
    String(rate.hotel_id),
    String(rate.room_key),
    payload.checkin,
    payload.checkout,
    payload.occupancyKey || String(rate.occupancy_key || "") || null,
    payload.mealPlan || String(rate.meal_plan || "") || null,
    decision.sellPriceVnd,
    Math.max(1, Math.floor(payload.totalNights)),
    payload.availabilityState || "on_request",
    checkedAt,
    decision.benchmarkPriceVnd,
    decision.savingVnd,
    decision.reason,
    payload.expiresAt || null,
  ).run();

  // Response intentionally excludes effective/net/margin fields.
  return {
    ok: true,
    offer: {
      id: offerId,
      hotelId: String(rate.hotel_id),
      roomKey: String(rate.room_key),
      checkin: payload.checkin,
      checkout: payload.checkout,
      sellPriceVnd: decision.sellPriceVnd,
      benchmarkPriceVnd: decision.benchmarkPriceVnd,
      savingVnd: decision.savingVnd,
      availabilityState: payload.availabilityState || "on_request",
      publicDisplayPolicy: decision.publicDisplayPolicy,
      checkedAt,
      expiresAt: payload.expiresAt || null,
    },
  };
}
