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

1. **Confirmed** in a separate read-only check: `chat_sessions` and `chat_messages` both contain rows. `trips` and `hotels_public` are empty. The audit deliberately reported only presence/absence, never customer content or exact counts. Run: https://github.com/kenzuko/jotrip-home/actions/runs/36239698819. Preserve legacy chat records until an access-restricted, durable backup and retention decision exist.
2. **Confirmed**: no existing D1 with the `jotrip-trip` prefix other than `jotrip-trip-db` before the preview test. Created isolated `jotrip-trip-v2-preview-20260926` (UUID `ac9aec13-a732-42e9-918f-6a401982bdd2`) in the same Cloudflare account. Ran `0000`, `0005` through `0010` against **preview only**. The exported preview schema passed all six V2 table contracts; synthetic session, consent, erasure, stale-tab and retry SQL fixtures passed remotely. Run: https://github.com/kenzuko/jotrip-home/actions/runs/36239851207.
3. Cloudflare-managed **Time Travel** was verified and its read-only recovery bookmark recorded at 2026-09-26 11:50 UTC: `0000001a-00000000-000050f2-dc64f91a9c9f758c36f8a7a8feb3cc9d` (audit: https://github.com/kenzuko/jotrip-home/actions/runs/36240039097). Cloudflare retains Time Travel history only for the plan-specific window (7 days Free, up to 30 days Paid); this is **not a durable off-platform backup**. Take and verify an access-restricted full export before changing the live D1.
4. **Done for SQL migrations and synthetic D1 regression** on isolated preview. End-to-end live Worker HTTP concurrency, session restore and mobile testing remain pending; do not confuse SQL fixtures with full browser-to-Worker QA.
5. Only then approve a minimal live migration plan; no deployment or DNS change is implied by this audit.

No durable full remote backup, live production migration, preview Worker deploy or production Worker change has been performed. The isolated preview database is a new Cloudflare resource and contains synthetic test data only. Do not delete legacy chat data just because V2 replaces its interface.
