# JoTrip Living Trip V2 - implementation lock (26/09/2026)

Status: isolated preview branch. NOT production-ready. Do not merge or deploy until the original recovery branch is available and reconciled.

## Product direction locked with owner

Text-first conversational trip planning with a responsive Living Canvas. The conversation is the control surface for trip discovery, evidence-backed comparisons, an editable itinerary and eventual human booking handoff. Voice is deliberately deferred. Reuse approved JoTrip logo and eight HD mascot assets; do not redraw. Use real licensed, geographically accurate Phu Quoc photography when approved assets are available.

## Implemented in this isolated V2 foundation

- Interactive welcome story cards: family, island exploration, relaxed stay. Each starts the existing conversation pipeline; custom text remains available.
- Contextual Trip Pulse: displays the trip facts and, when available, two real planning directions from the existing engine. Tapping an area selects the existing decision card; it does not invent routes or book anything.
- Responsive CSS illustrations only, explicitly decorative and not geographic maps. No third-party stock image hotlinks, no new asset licensing risk, no heavy animation or dependencies.
- Voice switch hidden in V2; no voice API call unless legacy voice is explicitly re-enabled in a later phase.
- Optional Workers AI binding with the active @cf/meta/llama-3.1-8b-instruct-fast model. Inference is OFF by default via AI_INTERPRET_ENABLED=false.
- Workers AI can extract at most three allowlisted qualitative signals for a sufficiently detailed natural-language message. It cannot change days, dates, people, price, availability, route or booking consent. Contact-like messages are excluded; malformed output and model errors fall back to the deterministic parser.
- Existing modular-monolith React + Worker + D1 design preserved. No migrations or external product changes.

## Current legacy type debt

A full `npx tsc --noEmit` on the pre-recovery branch currently fails on existing React turn-array inference, `Response.json().catch(() => ({}))` union typing and multiple legacy Worker request bodies. Adding Cloudflare Worker/Vite ambient types exposed this existing debt. The V2 CI therefore performs strict scoped typecheck on new `LivingCanvas.tsx` and `aiIntent.ts`, plus the full repository test suite, Vite build and Wrangler dry-run. This is NOT a claim that the entire old source typechecks. Reconcile and fix the legacy type debt when the original recovery branch arrives.

## Blocking recovery work

The earlier Work session reported recovery commits 3eead1c and 8400ae4633362b4e6c6ca10ceebdcb88f93db609 on recovery/trip-engine-worktree-20260924. That branch is not available remotely as of this work. Missing worker/tripTurn.ts and migrations 0009-0015 prevent safe end-to-end session restoration, idempotent turns, itinerary persistence and production deploy.

The current older /api/trip/parse logs the initial deterministic assistant reply, while the browser may display a later advisor/build reply. This mismatch must be resolved by the restored server-authoritative tripTurn path before production.

## Next engineering gates

1. Obtain original recovery branch without force-push, reconcile and port V2 changes. Preserve approved mascot/logo and source.
2. Server-authoritative single trip turn with clientTurnId idempotency, correction semantics, exactly-once persisted displayed reply and reload/cross-device recovery.
3. Connect Living Canvas to the server's canonical trip state. Only then allow structured remove/change actions, saved itinerary and undo. Do not fake a save in local state.
4. Add real licensed destination photos and a geographically accurate map. Only show route minutes with evidence, date/freshness and uncertainty.
5. AI evaluation: 30-50 natural conversations across target languages. Require a production rate limiter, daily inference budget, data processing disclosure and abuse controls before enabling AI_INTERPRET_ENABLED.
6. Browser QA on mobile 390x844 and desktop, keyboard/safe-area/reduced-motion, chat-to-visual synchronization, empty/no-DB and AI-quota fallbacks.
7. Inspect remote D1 migrations, Cloudflare Worker and domain routing with authenticated access; deploy only jotrip-trip after rollback preparation. Do not change CMS, Weather, Airport or other workers.

## Safety and cost

No AI is required for clicking, opening cards, comparing existing choices or viewing an itinerary. AI is opt-in and disabled in config; when enabled it only extracts bounded qualitative travel signals. The Cloudflare Workers AI binding and model identifier follow Cloudflare documentation, including its May 2026 model deprecation notice: use the -fast variant, not deprecated @cf/meta/llama-3.1-8b-instruct. Free-tier limits are shared across the account and are not a promise of zero cost at arbitrary traffic.

No production data, D1 migrations, DNS or Worker deploy is authorized by this branch alone. This branch is an incremental preview implementation, not a claim that all eight approved mockup screens are finished.
