# Chat data - Living Trip V2

## Authoritative trip record

The V2 browser sends one `POST /api/trip/turn` with a stable `sessionId`, `clientTurnId` and text. Date-selection turns also carry validated `checkin` and `checkout`. The Worker resolves the conversation state, builds the plan/advisor answer and stores **the exact final response JSON returned to the browser** in D1.

- `trip_sessions_v2`: current canonical trip context, trip ID, selected dates, version and last accepted turn ID.
- `trip_turns_v2`: unique (session ID, client turn ID), input and final response. Repeated IDs with identical content return the original response; conflicting reuse is rejected.
- `POST /api/trip/session`: restores the last trip, dates, recent transcript and last relevant canvas. The anonymous bearer session ID travels in the request body, never in a query string.
- `DELETE /api/trip/session`: after two-step UI confirmation, deletes only the V2 trip context and transcript. Separately consented booking leads are unaffected.

Migration `0009_trip_turn_state.sql` is additive. If D1 or this migration is missing, V2 returns a clear unavailable error instead of pretending to save. A daily 03:00 Vietnam cron removes sessions idle for 90 days and their turns; this is not a booking-lead retention policy.

## Analytics

`GET /api/internal/analytics/trip-v2` is protected by server-only `INTERNAL_API_TOKEN`. It reports current anonymous session counts, user turn counts, selected dates, duration/party/interest aggregates and action counts without returning raw messages, contact details or session IDs. Sessions are not unique people, and planning sessions are not confirmed bookings.

Legacy `chat_sessions`, `chat_messages`, `chat_events` and `trip_intent_events` remain for compatibility. The old `/api/trip/parse` writer is retired. `GET /api/internal/analytics/chat-overview` reads only legacy tables and must not be labeled a comprehensive V2 dashboard.

## Privacy gates before public launch

Publish a reviewed privacy notice, specify booking-lead retention and a way to request deletion of separately submitted contact details. Do not request passports or payment details in chat. Browser session IDs are bearer identifiers, not authenticated accounts, and must never grant access to private booking/contact records. The V2 self-service delete action does not delete a separately consented lead.

## Deployment gates

Back up and inspect remote D1 before applying migration 0009. CI exercises an actual local D1 SQL fixture and mocked Worker tests, but has not migrated or tested the remote database. Cross-device recovery needs explicit account linking or another authorized transfer mechanism. Saving dates and a planning canvas does not mean inventory is reserved or booking is confirmed.
