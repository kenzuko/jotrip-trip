# Living Trip V2 - first live D1 audit (26 Sep 2026)

Status: **read-only live audit completed, no production mutation**.

## Authenticated access

The JoTrip Trip repository does not currently expose Cloudflare Actions credentials. A separate, isolated audit branch in `kenzuko/jotrip-home` uses its already-configured Cloudflare Actions secrets without copying or printing token values. This is an audit bridge, **not** permission to change Open Phu Quoc production.

- Audit workflow: https://github.com/kenzuko/jotrip-home/actions/runs/36239634348
- Read-only branch: `audit/jotrip-trip-d1-readonly-20260926`
- The live D1 UUID matched `wrangler.jsonc` exactly: `17372bb5-7626-4238-8a95-fc0cf31ad18e`.
- Wrangler `d1 export --remote --no-data` succeeded. The schema export was inspected on an ephemeral runner and deleted; no customer data or schema artifact was published.

## Verified remote schema

Live `sqlite_master` returned 17 application tables (plus Cloudflare's internal `_cf_KV`):

`activity_products`, `chat_events`, `chat_messages`, `chat_sessions`, `hotel_private_rates`, `hotel_public_offers`, `hotel_rate_import_batches`, `hotel_rate_import_rows`, `hotels_public`, `market_snapshots`, `price_watches`, `public_activity_rates`, `travel_matrix`, `traveler_profiles`, `trip_intent_events`, `trips`, `users`.

**None** of the six tables required by V2 trip persistence and booking consent currently exist remotely. `booking_leads` is also absent. The read-only schema analyzer correctly reports `MIGRATIONS_PENDING_REVIEW` with no incompatible V2 table yet.

Wrangler lists `0000_bootstrap_all.sql` through `0010_booking_lead_privacy.sql` as pending. This **does not mean** that all those migrations should be applied: most legacy tables already exist, apparently created outside Wrangler's recorded migration history. Applying the entire backlog blindly is prohibited until reconciled.

## Next gates

1. Confirm whether legacy tables contain customer or operational records. A schema-only export cannot answer this.
2. Determine whether a dedicated preview D1 already exists; use it rather than creating a duplicate if possible.
3. Take a **durable, access-restricted backup** and test its recovery before changing the live D1. An ephemeral CI export is not a backup.
4. Test the additive V2 migrations and real D1 concurrency in an isolated preview DB.
5. Only then approve a minimal live migration plan; no deployment or DNS change is implied by this audit.

No full remote backup, live migration, preview deploy or production Worker change has been performed.
