# JoTrip Trip - safe synchronization gate (24 September 2026)

This branch is an **immutable-source review starting point**, not a replacement for the missing local engine working tree. It was created from `fix/chat-continuity-safe-20260924` at `6f8485c53d9f1afd5a84dc7a608add678133d501`, itself based on `main` at `a5939b2245f77a163cf75bc416cd80a3858a2474`.

## Available on this remote branch
- Short conversational acknowledgements do not rebuild itineraries or repeat the previous recommendation.
- The active chat transcript is the only surface for assistant replies. The approved mascot remains in the compact composer, no asset binaries changed.
- Voice is opt-in and uses only natural TTS; duplicate rapid sends and UI network errors are guarded.
- Parser and Worker route integration tests; a mocked mobile visual test covers welcome, question, thinking, advice, comparison, and voice in Chromium 320x700 and WebKit 390x844.
- GitHub Actions run https://github.com/kenzuko/jotrip-trip/actions/runs/35946854390 : test/build PASS and mobile-visual PASS for this branch's ancestor/source commit. These are fixture-backed tests, NOT live iPhone QA.

## Still held only in the earlier Work working tree, not accessible on GitHub
Handoff reports local branch `codex/engine-01-context-intent` at `31d4cbdbcaf172265727a8f356d0b469be5456c8` with uncommitted `worker/tripTurn.ts`, trip-context engine, session/itinerary, Clerk, desktop rail, logo/mascot-related changes, D1 migration files 0009-0015 and tests. The historical commit itself was also not found on GitHub when checked on 24 September 2026.

**Do not treat this staging branch as a full engine restore or merge it over the older uncommitted files.** In particular, the older local server-authoritative, idempotent `tripTurn` implementation must take precedence over the fallback short-ack path in this remote branch where both implement the same behavior.

## Safe reconciliation when the missing working tree becomes available
1. In the original Work workspace, inspect and record `git status`, `git diff --binary`, `git diff --cached --binary`, and all untracked files. Preserve these outside the repository before any integration. No reset, stash, blanket commit, forced push, or asset overwrites.
2. Fetch `origin/sync/trip-workingtree-review-20260924`. Use a **separate clean review worktree** or independent clone to compare the source trees before attempting a merge. Do not checkout the active dirty branch away.
3. Reconcile conflicts deliberately in `worker/scenario.ts`, `worker/index.ts`, `src/App.tsx`, `src/styles.css`, `src/types.ts`, and tests. Preserve the original local engine's trip/session context, D1 migrations 0009-0015, auth implementation and eight SHA-256 locked mascot assets. Avoid carrying forward the remote `/api/trip/parse` provisional chat logging if the local `tripTurn` now commits the final visible answer.
4. Run the original 46 unit + D1 integration suite and the new regression/visual checks against **the merged source**, including clientTurnId retry, short-ack continuity, correction, reload, keyboard safe area and logo/mascot integrity.
5. Only then review remote D1 schema and pending SQL for `jotrip-trip-db`, resolve least-privilege Cloudflare authorization, and deploy/test the dedicated JoTrip Trip Worker and `trip.jotrip.vn`. No changes to CMS, Weather or Airport.

## Deployment status
Not merged to `main`; no remote D1 migrations or custom-domain changes were made in this sync step. `trip.jotrip.vn` has not been verified with this source.
