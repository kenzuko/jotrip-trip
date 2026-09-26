# Chat data - Living Trip V2

## Authoritative operational record

The V2 browser sends one `POST /api/trip/turn` with a stable `sessionId`, `clientTurnId` and text. The Worker resolves the conversation state, builds the plan/advisor answer and stores **the same final response JSON returned to the browser** in D1.

- `trip_sessions_v2`: current canonical trip context, trip ID, version and last accepted turn ID.
- `trip_turns_v2`: unique (session ID, client turn ID), input and exact final response. A repeated ID with the same text returns the original response without a second turn.
- `GET /api/trip/session`: restores recent turns and last available evidence canvas after a page refresh.

Migration `0009_trip_turn_state.sql` adds these tables without dropping older schema. If D1 or this migration is missing, V2 reports an unavailable session instead of pretending to save.

## Legacy analytics

`chat_sessions`, `chat_messages`, `chat_events` and `trip_intent_events` are legacy V1 tables. The old `/api/trip/parse` writer has been retired from the V2 branch. Existing `GET /api/internal/analytics/chat-overview` currently reads legacy tables and **must not be presented as comprehensive V2 demand analytics** until its reader is adapted to `trip_turns_v2`.

`INTERNAL_API_TOKEN` remains server-only. Never expose it in frontend code.

## Privacy gates before public launch

Publish a privacy notice, define a retention window for raw text, implement session deletion and redact sensitive customer details where feasible. Do not request passports or payment details in chat. A browser session ID is not authentication and must not be treated as permission to reveal private booking/contact data.

## Known next step

Date-specific repricing and booking lead submission still use their existing APIs. Persist check-in/check-out in the server's canonical trip context before calling the itinerary fully saved. Cross-device recovery will require explicit account linking or another authorized transfer method.
