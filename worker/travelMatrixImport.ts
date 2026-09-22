type Env = { DB?: D1Database };

export type TravelMatrixRow = {
  fromRef: string;
  toRef: string;
  distanceKm: number;
  normalMinutes?: number | null;
  source?: string | null;
  checkedAt?: string | null;
};

export async function importTravelMatrix(
  env: Env,
  rows: TravelMatrixRow[],
) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "rows_required" };
  }
  if (rows.length > 2000) {
    return { ok: false, error: "batch_too_large", maxRows: 2000 };
  }

  const valid = rows.filter((row) =>
    row.fromRef &&
    row.toRef &&
    Number.isFinite(row.distanceKm) &&
    row.distanceKm >= 0 &&
    (row.normalMinutes == null || (Number.isFinite(row.normalMinutes) && row.normalMinutes >= 0))
  );

  if (!valid.length) {
    return { ok: false, error: "no_valid_rows" };
  }

  const statements = valid.map((row) =>
    env.DB!.prepare(
      `INSERT INTO travel_matrix
        (from_ref, to_ref, distance_km, normal_minutes, source, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(from_ref, to_ref) DO UPDATE SET
         distance_km = excluded.distance_km,
         normal_minutes = excluded.normal_minutes,
         source = excluded.source,
         checked_at = excluded.checked_at`,
    ).bind(
      row.fromRef,
      row.toRef,
      Number(row.distanceKm),
      row.normalMinutes == null ? null : Math.round(row.normalMinutes),
      row.source || null,
      row.checkedAt || new Date().toISOString(),
    ),
  );

  await env.DB.batch(statements);

  return {
    ok: true,
    received: rows.length,
    imported: valid.length,
    rejected: rows.length - valid.length,
  };
}
