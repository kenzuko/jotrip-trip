# Living Trip V2 - remote D1 read-only preflight and backup runbook

Status: **remote read-only preflight completed 26 September 2026** via GitHub Actions run [36240762361](https://github.com/kenzuko/jotrip-trip/actions/runs/36240762361). The connected Cloudflare account and `jotrip-trip-db` UUID match `wrangler.jsonc`. Wrangler lists all migrations 0000-0010 as pending. A read-only `sqlite_master` query confirmed that all six V2/booking tables are absent; no partial V2 schema or incompatible `booking_leads` table was found among those six. A second read-only run [36240847844](https://github.com/kenzuko/jotrip-trip/actions/runs/36240847844) inventoried 19 pre-existing legacy/application tables, including `d1_migrations`, `chat_messages`, `trips`, `users`, hotel rate tables and the travel matrix. **The remote database is not empty of schema**. Wrangler nevertheless lists all 0000-0010 as pending, so legacy tables may have been created outside tracked migrations or the migration history is inconsistent. Do not blindly apply 0000-0008 or infer that customer data is absent. Full remote SQL export/backup returned Cloudflare authentication error 10000, so backup, migration, preview deployment and production deployment remain **blocked** until the token has the necessary D1 export/write permissions and a tested backup exists. No remote mutation has been made.

Official command reference: https://developers.cloudflare.com/d1/wrangler-commands/
Official export reference: https://developers.cloudflare.com/d1/best-practices/import-export-data/

## Credential handoff for this repository only

The correct GitHub repository is `kenzuko/jotrip-trip`, Worker `jotrip-trip`, D1 binding `DB`, database `jotrip-trip-db`, and reviewed config UUID `17372bb5-7626-4238-8a95-fc0cf31ad18e`. Do not substitute JoTrip Quote's database.

The GitHub Actions workflow `Cloudflare D1 read-only preflight` already exists on `feat/living-trip-v2-20260926`. It accepts a repository Actions secret named `CLOUDFLARE_API_TOKEN` (or `CF_API_TOKEN`) and either an Actions secret `CLOUDFLARE_ACCOUNT_ID` (or `CF_ACCOUNT_ID`) or a nonsecret repository variable `CLOUDFLARE_ACCOUNT_ID`. GitHub does not automatically share the similarly named secrets from `jotrip-home` or `Jotrip-Lab`.

The token needs only the Cloudflare permissions required for read-only D1 metadata, migration history and schema export. Do not paste a token into chat, commit it, or attach it as a workflow artifact. The credentials are now present and support D1 metadata, migration listing and read-only queries. The export endpoint still rejects the token; arrange an appropriately scoped token before backup or migration. After credential changes, run `Actions > Cloudflare D1 read-only preflight > Run workflow` on the V2 branch. This workflow is read-only and does not back up customer data, apply migrations or deploy.

## A. Read-only inspection (no mutation)

Run from the `jotrip-trip` repository with an authenticated Wrangler session and confirm the account and `database_id` in `wrangler.jsonc` before any command.

```sh
npx wrangler d1 info jotrip-trip-db --json
npx wrangler d1 migrations list jotrip-trip-db --remote
npx wrangler d1 execute jotrip-trip-db --remote --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('booking_leads','trip_sessions_v2','trip_turns_v2','trip_deleted_sessions_v2','booking_lead_consents_v2','booking_lead_erasure_audit','d1_migrations') ORDER BY name"
npx wrangler d1 export jotrip-trip-db --remote --no-data --output=./jotrip-trip-schema-preflight.sql
```

Analyze the schema-only export **locally** before deciding on any migration:

```sh
node tools/d1-schema-preflight.mjs ./jotrip-trip-schema-preflight.sql
```

The analyzer returns `SCHEMA_COLUMNS_PRESENT` only when all six V2/booking tables expose the required columns. `MIGRATIONS_PENDING_REVIEW` means the tables are absent and the remote migration history still needs manual inspection. `STOP_SCHEMA_DRIFT` blocks migration or deployment until an existing partial/incompatible schema is reconciled. Even a green column check is **not** a migration approval: verify constraints, indexes, actual table definitions, applied migration history and Worker compatibility. This analyzer never connects to Cloudflare or prints database rows.

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
