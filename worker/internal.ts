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

  const [sessions, messages, recent, durations, party, budget, interests] =
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
      env.DB.prepare(
        `SELECT value AS interest, COUNT(*) AS count
         FROM trip_intent_events, json_each(trip_intent_events.interests_json)
         WHERE interests_json IS NOT NULL
         GROUP BY value
         ORDER BY count DESC, interest ASC
         LIMIT 30`,
      ),
    ]);

  return {
    ok: true,
    sessions: Number(sessions.results?.[0]?.count || 0),
    userMessages: Number(messages.results?.[0]?.count || 0),
    durationDemand: durations.results || [],
    partyDemand: party.results || [],
    budget: budget.results?.[0] || null,
    interestDemand: interests.results || [],
    recent: recent.results || [],
  };
}

/** V2 dashboard: aggregate canonical sessions, not every repeated mention in chat.
 * No raw text, session IDs, contacts or full response JSON leave this endpoint.
 */
export async function tripV2AnalyticsOverview(env: InternalEnv) {
  if (!env.DB) return { ok: false, error: "db_not_bound" };
  try {
    const [sessions, turns, dates, durations, party, interests, actions, daily] =
      await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS count FROM trip_sessions_v2"),
        env.DB.prepare("SELECT COUNT(*) AS count FROM trip_turns_v2"),
        env.DB.prepare(
          `SELECT COUNT(*) AS count FROM trip_sessions_v2
           WHERE json_extract(state_json, '$.checkin') IS NOT NULL
             AND json_extract(state_json, '$.checkout') IS NOT NULL`,
        ),
        env.DB.prepare(
          `SELECT json_extract(state_json, '$.days') AS days,
                  json_extract(state_json, '$.nights') AS nights, COUNT(*) AS count
           FROM trip_sessions_v2
           WHERE json_extract(state_json, '$.days') IS NOT NULL
           GROUP BY days, nights ORDER BY count DESC LIMIT 20`,
        ),
        env.DB.prepare(
          `SELECT json_extract(state_json, '$.adults') AS adults,
                  json_extract(state_json, '$.children') AS children, COUNT(*) AS count
           FROM trip_sessions_v2
           WHERE json_extract(state_json, '$.adults') IS NOT NULL
              OR json_extract(state_json, '$.children') IS NOT NULL
           GROUP BY adults, children ORDER BY count DESC LIMIT 20`,
        ),
        env.DB.prepare(
          `SELECT value AS interest, COUNT(*) AS count
           FROM trip_sessions_v2, json_each(trip_sessions_v2.state_json, '$.interests')
           GROUP BY value ORDER BY count DESC, interest ASC LIMIT 30`,
        ),
        env.DB.prepare(
          `SELECT json_extract(response_json, '$.action') AS action, COUNT(*) AS count
           FROM trip_turns_v2 GROUP BY action ORDER BY count DESC`,
        ),
        env.DB.prepare(
          `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS turns
           FROM trip_turns_v2 GROUP BY day ORDER BY day DESC LIMIT 14`,
        ),
      ]);
    return {
      ok: true, schema: "trip_v2", basis: "current_session_state",
      sessions: Number(sessions.results?.[0]?.count || 0),
      turns: Number(turns.results?.[0]?.count || 0),
      sessionsWithDates: Number(dates.results?.[0]?.count || 0),
      durationDemand: durations.results || [],
      partyDemand: party.results || [],
      interestDemand: interests.results || [],
      actions: actions.results || [],
      dailyTurns: daily.results || [],
      note: "Counts are anonymous sessions, not distinct people or bookings.",
    };
  } catch {
    return { ok: false, error: "trip_v2_analytics_unavailable" };
  }
}
