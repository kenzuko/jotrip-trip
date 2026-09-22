# JoTrip AI / JoTrip Trip

**Tri thức Phú Quốc biết trò chuyện.**

> **Biến tri thức, dữ liệu sống và kinh nghiệm làm nghề ở Phú Quốc thành một người bạn ở đảo có thể trò chuyện, suy nghĩ cùng khách và hỗ trợ họ khi cần.**

Implementation principle:

> **AI understands the traveler. The engine calculates. Data decides. JoTrip operates.**

## Foundation status - 22/09/2026

Base Cloudflare Worker deployment is green.

Implemented foundation:

- conversational homepage built around “Tri thức Phú Quốc biết trò chuyện”
- multi-turn follow-up context
- multilingual search/intent parsing: VI / EN / KO / RU / 中文
- pre-read human advice before detail surfaces
- animated JoTrip Guide states: idle / thinking / talking / pointing
- optional natural TTS endpoint with browser premium-voice fallback only
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

Next infrastructure step is binding D1 `jotrip-trip-db` as `DB` and applying migrations. The D1 UUID and runtime secrets are intentionally not committed.

Workers AI is **not required for V0**.

### Voice

The frontend first calls `POST /api/voice`.

- If Worker secret `OPENAI_API_KEY` is configured, the Worker generates natural speech server-side.
- The key never goes to the browser and must never be committed.
- If natural TTS is not configured, the UI only uses a browser voice when a higher-quality local voice is detected; it no longer forces a poor default robotic voice.
- Keep spoken replies short. Detailed facts stay on screen.

The product must never imply that the website is using the exact ChatGPT app voice. JoTrip has its own synthetic guide voice.

## Never commit

- Hotel source spreadsheets
- Contract/net/effective net rates
- Supplier agreements/tactical codes
- Internal margin rules
- Private vehicle acquisition cost
- Secrets/tokens
- Customer PII
