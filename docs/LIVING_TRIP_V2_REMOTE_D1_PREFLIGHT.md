# Living Trip V2 - remote D1 read-only preflight and backup runbook

Status: **not executed**. Requires an authenticated Cloudflare account and explicit deployment approval for any remote mutation. No Cloudflare credential is stored in GitHub or this document. The GitHub CI workflows run local D1 only.

Official command reference: https://developers.cloudflare.com/d1/wrangler-commands/
Official export reference: https://developers.cloudflare.com/d1/best-practices/import-export-data/

## A. Read-only inspection (no mutation)

Run from the `jotrip-trip` repository with an authenticated Wrangler session and confirm the account and `database_id` in `wrangler.jsonc` before any command.

```sh
npx wrangler d1 info jotrip-trip-db --json
npx wrangler d1 migrations list jotrip-trip-db --remote
npx wrangler d1 execute jotrip-trip-db --remote --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('booking_leads','trip_sessions_v2','trip_turns_v2','trip_deleted_sessions_v2','booking_lead_consents_v2','booking_lead_erasure_audit','d1_migrations') ORDER BY name"
npx wrangler d1 export jotrip-trip-db --remote --no-data --output=./jotrip-trip-schema-preflight.sql
```

Inspect the output **locally**. A legacy runtime-created `booking_leads` table may already exist even when migration 0010 has not been applied. Do not assume `d1 migrations list` accurately represents the complete schema if older tables were created outside migrations. Do not commit the schema export without reviewing it for sensitive information.

## B. Full backup before any migration

Only after the correct account and database ID are verified:

```sh
npx wrangler d1 export jotrip-trip-db --remote --output=./jotrip-trip-backup-YYYYMMDD-HHMM.sql
```

The export contains **real customer contacts and trip details**. Keep it in an access-restricted encrypted location, not GitHub, chat, screenshots, CI artifacts or public storage. Verify file size and restore feasibility in an isolated local test database. Record a D1 Time Travel bookmark if available. An export alone is not a tested recovery plan.

## C. Stop conditions

Do not apply any migration or deploy if the DB identity differs from `wrangler.jsonc`, if an unexpected schema or migration history appears, if the export fails, if there is no rollback owner, or if a deployed Worker still relies on the old runtime schema in an incompatible way.

Migration 0009 introduces authoritative trip sessions, turns and deletion tombstones. Migration 0010 formalizes booking leads, adds separate consent records and a minimal erasure audit. Both are additive on tested local D1; the remote schema is **unverified**.

## D. Controlled preview only (future, requires approval)

1. Review read-only output and backup with the owner. Resolve legacy migration drift rather than blindly running every pending migration.
2. Prepare a separate preview D1 database if feasible, import only approved synthetic data and apply 0009/0010 there first.
3. Set `INTERNAL_API_TOKEN` and a **different** `LEAD_ADMIN_TOKEN` as preview Worker secrets. Never place them in the repository or expose them to the browser.
4. Test real D1 concurrency, retry, session restore, deletion/tombstones, separate lead consent and staff erasure in preview. Test mobile WebKit on an actual iPhone.
5. After explicit production approval and a verified rollback plan, apply only reviewed migrations and deploy. **No DNS, CMS, Weather, Airport or Transit changes** are part of this scope.

This runbook intentionally does not include a ready-to-run remote `migrations apply` or `deploy` command: schema reconciliation and explicit approval come first.
