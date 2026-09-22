# JoTrip Trip

Conversational trip decision engine for Phu Quoc.

> **AI understands the traveler. The engine calculates. Data decides. JoTrip operates.**

## V0

- Conversational homepage foundation
- Vietnamese browser speech output
- Deterministic trip intent parser
- Trip Scenario Engine foundation
- 7-seat car temporary rule: **15,000 VND/km**
- Cloudflare Worker + Static Assets deployment
- D1 core schema for accounts, trips, watchlists, public activities and private hotel commercial data
- Public knowledge boundary: `cms.openphuquoc.com`

## Hotel pricing lock

Hotel commercial data is private. V0 automatically accepts only clearly normalized **ALL MARKET** blocks for internal calculation, optionally applying one clearly applicable discount to derive an internal floor. That private floor never becomes a public price automatically.

## Deployment

Cloudflare Git build may keep:

- Build command: `None`
- Deploy command: `npx wrangler deploy`

`wrangler deploy` runs `npm run build` through the custom build setting in `wrangler.jsonc` and deploys `./dist` as Worker static assets.

Do not bind D1 or `trip.jotrip.vn` until the base Worker deploy succeeds.

## Never commit

- Hotel source spreadsheets
- Contract/net/effective net rates
- Supplier agreements/tactical codes
- Internal margin rules
- Private vehicle acquisition cost
- Secrets/tokens
- Customer PII
