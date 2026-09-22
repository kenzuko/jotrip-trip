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

  const [sessions, messages, recent] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count FROM chat_sessions"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE role = 'user'"),
    env.DB.prepare(
      `SELECT content, parsed_intent_json, created_at
       FROM chat_messages
       WHERE role = 'user'
       ORDER BY created_at DESC
       LIMIT 20`,
    ),
  ]);

  return {
    ok: true,
    sessions: Number(sessions.results?.[0]?.count || 0),
    userMessages: Number(messages.results?.[0]?.count || 0),
    recent: recent.results || [],
  };
}
