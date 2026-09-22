# Chat data and demand intelligence

JoTrip Trip keeps two layers of conversation data in D1 when the DB binding is enabled.

## Raw operational conversation

- `chat_sessions`
- `chat_messages`
- `chat_events`

This preserves the actual conversation so JoTrip can review product failures, understand wording, and improve the Trip Engine.

## Structured demand facts

- `trip_intent_events`

Each user turn may store structured fields such as:

- days / nights
- adults / children
- budget
- interests

This allows demand analytics without repeatedly parsing the raw text.

## Internal-only analytics

`GET /api/internal/analytics/chat-overview`

requires a runtime secret:

`INTERNAL_API_TOKEN`

Send it only from trusted internal tooling using:

`Authorization: Bearer <token>`

Never put this token in frontend JavaScript.

## Future account linking

Anonymous chat sessions use a browser-local session ID. When customer accounts are implemented, the existing anonymous session can be linked to the authenticated user/trip instead of starting over.

## Privacy direction

Before public launch:

- publish a clear privacy notice
- provide account/session deletion support
- define a raw-chat retention window
- keep aggregate/structured demand metrics separately when appropriate
- avoid collecting passport/payment data through ordinary chat
