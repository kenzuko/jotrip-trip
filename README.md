# JoTrip Trip

Conversational trip decision engine for Phu Quoc.

> **AI understands the traveler. The engine calculates. Data decides. JoTrip operates.**

## Foundation status - 22/09/2026

Base Cloudflare Worker deployment is green.

Implemented foundation:

- conversational homepage shell
- Vietnamese browser speech output
- deterministic trip intent parser
- anonymous chat session ID
- D1 schemas for accounts, trips, chat history, intent analytics and price watches
- private chat demand analytics endpoint
- deterministic Trip Scenario / Pareto engine
- 7-seat car temporary rule: **15,000 VND/km**
- date-aware public attraction price catalog
- private hotel import staging and pricing firewall
- hotel ALL MARKET + one-clear-discount temporary safety rule
- public/private data boundary
- Open Phu Quoc CMS adapter contract
- JoTrip Guide mascot behavior lock

## Hotel pricing lock

Hotel commercial data is private. V0 automatically accepts only clearly normalized **ALL MARKET** blocks for internal calculation, optionally applying one clearly applicable discount to derive an internal floor.

That private floor never becomes a public price automatically.

## Cloudflare

Current Git deployment can keep:

- Build command: `None`
- Deploy command: `npx wrangler deploy`

Next infrastructure step is binding D1 `jotripa-trip-db` as `DB` and applying migrations. The D1 UUID and runtime secrets are intentionally not committed.

Workers AI is **not required for V0**. It will be an optional fallback parser later.

## Never commit

- Hotel source spreadsheets
- Contract/net/effective net rates
- Supplier agreements/tactical codes
- Internal margin rules
- Private vehicle acquisition cost
- Secrets/tokens
- Customer PII
