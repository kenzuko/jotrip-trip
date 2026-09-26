# Cloudflare setup - JoTrip Trip

Living Trip V2 requires its D1 chat and booking tables before serving trip requests. Do not deploy it to an existing production Worker before the read-only remote D1 preflight and backup described in `docs/LIVING_TRIP_V2_REMOTE_D1_PREFLIGHT.md`.

## D1

Database name expected by this project:

`jotrip-trip-db`

After the database exists, bind it as:

`DB`

Then apply migrations in order:

1. `0001_core.sql`
2. `0002_chat_analytics.sql`
3. `0003_private_import_batches.sql`
4. `0004_intent_analytics.sql`

The repo intentionally does not contain a D1 database UUID.

## Internal API secret

Create a Worker secret named:

`INTERNAL_API_TOKEN`

Do not commit its value.

## Workers AI

Workers AI is not enabled for the V2 MVP. Keep deterministic parsing as the default and do not add an AI binding or paid inference without a separately approved budget and privacy gate.

The deterministic parser remains the primary parser for common Phu Quoc trip requests. Workers AI can be added later only as a fallback for complex natural-language requests.

Recommended future binding name:

`AI`

No separate AI Worker is required.

## Domain

Keep testing on the workers.dev URL until routing is stable.

When `trip.jotrip.vn` is ready for final routing, ensure the DNS target contains a hostname only when using CNAME - never an `https://` URL.
