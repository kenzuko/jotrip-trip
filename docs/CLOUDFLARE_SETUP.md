# Cloudflare setup - JoTrip Trip

## Current deployment state (27 September 2026)

Living Trip V2 remains an isolated draft PR and has not been deployed as a Worker. The production D1 was inspected read-only. Its legacy schema and zero-entry migration ledger need reconciliation before any live migration. The full production export was encrypted, stored off-platform, downloaded/decrypted and restored in isolated SQLite on 2026-09-26; integrity and the 44 existing chat messages were verified. A separate preview D1 contains synthetic data only and passed SQL regression for the previously applied migrations 0000 and 0005-0010. Production D1 and Worker remain unchanged.

See [the remote D1 preflight and backup runbook](LIVING_TRIP_V2_REMOTE_D1_PREFLIGHT.md). Do not apply migrations 0000-0011 blindly. Before any production mutation, reconcile the migration ledger, confirm owner custody of the recovery key, review a rollback plan and obtain explicit approval.

## Workers Builds settings

The dashboard currently shows:

- Build command: `npm run build`
- Deploy command: `npm run deploy` (`package.json` runs `wrangler deploy`)
- Version command: `npx wrangler versions upload`
- Root directory: `/`
- Production branch: `main`
- Builds for non-production branches: disabled

`wrangler versions upload` uploads a new Worker version without deploying it. It is useful when testing a version URL separately; ordinary deployment is handled by the deploy command. Cloudflare documents the distinction in its [versions and deployments guide](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/).

Do not enable preview builds for this draft branch or treat a successful build as approval to migrate D1 or deploy a Worker. If a preview Worker is separately approved later, set its secrets and test the real Worker-to-D1 flow before considering production.

## D1 binding and migration safety

The production database is named `jotrip-trip-db`, bound as `DB`, and its database UUID is present in `wrangler.jsonc`. Do not replace it with a different JoTrip database.

Wrangler reports migrations 0000-0011 as pending even though the live database already has legacy application tables and 44 chat messages. Read the schema and the `d1_migrations` ledger before planning any migration. The isolated preview D1 SQL regression does not prove that a Worker can safely use the production schema.

## Runtime secrets

- `INTERNAL_API_TOKEN` protects internal analytics.
- `LEAD_ADMIN_TOKEN` protects staff-only lead lifecycle and erasure operations. Keep it separate from `INTERNAL_API_TOKEN`.

Set both as Worker secrets when required. Never commit or paste their values into chat. Do not reuse an anonymous browser session ID as staff authorization.

## Workers AI

Workers AI is not enabled for the V2 MVP. Keep deterministic parsing as the default and do not add an AI binding or paid inference without a separately approved budget and privacy gate.

## Domain

Keep testing on the workers.dev URL until routing is stable. No DNS or custom-domain changes are part of PR #6. When `trip.jotrip.vn` is ready for final routing, a CNAME target must contain a hostname only, never an `https://` URL.
