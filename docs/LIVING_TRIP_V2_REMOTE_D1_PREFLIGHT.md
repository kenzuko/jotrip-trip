# Living Trip V2 - remote D1 read-only preflight and backup runbook

Status: **remote read-only preflight completed 26 September 2026** via GitHub Actions run [36240762361](https://github.com/kenzuko/jotrip-trip/actions/runs/36240762361). The connected Cloudflare account and `jotrip-trip-db` UUID match `wrangler.jsonc`. Wrangler lists migrations 0000-0011 as pending. A read-only `sqlite_master` query confirmed that all six V2/booking tables are absent; no partial V2 schema or incompatible `booking_leads` table was found among those six. A second read-only run [36240847844](https://github.com/kenzuko/jotrip-trip/actions/runs/36240847844) inventoried 19 pre-existing legacy/application tables, including `d1_migrations`, `chat_messages`, `trips`, `users`, hotel rate tables and the travel matrix. **The remote database is not empty of schema**. Wrangler nevertheless lists all 0000-0011 as pending, so legacy tables may have been created outside tracked migrations or the migration history is inconsistent. A third read-only run [36240917577](https://github.com/kenzuko/jotrip-trip/actions/runs/36240917577) counted **0** recorded migrations, **44** legacy `chat_messages`, **0** `trips`, **0** `users`, and **0** `hotel_private_rates` rows. Other legacy tables were not row-counted. The 44 chat messages are real existing data and must be preserved through any change. Do not blindly apply 0000-0008 or infer that customer data is absent. The production export attempt using the trip-repo account-owned token returned Cloudflare authentication error 10000; a different existing user-owned token in `jotrip-home` successfully exported the same D1. The full export was encrypted, stored off-platform, downloaded/decrypted and restored in isolated SQLite on 2026-09-26; integrity and all 44 existing chat messages were verified. The tested durable-backup gate is complete. No remote mutation has been made; a production migration remains blocked pending migration-ledger reconciliation, owner custody of the recovery key, a reviewed rollback plan and explicit approval.

**Root-cause investigation, 26 September 2026:** The initial advice to add D1 Edit was premature. Cloudflare account-owned tokens can support D1 according to official documentation; the screenshot already showed D1 Edit. GitHub Actions proved that `jotrip-trip` has exactly one `CLOUDFLARE_API_TOKEN` and no fallback `CF_API_TOKEN`. The token is **active and account-owned**, verified against the account token verification endpoint (run [36242644012](https://github.com/kenzuko/jotrip-trip/actions/runs/36242644012)). It can read the correct production D1 UUID but `/export` returns 10000 even with `--no-data` (run [36242582686](https://github.com/kenzuko/jotrip-trip/actions/runs/36242582686)). By contrast, the **different active user-owned token** already stored in `jotrip-home` successfully exported the **same** D1's schema again on the same date (run [36242510932](https://github.com/kenzuko/jotrip-home/actions/runs/36242510932)). Their token-ID comparison hashes differ; no secret values were printed or copied. This isolates the issue to the specific token or export authorization path, not the database UUID, global D1 availability or a proven missing D1 Edit permission. Whether the account-owned token's policy, Cloudflare's export endpoint, or another account-token restriction causes the rejection is **not yet proven**. Do not ask the owner to create a new token or add permissions without further evidence.

The existing `jotrip-home` audit bridge can continue **read-only schema checks** using its working user-owned token without transferring credentials. The full production backup now has an access-restricted off-platform copy and a verified isolated restore; it was due for rotation or deletion by 2026-12-25 under the approved backup-retention window. An ephemeral CI schema export remains different from a customer-data backup. The `jotrip-trip` diagnostic now performs token verification and D1 identity checks automatically, with schema-only export available on manual workflow dispatch to avoid unnecessary repeated exports.

Official command reference: https://developers.cloudflare.com/d1/wrangler-commands/
Official export reference: https://developers.cloudflare.com/d1/best-practices/import-export-data/

## Credential handoff for this repository only

The correct GitHub repository is `kenzuko/jotrip-trip`, Worker `jotrip-trip`, D1 binding `DB`, database `jotrip-trip-db`, and reviewed config UUID `17372bb5-7626-4238-8a95-fc0cf31ad18e`. Do not substitute JoTrip Quote's database.

The GitHub Actions workflow `Cloudflare D1 read-only preflight` already exists on `feat/living-trip-v2-20260926`. It accepts a repository Actions secret named `CLOUDFLARE_API_TOKEN` (or `CF_API_TOKEN`) and either an Actions secret `CLOUDFLARE_ACCOUNT_ID` (or `CF_ACCOUNT_ID`) or a nonsecret repository variable `CLOUDFLARE_ACCOUNT_ID`. GitHub does not automatically share the similarly named secrets from `jotrip-home` or `Jotrip-Lab`.

The token needs only the Cloudflare permissions required for read-only D1 metadata, migration history and schema export. Do not paste a token into chat, commit it, or attach it as a workflow artifact. The credentials are now present and support D1 metadata, migration listing and read-only queries. The export endpoint rejects the current account-owned token even though a separate existing user-owned token successfully exports the same database. Do not change permissions on speculation. When a specific fix is ready, run `Actions > Cloudflare D1 read-only preflight > Run workflow` on the V2 branch. This workflow is read-only and does not back up customer data, apply migrations or deploy.

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

Only after the correct account and database ID are verified. The verified 2026-09-26 backup checkpoint is recorded above; these commands describe the procedure for creating a fresh pre-migration export when required:

```sh
npx wrangler d1 export jotrip-trip-db --remote --output=./jotrip-trip-backup-YYYYMMDD-HHMM.sql
```

The export contains **real customer contacts and trip details**. Keep it in an access-restricted encrypted location, not GitHub, chat, screenshots, CI artifacts or public storage. Verify file size and restore feasibility in an isolated local test database. Record a D1 Time Travel bookmark if available. An export alone is not a tested recovery plan.

## C. Stop conditions

Do not apply any migration or deploy if the DB identity differs from `wrangler.jsonc`, if an unexpected schema or migration history appears, if no verified encrypted backup and isolated restore are available, if there is no rollback owner, or if a deployed Worker still relies on the old runtime schema in an incompatible way. If the required fresh export fails and there is no verified current checkpoint, stop.

Migration 0009 introduces authoritative trip sessions, turns and deletion tombstones. Migration 0010 formalizes booking leads, adds separate consent records and a minimal erasure audit. Migration 0011 adds the approved booking-lead retention lifecycle. Migrations 0009-0011 pass against actual local D1 in CI; 0009-0010 were also exercised on the separate synthetic preview D1. The live schema has been inspected read-only: six V2/booking tables are absent, the legacy chat table has 44 rows, and the migration ledger has zero records. Do not apply legacy migrations blindly.

### Read-only migration-ledger reconciliation review

The logged audit found **0** rows in `d1_migrations`, and Wrangler reports `0000-0011` as pending. The production schema nevertheless matches `0000_bootstrap_all.sql` across the 17 legacy application tables (columns, defaults, foreign keys and indexes); the bootstrap file contains the baseline DDL from `0001-0004`. The schema comparison and backup checkpoint are recorded in [the PR discussion](https://github.com/kenzuko/jotrip-trip/pull/6#issuecomment-5846845948).

| Migration range | Effect reviewed in this branch | Required check before any live run |
|---|---|---|
| `0000-0004` | Baseline table/index creation uses `IF NOT EXISTS`; those objects already match the recorded bootstrap schema. | Reconfirm the same database UUID and exact baseline schema. |
| `0005-0006` | Add pricing and hotel-rate columns with `ALTER TABLE`; these are additive and not included in the bootstrap schema. | Confirm every target column is still absent. A column added outside the migration ledger would make the migration fail. |
| `0007-0008` | Create watch-notification and destination-context tables. | Confirm those tables remain absent or exactly compatible. |
| `0009-0010` | Create V2 trip state, booking leads, consent and erasure-audit tables. | Recheck for a runtime-created `booking_leads` table and inspect its exact schema and rows before applying. |
| `0011` | Adds lead-lifecycle fields, backfills `last_contact_at`, adds indexes and creates the expired-leads view. | Repeat the rehearsal on a fresh restore of the full backup; the recorded backup rehearsal covered `0005-0010`, while `0011` was added later. Preserve any lead rows discovered by the fresh check. |

If the fresh checks still match, the candidate is the complete pending sequence `0000-0011` in numeric order through Wrangler, so the migration ledger records the same work that was applied. Do not manually insert migration-ledger rows or skip older entries. This is a read-only review, **not authorization to run it**. Stop if any schema, table, column or row-count assumption differs. A live run still requires the fresh backup/restore rehearsal, an agreed rollback owner, confirmation of recovery-key custody and explicit production approval.

## D. Controlled preview only (future, requires approval)

1. Review read-only output and backup with the owner. Resolve legacy migration drift rather than blindly running every pending migration.
2. **Completed:** a separate preview D1 contains synthetic data; migrations 0000 and 0005-0010 were applied there, and the V2 SQL regression passed. Migration 0011 is covered against actual local D1 in CI; do not infer remote deployment readiness from those SQL fixtures.
3. Before any separately approved preview Worker deployment, set `INTERNAL_API_TOKEN` and a **different** `LEAD_ADMIN_TOKEN` as preview Worker secrets. Never place them in the repository or expose them to the browser.
4. A future preview Worker check still needs to test Worker-to-D1 concurrency, retry, session restore, deletion/tombstones, separate lead consent and staff erasure. Test mobile WebKit on an actual iPhone.
5. After explicit production approval and a verified rollback plan, apply only reviewed migrations and deploy. **No DNS, CMS, Weather, Airport or Transit changes** are part of this scope.

This runbook intentionally does not include a ready-to-run remote `migrations apply` or `deploy` command: schema reconciliation and explicit approval come first.
