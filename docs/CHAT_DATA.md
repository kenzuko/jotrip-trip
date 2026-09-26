# Chat data - Living Trip V2

## Authoritative trip record

The V2 browser sends one `POST /api/trip/turn` with a stable `sessionId`, `clientTurnId` and text. Date-selection turns also carry validated `checkin` and `checkout`. The Worker resolves the conversation state, builds the plan/advisor answer and stores **the exact final response JSON returned to the browser** in D1.

- `trip_sessions_v2`: current canonical trip context, trip ID, selected dates, version and last accepted turn ID.
- `trip_turns_v2`: unique (session ID, client turn ID), input and final response. Repeated IDs with identical content return the original response; conflicting reuse is rejected.
- `POST /api/trip/session`: restores the last trip, dates, recent transcript and last relevant canvas. The anonymous bearer session ID travels in the request body, never in a query string.
- `DELETE /api/trip/session`: after two-step UI confirmation, deletes only the V2 trip context and transcript. A short-lived tombstone blocks an old browser tab from recreating the deleted session. Separately consented booking leads are unaffected. Booking handoff sends contact, explicit consent, a stable client lead UUID and the trip ID/version displayed in the browser. The Worker rechecks that exact trip version in D1, derives a minimal summary from canonical server state and stores a consent version/time under migration 0010. Stale tabs receive HTTP 409, and a network retry with the same UUID cannot create a duplicate lead. Staff-only erasure requires a separate lead-admin secret and an independently verified customer request.

Migration `0009_trip_turn_state.sql` is additive. If D1 or this migration is missing, V2 returns a clear unavailable error instead of pretending to save. A daily 03:00 Vietnam cron removes sessions idle for 90 days, their turns and tombstones older than 90 days; this is not a booking-lead retention policy.

## Analytics

`GET /api/internal/analytics/trip-v2` is protected by server-only `INTERNAL_API_TOKEN`. It reports current anonymous session counts, user turn counts, selected dates, duration/party/interest aggregates and action counts without returning raw messages, contact details or session IDs. Sessions are not unique people, and planning sessions are not confirmed bookings.

Legacy `chat_sessions`, `chat_messages`, `chat_events` and `trip_intent_events` remain for compatibility. The old `/api/trip/parse` writer is retired. `GET /api/internal/analytics/chat-overview` reads only legacy tables and must not be labeled a comprehensive V2 dashboard.

## Privacy gates before public launch

Publish a reviewed privacy notice, specify booking-lead retention and a way to request deletion of separately submitted contact details. Do not request passports or payment details in chat. Browser session IDs are bearer identifiers, not authenticated accounts, and must never grant access to private booking/contact records. The V2 self-service delete action does not delete a separately consented lead.

## Deployment gates

The `/api/health` readiness check requires the three V2 chat tables and all three booking lead/consent/erasure tables. It reports `tripStateReady` and `bookingLeadReady` separately and returns HTTP 503 if either migration is missing. Back up and inspect remote D1 before applying migrations 0009 and 0010. See `docs/LIVING_TRIP_V2_REMOTE_D1_PREFLIGHT.md`. CI exercises an actual local D1 SQL fixture and mocked Worker tests, but has not migrated or tested the remote database. Cross-device recovery needs explicit account linking or another authorized transfer mechanism. Saving dates and a planning canvas does not mean inventory is reserved or booking is confirmed.
