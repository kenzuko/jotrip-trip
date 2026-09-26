# JoTrip AI / JoTrip Trip

**Tri thức Phú Quốc biết trò chuyện.**

> **Biến tri thức, dữ liệu sống và kinh nghiệm làm nghề ở Phú Quốc thành một người bạn ở đảo có thể trò chuyện, suy nghĩ cùng khách và hỗ trợ họ khi cần.**

Implementation principle:

> **AI understands the traveler. The engine calculates. Data decides. JoTrip operates.**

## V2 development status - 26/09/2026 (draft, not deployed)

The existing baseline Worker was previously reported operational; this V2 branch has **not** been deployed or tested against remote D1.

Implemented foundation:

- conversational homepage built around “Tri thức Phú Quốc biết trò chuyện”
- server-authoritative multi-turn context with idempotent clientTurnId and refresh restoration (requires additive D1 migrations 0009 and 0010 for full chat + booking readiness)
- multilingual search/intent parsing: VI / EN / KO / RU / 中文
- pre-read human advice before detail surfaces
- animated JoTrip Guide states: idle / thinking / talking / pointing
- text-first Living Canvas; public voice/TTS is removed from the V2 runtime to avoid unexpected costs
- deterministic trip intent parser
- anonymous chat session ID
- D1 schemas for accounts, trips, chat history, intent analytics and price watches
- private chat demand analytics endpoint
- deterministic Trip Scenario / Pareto engine
- provider-neutral route decision layer using JoTrip's own travel matrix for distance/time evidence
- 7-seat car temporary rule: **15,000 VND/km**
- date-aware public attraction price catalog
- private hotel import staging and pricing firewall
- hotel ALL MARKET + one-clear-discount temporary safety rule
- public/private data boundary
- Open Phu Quoc CMS adapter contract
- JoTrip Guide mascot behavior lock

## Route decision layer

JoTrip enriches hotel/stay comparisons with its own `travel_matrix`.

- Runtime does **not** depend on a paid route API.
- Route distance/time is treated as evidence for a decision, not as marketing copy.
- JoTrip separately calculates vehicle price and operating logic.
- Missing route data never becomes a fake 0-minute / 0-VND advantage.
- V0 can be seeded for important Phu Quoc routes, then refreshed from open routing data later.

See `docs/FREE_ROUTE_DECISION_LAYER.md`.

## Hotel pricing lock

Hotel commercial data is private. V0 automatically accepts only clearly normalized **ALL MARKET** blocks for internal calculation, optionally applying one clearly applicable discount to derive an internal floor.

That private floor never becomes a public price automatically.

## Cloudflare

Current Git deployment can keep:

- Build command: `None`
- Deploy command: `npx wrangler deploy`

Before V2 preview deployment: verify the existing `jotrip-trip-db` binding, back up the remote database, inspect migration history and apply additive migrations 0009 and 0010 only after schema reconciliation and approval. The database ID is present in Wrangler config; runtime secrets must never be committed.

Workers AI is **not required for V0**.

### Current conversational endpoint

The V2 client uses `POST /api/trip/turn` for parsing, server-side planning and the final reply. `POST /api/trip/session` restores the latest trip, selected dates and recent conversation; `DELETE /api/trip/session` clears the anonymous V2 history. The internal `/api/internal/analytics/trip-v2` endpoint exposes only bearer-protected aggregates. Booking handoff records separate consent and only a minimal server-derived trip summary. Staff-only lead erasure uses a separate secret, and `/api/health` reports degraded readiness if either required migration is missing. The old stateless `/api/trip/parse` endpoint and public paid voice route are retired in this development branch.

Voice and optional AI interpretation can be evaluated later, after budget limits, consent and abuse controls are in place. No paid model is called in the V2 turn path.

See `docs/LIVING_TRIP_V2_BUILD_LOCK_2026-09-26.md`, `docs/CHAT_DATA.md`, `docs/BOOKING_DATA_PRIVACY_V2.md` and `docs/LIVING_TRIP_V2_REMOTE_D1_PREFLIGHT.md`. PR #6 remains draft; no remote D1 migration, DNS change or production deploy has been made by this branch.

## Never commit

- Hotel source spreadsheets
- Contract/net/effective net rates
- Supplier agreements/tactical codes
- Internal margin rules
- Private vehicle acquisition cost
- Secrets/tokens
- Customer PII
