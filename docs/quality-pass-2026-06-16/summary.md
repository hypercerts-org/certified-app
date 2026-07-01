# Quality pass — 2026-06-16 — summary

Autonomous multi-round review + fix of the last 3 days of merged work on `certified-app` (review base `b6e2a15` → `staging` @ `0bc8c88`, 28 commits / 87 files). Branch: `chore/quality-pass-2026-06-16`. Draft PR into `staging`.

## Process

1. **Review (workflow):** 7 dimension reviewers (security, performance, correctness, code-quality, design-system, accessibility, react-ts) → 31 findings, each adversarially verified → **29 confirmed**, 2 dropped as false positives.
2. **Plan + plan review (workflow):** 4 reviewers (spec-correctness, autonomy-risk, sequencing, skeptic) critiqued the plan against the real code; near-total convergence. Key corrections integrated: keep the magic-indexer #214 server-filter scaffolding (don't remove); use the safe cache-coalesce for the N+1 (not the prop-rewrite); add a dropped finding; defer browser-only a11y/perf items.
3. **Implement:** 8 tracks, sequential, one commit per logical group (15 commits).
4. **Implementation review (workflow):** 3 reviewers on the committed diff → 6 confirmed, **all nit-level, 0 blockers, 0 regressions** → cleanups applied (1 more commit). Converged — no second round needed.

## Verification (final)
- `tsc --noEmit`: **0 source errors** (6 generated `.next/` errors ignored, same as baseline).
- `npm run lint`: **0 errors, 65 warnings** (baseline 64 + 1 intentional `set-state-in-effect` from the tour resize-clamp).
- `npm run build`: **compiled successfully**.
- Tests: **641 pass / 87 files**, incl. **20 new** `matchesConfirmedBy`/`confirmRoleBucket` cases.
- CLAUDE.md first-checks (radii / breakpoints / headings / modal backdrops): **all silent**.

## Fixed (this branch)

**Security**
- `/api/ens` now IP-rate-limited (100/min, fail-open) — was the only third-party read proxy without one.
- ENS avatar protocol gate mirrored client-side (defense-in-depth).

**Performance**
- `useActivity` cache + in-flight coalescer kills the per-row funding `getRecord` N+1 (+ `invalidateActivity` on edit so no stale reads).
- Memoized the funding "Confirmed by" filter in `ResultsArea`.
- rAF-coalesced the tour spotlight reflow.

**Correctness**
- **Default "Confirmed by" filter now shows every counted receipt** (was hiding third-party-only / unattested receipts while the count still included them — see "Needs your call").
- Tour step clamped on viewport-crossing-800px so the card can't vanish.
- `useUserActivityCount` no longer flashes the previous profile's count.
- View-transition backstop can't strand or cross-resolve a superseded transition.

**Code quality / reuse**
- Extracted: `parseFundingReceiptsResponse`, `HydratedIdentityRow` (4 sites), `toLabelArg` (4 sites), `useCopyToClipboard` (4 sites, with timer cleanup).
- Removed dead `kindChips()`; documented the dormant #214 server-filter; hoisted the repeated Confirmed-by control; indexer hygiene (`forCid` doc, dropped a redundant cast).

**Accessibility**
- Confirmed-by popover: `role="group"` + focus-into-popover on open + `aria-labelledby` section groups (additive `role` opt-in on the shared `ui/popover.tsx`, byte-identical for existing menu consumers).
- Mobile icon chrome buttons get a real 44px touch target (layout-neutral pseudo-element).

**React/TS**
- Memoized `ViewTransitionProvider` context; `"use client"` on `use-scroll-top-on-tab-change`.

## Needs your call (NOT decided autonomously)
1. **correctness-1 semantics** — I made the default Confirmed-by filter show *all* receipts so the list matches the count (the bug was a 12-count over an empty list, since prod data is currently all third-party-only). Confirm this is the intended default. The narrowed-selection behavior is unchanged. *(Own commit `78bc2e4`; revertible in isolation.)*
2. **correctness-2** — the server-side `confirmedBy` filter is dormant scaffolding for magic-indexer #214. **Kept + documented** (not removed). Decide if/when to wire or drop it.
3. **accessibility-1** — the funding-row `role="button"` + nested-links re-architecture is **deferred** (needs a browser + AT smoke test; current state is functional, the defect is ARIA-conformance only).
4. **accessibility-4** — the tour's `aria-modal` background isn't inerted; **documented** in code why (no clean app-root sibling; risks the toast/live-region portals). Needs a stable wrapper + AT check.
5. **performance-3** — All-view preview page-size cap **deferred** (needs tuning against real data; over-fetch is on already-parallel fetches).

## Follow-up opportunities (out of scope, noted)
- The Quality/Sort `/explore` popovers contain checkboxes under `role="menu"` (same pattern accessibility-2 fixed). The new `role="group"` opt-in makes this a clean follow-up.
