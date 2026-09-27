# JoTrip AI / JoTrip Trip

**Tri thức Phú Quốc biết trò chuyện.**

> **Biến tri thức, dữ liệu sống và kinh nghiệm làm nghề ở Phú Quốc thành một người bạn ở đảo có thể trò chuyện, suy nghĩ cùng khách và hỗ trợ họ khi cần.**

Implementation principle:

> **AI understands the traveler. The engine calculates. Data decides. JoTrip operates.**

## V2 development status - 27/09/2026 (draft, not deployed)

The existing baseline Worker was previously reported operational. This V2 branch has not been deployed. Production D1 was inspected read-only; a separate synthetic preview D1 was used for SQL regression, with no production migration.

Implemented foundation:

- conversational homepage built around “Tri thức Phú Quốc biết trò chuyện”
- server-authoritative multi-turn context with idempotent clientTurnId and refresh restoration (migrations 0009-0011 are covered in local D1 CI for full chat + booking readiness)
- multilingual search/intent parsing: VI / EN / KO / RU / 中文
- pre-read human advice before detail surfaces
- animated JoTrip Guide states: idle / thinking / talking / pointing
- text-first Living Canvas; public voice/TTS is removed from the V2 runtime to avoid unexpected costs
- deterministic trip intent parser
- anonymous chat session ID
- D1 schemas for accounts, trips, chat history, intent analytics and price watches
- private chat demand analytics endpoint
- approved booking-lead retention: 90 days after last human contact for open/unresponsive leads, 30 days after trip completion for fulfilled leads, and 180-day contact-free tombstones after verified erasure
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

The Workers Builds settings shown in the dashboard are:

- Build command: `npm run build`
- Deploy command: `npm run deploy` (`package.json` maps this to `wrangler deploy`)
- Version command: `npx wrangler versions upload`
- Root directory: `/`
- Production branch: `main`; builds for non-production branches are disabled.

`wrangler versions upload` uploads a Worker version without deploying it; the deploy command handles deployment. It is only useful when a separately addressable version is needed. See [Cloudflare's version deployment guide](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/) and [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Before any preview Worker deployment, reconcile the remote migration ledger with its existing legacy schema and confirm owner custody of the recovery key. The encrypted full backup and isolated restore were verified on 2026-09-26. No live migration is authorized by this PR; never apply 0000-0011 blindly. The database ID is present in `wrangler.jsonc`; runtime secrets must never be committed.

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
