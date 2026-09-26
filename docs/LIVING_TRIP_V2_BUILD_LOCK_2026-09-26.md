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

## Completed since the initial V2 foundation

- Date selection now uses the same idempotent turn endpoint. Dates are validated, saved in canonical state, restored after refresh and passed to the verified-rate engine. Changing the number of nights invalidates old dates.
- Internal `GET /api/internal/analytics/trip-v2` uses a server-only bearer token and returns session-level aggregate counts without raw text, contacts or session IDs. The legacy dashboard remains separate.
- `POST /api/trip/session` restores the trip without putting the bearer session ID in the URL. `DELETE /api/trip/session` deletes V2 trip context and transcript after two-step UI confirmation.
- A 90-day inactivity retention job is configured for 03:00 Vietnam time. Separately consented booking leads are not deleted by chat deletion or this job and need their own policy.
- Booking leads now use a **minimal allowlisted summary read from canonical server state**, not client-submitted raw chat or a full plan. A lead carries a client-generated idempotency UUID and the displayed trip ID/version; a second tab changing the trip triggers a 409 refresh requirement instead of silently handing off another itinerary. A lost-response retry cannot create a second lead. Additive migration 0010 formalizes the old runtime-created lead table and stores explicit consent version/time. A separately authenticated staff erasure endpoint removes a verified lead and keeps a contact-free audit. Automatic lead retention remains deliberately **disabled pending an operator-approved policy**.
- See `docs/BOOKING_DATA_PRIVACY_V2.md` and `docs/LIVING_TRIP_V2_REMOTE_D1_PREFLIGHT.md` for the distinct lead lifecycle and the unexecuted remote inspection/backup steps.
- CI includes an actual local D1 schema and lifecycle smoke fixture in addition to mocked Worker tests. CI never touches remote D1.

## Remaining gates

1. Inspect and back up the actual remote D1 database. Apply additive migrations 0009 and 0010 only after schema review and explicit deployment approval.
2. Run real D1 smoke tests for simultaneous writes, retries, restoration and deletion. Local D1 checks do not prove remote readiness.
3. Confirm booking-lead retention, publish a reviewed privacy notice and establish a public deletion contact for separately submitted booking requests. The staff-only erasure endpoint exists but does not verify customer identity on its own. The current inline disclosure is not a complete legal privacy notice.
4. Review real photo rights/guest consent and precise geography; optimize authorized images and lazy-load.
5. Inspect mobile Chromium/WebKit screenshots, test on a real iPhone and consider preview deployment only after the above gates. No CMS, Weather, Airport or Transit changes.

The previously requested recovery ZIP is **optional**, not a deployment blocker. If it becomes available, compare it selectively for reusable tests or business logic; do not merge the old session architecture wholesale.
