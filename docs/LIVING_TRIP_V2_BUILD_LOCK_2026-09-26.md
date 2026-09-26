# JoTrip Living Trip V2 - clean rebuild lock (26/09/2026)

Status: isolated draft PR #6. The owner has authorized deleting or renaming obsolete code; there is no important user data to migrate. This is **not** authorization to drop the remote D1 database, change production DNS or deploy an untested build.

## Product contract

Text-first, natural conversations that directly update a responsive visual planning canvas. One traveler message is one server-authoritative turn. The Trip Engine uses verified route and commercial data; it never invents hotel prices, operating times, availability or route durations. Voice and paid AI inference are postponed. Keep the original JoTrip logo and eight approved mascot assets.

## Keep and reuse

- React/Vite + Cloudflare Worker + D1 modular monolith.
- Existing deterministic parser, trip builder, destination knowledge, route matrix, private hotel pricing firewall and booking lead consent flow.
- Existing public attraction catalog, source adapters, approved logo/mascot, and legacy D1 migrations 0000-0008 to preserve schema compatibility.
- Current V2 welcome story cards and one unified Trip Pulse. Clicking a direction expands its real tradeoffs and available route evidence without repeating a second comparison section.

## Rebuilt

- `worker/tripState.ts`: merge follow-up facts without resetting on a new duration, support explicit new trip, add/remove attractions and short acknowledgements.
- `worker/tripTurn.ts`: `POST /api/trip/turn` builds the final response and visual plan in the Worker. The same clientTurnId returns the exact stored response; different text with the same ID is rejected. Version-checked D1 session writes reject concurrent stale turns.
- `GET /api/trip/session`: restore the last trip, recent conversation and most recent plan after a refresh.
- `migrations/0009_trip_turn_state.sql`: additive session/turn tables, not a remote reset. The `response_json` is the exact final reply returned to the browser.
- Frontend now consumes one turn endpoint instead of independently parsing, merging, building and replacing its own transcript. A failed network request keeps the clientTurnId for safe retry.

## Removed from active runtime

- Legacy `POST /api/trip/parse` and its initial-reply logging, which did not match the final answer the user saw.
- Obsolete parse-route integration test, replaced by state and real Worker-turn integration tests.
- Unreachable paid voice UI, public `/api/voice` route and unused `worker/voice.ts`. Voice remains a future product phase; approved speaking mascot art is untouched.
- Unused Workers AI binding in the launch config. `worker/aiIntent.ts` is retained as dormant research code but is not imported by the Worker. There is **no model call** in the new turn path.

## Remaining gates

1. Inspect the actual remote D1 migration history and make a backup. Apply additive migration 0009 only after verifying the active database and Cloudflare permissions.
2. Real D1 smoke test: first request, short acknowledgement, follow-up, explicit new trip, same-ID retry, concurrent writes, refresh, and booking lead consent.
3. Persist check-in/check-out selections in server state. Current date-specific repricing still calls the existing separate builder and has not been converted to an authoritative saved itinerary.
4. Connect internal analytics to the new `trip_turns_v2` table. The old `chat_messages` dashboard does not automatically include new V2 turns.
5. Complete privacy notice, session deletion and retention controls before public launch.
6. Use real photos only after checking photographer rights, guest consent and precise geographic identity; optimize to WebP and lazy-load.
7. Review current CI, inspect the mobile Chromium/WebKit screenshots and verify a real device. Then consider preview deployment of `jotrip-trip` only, with rollback. No CMS, Weather, Airport or Transit changes.

The previously requested recovery ZIP is **optional**, not a deployment blocker. If it becomes available, compare it selectively for reusable tests or business logic; do not merge the old session architecture wholesale.
