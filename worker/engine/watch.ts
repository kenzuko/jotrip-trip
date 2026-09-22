type Env = { DB?: D1Database };

type WatchRow = {
  id: string;
  subject_ref: string;
  watch_type: string;
  params_json: string | null;
  threshold_json: string | null;
};

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function insertNotification(
  env: Env,
  watchId: string,
  type: string,
  severity: "info" | "watch" | "important",
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO watch_notifications
      (id, watch_id, notification_type, severity, title, body, data_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    watchId,
    type,
    severity,
    title,
    body,
    JSON.stringify(data),
  ).run();
}

export async function evaluatePriceWatches(
  env: Env,
  options: { watchId?: string } = {},
) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };

  const query = options.watchId
    ? env.DB.prepare(
        `SELECT id, subject_ref, watch_type, params_json, threshold_json
         FROM price_watches
         WHERE enabled = 1 AND id = ?`,
      ).bind(options.watchId)
    : env.DB.prepare(
        `SELECT id, subject_ref, watch_type, params_json, threshold_json
         FROM price_watches
         WHERE enabled = 1
         ORDER BY created_at ASC
         LIMIT 500`,
      );

  const watches = await query.all<WatchRow>();
  let notifications = 0;

  for (const watch of watches.results || []) {
    const params = safeJson<Record<string, any>>(watch.params_json, {});
    const thresholds = safeJson<Record<string, any>>(watch.threshold_json, {});
    const hotelId = String(params.hotelId || watch.subject_ref.replace(/^hotel:/, ""));
    const checkin = params.checkin ? String(params.checkin) : null;
    const checkout = params.checkout ? String(params.checkout) : null;
    const referencePrice = Number(params.referencePriceVnd || 0);
    const changePct = Math.max(0.01, Number(thresholds.priceChangePct || 0.05));

    let offerQuery = `SELECT sell_price_vnd, availability_state, checked_at
                      FROM hotel_public_offers
                      WHERE hotel_id = ?`;
    const bindings: unknown[] = [hotelId];

    if (checkin && checkout) {
      offerQuery += " AND checkin_date = ? AND checkout_date = ?";
      bindings.push(checkin, checkout);
    }

    offerQuery += " ORDER BY checked_at DESC LIMIT 1";

    const latestOffer = await env.DB.prepare(offerQuery)
      .bind(...bindings)
      .first<Record<string, unknown>>();

    if (!latestOffer) continue;

    const currentPrice = Number(latestOffer.sell_price_vnd || 0);
    const availability = String(latestOffer.availability_state || "unknown");

    if (referencePrice > 0 && currentPrice > 0) {
      const delta = currentPrice - referencePrice;
      const deltaPct = delta / referencePrice;

      if (deltaPct >= changePct) {
        await insertNotification(
          env,
          watch.id,
          "PRICE_UP",
          "important",
          "Giá phòng đã tăng",
          `Giá cho ngày bạn theo dõi tăng khoảng ${Math.round(deltaPct * 100)}% so với lúc lưu chuyến.`,
          { hotelId, referencePrice, currentPrice, delta, deltaPct, checkin, checkout },
        );
        notifications++;
      } else if (deltaPct <= -changePct) {
        await insertNotification(
          env,
          watch.id,
          "PRICE_DOWN",
          "important",
          "Có mức giá tốt hơn",
          `Giá cho ngày bạn theo dõi giảm khoảng ${Math.round(Math.abs(deltaPct) * 100)}%.`,
          { hotelId, referencePrice, currentPrice, delta, deltaPct, checkin, checkout },
        );
        notifications++;
      }
    }

    if (availability === "confirmed_unavailable") {
      await insertNotification(
        env,
        watch.id,
        "ROOM_UNAVAILABLE",
        "important",
        "Loại phòng này hiện không còn",
        "JoTrip đã có xác nhận không còn loại phòng đang theo dõi cho ngày này.",
        { hotelId, checkin, checkout, availability },
      );
      notifications++;
    } else if (
      availability === "observed_unavailable" ||
      availability === "limited"
    ) {
      await insertNotification(
        env,
        watch.id,
        "ROOM_RISK",
        "watch",
        "Lựa chọn phòng đang thu hẹp",
        "Một số nguồn hiện không còn hoặc chỉ còn hạn chế lựa chọn tương đương. Đây chưa phải xác nhận số phòng còn lại.",
        { hotelId, checkin, checkout, availability },
      );
      notifications++;
    }

    const snapshots = await env.DB.prepare(
      `SELECT
         COUNT(price_vnd) AS sample_count,
         AVG(price_vnd) AS avg_price,
         MIN(price_vnd) AS min_price,
         MAX(price_vnd) AS max_price
       FROM market_snapshots
       WHERE subject_ref = ?
         AND price_vnd IS NOT NULL
         AND observed_at >= datetime('now', '-30 days')`,
    ).bind(`hotel:${hotelId}`).first<Record<string, unknown>>();

    const sampleCount = Number(snapshots?.sample_count || 0);
    const avgPrice = Number(snapshots?.avg_price || 0);

    if (sampleCount >= 5 && currentPrice > 0 && avgPrice > 0) {
      const premium = currentPrice / avgPrice - 1;
      if (premium >= Number(thresholds.peakPremiumPct || 0.15)) {
        await insertNotification(
          env,
          watch.id,
          "PEAK_PRICE_SIGNAL",
          "watch",
          "Ngày này đang ở vùng giá cao",
          "Mức giá hiện tại cao hơn đáng kể so với quan sát gần đây. JoTrip sẽ tiếp tục theo dõi trước khi gọi đây là cao điểm thực sự.",
          { hotelId, currentPrice, avgPrice, sampleCount, premium, checkin, checkout },
        );
        notifications++;
      }
    }
  }

  return {
    ok: true,
    evaluated: watches.results?.length || 0,
    notifications,
  };
}
