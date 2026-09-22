export type InternalEnv = {
  DB?: D1Database;
  INTERNAL_API_TOKEN?: string;
};

export function isInternalAuthorized(request: Request, env: InternalEnv) {
  if (!env.INTERNAL_API_TOKEN) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${env.INTERNAL_API_TOKEN}`;
}

export async function chatAnalyticsOverview(env: InternalEnv) {
  if (!env.DB) {
    return { ok: false, error: "db_not_bound" };
  }

  const [sessions, messages, recent, durations, party, budget] =
    await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS count FROM chat_sessions"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE role = 'user'"),
      env.DB.prepare(
        `SELECT content, parsed_intent_json, created_at
         FROM chat_messages
         WHERE role = 'user'
         ORDER BY created_at DESC
         LIMIT 20`,
      ),
      env.DB.prepare(
        `SELECT days, nights, COUNT(*) AS count
         FROM trip_intent_events
         WHERE days IS NOT NULL OR nights IS NOT NULL
         GROUP BY days, nights
         ORDER BY count DESC
         LIMIT 20`,
      ),
      env.DB.prepare(
        `SELECT adults, children, COUNT(*) AS count
         FROM trip_intent_events
         WHERE adults IS NOT NULL OR children IS NOT NULL
         GROUP BY adults, children
         ORDER BY count DESC
         LIMIT 20`,
      ),
      env.DB.prepare(
        `SELECT
           COUNT(budget_vnd) AS sample_count,
           CAST(AVG(budget_vnd) AS INTEGER) AS avg_vnd,
           MIN(budget_vnd) AS min_vnd,
           MAX(budget_vnd) AS max_vnd
         FROM trip_intent_events
         WHERE budget_vnd IS NOT NULL`,
      ),
    ]);

  return {
    ok: true,
    sessions: Number(sessions.results?.[0]?.count || 0),
    userMessages: Number(messages.results?.[0]?.count || 0),
    durationDemand: durations.results || [],
    partyDemand: party.results || [],
    budget: budget.results?.[0] || null,
    recent: recent.results || [],
  };
}
