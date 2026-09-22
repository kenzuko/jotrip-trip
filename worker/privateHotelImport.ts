import { effectivePrivateNet, isSafeAllMarketRate } from "./rules/hotelPricing";

export type HotelImportEnv = {
  DB?: D1Database;
};

export type HotelImportRow = {
  hotelId: string;
  hotelName?: string;
  hotelSlug?: string;
  roomKey: string;
  marketScope: string;
  stayFrom?: string | null;
  stayTo?: string | null;
  bookingFrom?: string | null;
  bookingTo?: string | null;
  mealPlan?: string | null;
  occupancyKey?: string | null;
  baseNetVnd: number;
  discountType?: "PERCENT" | "FIXED_VND" | null;
  discountValue?: number | null;
  sourceLocator?: string | null;
  sourceVersion?: string | null;
};

export type HotelImportPayload = {
  sourceName: string;
  sourceVersion?: string;
  rows: HotelImportRow[];
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRow(row: HotelImportRow) {
  const reasons: string[] = [];

  if (!row.hotelId || !row.roomKey) reasons.push("missing_hotel_or_room");
  if (!Number.isFinite(row.baseNetVnd) || row.baseNetVnd <= 0) reasons.push("invalid_base_net");
  if (!isSafeAllMarketRate({
    marketScope: row.marketScope,
    baseNetVnd: row.baseNetVnd,
  })) reasons.push("market_not_all_market");

  let effectiveNetVnd: number | null = null;

  if (!reasons.length) {
    try {
      effectiveNetVnd = effectivePrivateNet({
        marketScope: row.marketScope,
        baseNetVnd: row.baseNetVnd,
        discount:
          row.discountType && typeof row.discountValue === "number"
            ? { type: row.discountType, value: row.discountValue }
            : undefined,
      });
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : "effective_net_failed");
    }
  }

  return {
    ...row,
    hotelSlug: row.hotelSlug || slugify(row.hotelName || row.hotelId),
    effectiveNetVnd,
    reviewState: reasons.length ? "REVIEW" : "ACCEPTED",
    reviewReason: reasons.join(",") || null,
  };
}

export async function importPrivateHotelRates(
  env: HotelImportEnv,
  payload: HotelImportPayload,
) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };
  if (!payload.sourceName?.trim()) return { ok: false, error: "source_name_required" };
  if (!Array.isArray(payload.rows) || !payload.rows.length) {
    return { ok: false, error: "rows_required" };
  }
  if (payload.rows.length > 1000) {
    return { ok: false, error: "batch_too_large", maxRows: 1000 };
  }

  const batchId = crypto.randomUUID();
  const normalized = payload.rows.map(normalizeRow);
  const accepted = normalized.filter((row) => row.reviewState === "ACCEPTED");
  const review = normalized.filter((row) => row.reviewState === "REVIEW");

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO hotel_rate_import_batches
        (id, source_name, source_version, row_count, accepted_count, review_count, rejected_count)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    ).bind(
      batchId,
      payload.sourceName,
      payload.sourceVersion || null,
      normalized.length,
      accepted.length,
      review.length,
    ),
  ];

  for (const row of normalized) {
    const importRowId = crypto.randomUUID();

    statements.push(
      env.DB.prepare(
        `INSERT INTO hotel_rate_import_rows
          (id, batch_id, hotel_key, room_key, market_scope, stay_from, stay_to,
           booking_from, booking_to, meal_plan, occupancy_key, base_net_vnd,
           discount_type, discount_value, effective_net_vnd, review_state,
           review_reason, normalized_json, source_locator)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        importRowId,
        batchId,
        row.hotelId,
        row.roomKey,
        row.marketScope,
        row.stayFrom || null,
        row.stayTo || null,
        row.bookingFrom || null,
        row.bookingTo || null,
        row.mealPlan || null,
        row.occupancyKey || null,
        Math.round(row.baseNetVnd),
        row.discountType || null,
        row.discountValue ?? null,
        row.effectiveNetVnd,
        row.reviewState,
        row.reviewReason,
        JSON.stringify(row),
        row.sourceLocator || null,
      ),
    );

    if (row.reviewState === "ACCEPTED" && row.effectiveNetVnd) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO hotels_public
            (id, canonical_name, slug, public_status, updated_at)
           VALUES (?, ?, ?, 'content_only', CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             canonical_name = excluded.canonical_name,
             slug = excluded.slug,
             updated_at = CURRENT_TIMESTAMP`,
        ).bind(
          row.hotelId,
          row.hotelName || row.hotelId,
          row.hotelSlug,
        ),
      );

      statements.push(
        env.DB.prepare(
          `INSERT INTO hotel_private_rates
            (id, hotel_id, room_key, market_scope, stay_from, stay_to,
             booking_from, booking_to, meal_plan, occupancy_key, base_net_vnd,
             discount_type, discount_value, effective_net_vnd, source_ref,
             source_version, rule_state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCEPTED')`,
        ).bind(
          crypto.randomUUID(),
          row.hotelId,
          row.roomKey,
          row.marketScope,
          row.stayFrom || null,
          row.stayTo || null,
          row.bookingFrom || null,
          row.bookingTo || null,
          row.mealPlan || null,
          row.occupancyKey || null,
          Math.round(row.baseNetVnd),
          row.discountType || null,
          row.discountValue ?? null,
          row.effectiveNetVnd,
          `batch:${batchId}`,
          row.sourceVersion || payload.sourceVersion || null,
        ),
      );
    }
  }

  await env.DB.batch(statements);

  return {
    ok: true,
    batchId,
    rowCount: normalized.length,
    acceptedCount: accepted.length,
    reviewCount: review.length,
    reviewPreview: review.slice(0, 20).map((row) => ({
      hotelId: row.hotelId,
      roomKey: row.roomKey,
      reason: row.reviewReason,
    })),
  };
}
