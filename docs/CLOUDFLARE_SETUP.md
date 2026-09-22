# Cloudflare setup - JoTrip Trip

The base Worker can deploy before D1, AI, or the custom domain are connected.

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

Not required for V0.

The deterministic parser remains the primary parser for common Phu Quoc trip requests. Workers AI can be added later only as a fallback for complex natural-language requests.

Recommended future binding name:

`AI`

No separate AI Worker is required.

## Domain

Keep testing on the workers.dev URL until routing is stable.

When `trip.jotrip.vn` is ready for final routing, ensure the DNS target contains a hostname only when using CNAME - never an `https://` URL.
