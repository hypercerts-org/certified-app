# Performance & code-quality pass — certified-app (2026-07-12)

Rewritten, executable version of: *"do a full review and refactor of the staging
branch of certified-app. you define what's important to improve, but focus mainly on
performance and code-quality. open a PR to staging with all improvements (don't defer
anything) and make sure the CI is green. You have 8 hours."*

## Mission

Review the certified-app codebase with **performance and code quality as the primary
lenses**, then implement **every confirmed finding** — the previous pass's "defer and
document" escape hatch is explicitly off the table. Work lands on branch
`perf/quality-pass-2026-07-12` (cut from `staging` @ `6dd73dd`), one commit per
logical track, and ships as a **Draft PR into `staging`** with all CI checks green.
Time budget: 8 hours wall clock.

## What is already done (do NOT re-find)

The 2026-06-16 quality pass and the 2026-07-02 full review already landed (see
`docs/full-review-2026-07/`): TipTap behind `next/dynamic`
(`leaflet-editor-dynamic.tsx`), force-graph/map/org-settings/settings-panel lazy,
explore + endorsement + activity row memoization, navbar context split
(values/setters), project-item batch fetch via indexer, stale `loadMore` aborts,
paginated-activity dedupe, SSRF hardening + redirect blocking, per-target unlock
throttle, `/embed` frame-header carve-out, OG metadata caching, ENS rate limiting,
`useCopyToClipboard` extraction, `useActivity` cache+coalescer, rgba→token sweep of
scrims, dead-export removal.

## Verified baselines (branch @ 6dd73dd)

- `npx tsc --noEmit` — clean. `npm run typecheck:test` — clean.
- `npm run lint` — **63 warnings, 0 errors**: 54× `react-hooks/set-state-in-effect`,
  6× `@next/next/no-img-element`, 2× `react-hooks/exhaustive-deps`, 1 autofixable.
- `npm test` — **1024/1024 pass** (119 files, ~20 s).
- CI (`.github/workflows/ci.yml`): lint → tsc → typecheck:test → vitest. No build
  step in CI, but `npm run build` must also stay green (Vercel deploys it).
- Largest files: `activity-detail.tsx` 2307, `explore.tsx` 2131,
  `api/indexer/route.ts` 1817, `use-explore.ts` 1586, `project-detail.tsx` 1504,
  `profile-endorsements.tsx` 1477, `profile-lists.tsx` 1433, `atproto/indexer.ts` 1385,
  `home-feed.tsx` 1372, `activity-edit-route.tsx` 1309.

## Explicitly in scope (inherited debt — the previous pass deferred these; we don't)

1. **`waterfall-hyperboard-displayprofile`** — serial two-stage resolver round-trip.
2. **`cache-indexer-proxy-no-shared-cache`** — cacheable GET variant / `s-maxage`
   for hot indexer-proxy reads (design a safe, read-only subset).
3. **`ds-zindex-literals`** — re-tokenize the ~18 literal z-index rules (`--z-*`).
4. **`ds-error-focus-ring-rgba`** — tokenize the error focus ring rgba.

## Review dimensions (one reviewer each, read-only, file:line evidence, concrete fix,
severity high/med/low, effort S/M/L, regression risk low/med/high; cap 14/dimension)

1. **perf-render-explore** — `explore.tsx`, `use-explore.ts`, `home-feed.tsx`,
   explore-page components: re-render hotspots, unstable props/identities, sort/filter
   in render body, list growth without virtualization, state colocations.
2. **perf-render-detail** — `activity-detail.tsx`, `project-detail.tsx`,
   `profile-*.tsx`, `endorsement-lists.tsx`: same lens on the detail/profile surfaces.
3. **perf-data** — `src/hooks/*`, `src/lib/atproto/*`: N+1s, request waterfalls,
   missing dedupe/coalescing, cache misuse, refetch storms, the hyperboard waterfall.
4. **perf-server-cache** — `src/app/api/**` (esp. `indexer/route.ts` 1817 lines,
   `xrpc/[...method]`): per-request recomputation, missing cache headers on safe
   public GETs, sequential upstream calls that could be parallel, response-size waste.
5. **lint-triage** — ALL 63 warnings, exhaustively: for each, classify
   {latent-bug | fixable-cleanly | legitimately-suppress-with-comment} and give the
   concrete fix (derive-during-render, key-remount, event-handler move, effect merge).
   No cap. The goal is lint = 0 warnings or each survivor individually justified.
6. **cq-duplication** — copy-pasted fetch/parse/format/state logic across
   components+hooks that should be shared helpers; near-identical components that
   should collapse into `src/components/ui/` primitives; dead code/exports/CSS.
7. **cq-decomposition** — the 10 giant files: find the *clean seams only* (extract
   child components with narrow props, split route handler by concern, hook fission
   where state clusters are independent). Decomposition must be
   behavior-preserving and mechanically verifiable; no speculative rewrites.
8. **cq-types-errors** — `any`/unsafe casts on external-data boundaries
   (indexer/PDS/CGS responses), swallowed errors (`catch {}`), unguarded
   `JSON.parse`, missing narrow types on shared helpers.
9. **next-arch** — client/server boundaries: pages that are `"use client"` but could
   be RSC, data fetched client-side that a server component/route could deliver,
   metadata gaps, route-handler validation/error-shape consistency, `next.config.ts`.
10. **ds-conformance** — the five CLAUDE.md grep checks + z-index literals +
    remaining raw colors outside sanctioned files + shadow/radius/breakpoint drift.

## Hard constraints (violations are findings; do not introduce new ones)

- `border-radius`: only `var(--radius)` / `999px` / `50%`. Breakpoints 800/1100/1300.
  No raw hex/rgb outside `tokens.css`+`landing.css`. Shadows/z via tokens. Headings
  `text-h1..h4` + `font-headline`. Modals via `<AppDialog>`. Icon buttons
  `<Button size="icon" aria-label>`. Dark mode must keep working. Desktop ≥1300 px
  visual baseline unchanged unless fixing a confirmed defect.

## Verification protocol

Every finding goes to an adversarial skeptic (high severity: two skeptics —
reachability + impact; med/low: one). The skeptic reads the actual code at the cited
lines and tries to refute existence, reachability, or worth. Only confirmed findings
are implemented. For decomposition findings the skeptic instead validates the seam:
props countable, no hidden shared mutable state, split testable.

## Implementation rules

- **Nothing confirmed gets deferred.** If a finding is confirmed but the proposed fix
  is wrong, fix the fix — not the scope.
- Tracks with **disjoint file ownership**; one commit per track; conventional scope
  tags; no emojis anywhere.
- Refactors of tested code keep tests green *unmodified* where possible; tests may
  only change when an internal API they touch changes shape, never to weaken an
  assertion. Behavior-preserving decomposition must not change rendered output.
- New shared helpers get unit tests. Lint-warning fixes must not trade a warning for
  a behavior change (each fix category verified by the existing suite + targeted
  manual reasoning recorded in the plan).

## Gates (before every commit, and finally in CI)

`npx tsc --noEmit` clean · `npm run typecheck:test` clean · `npm run lint` **strictly
fewer than 63 warnings, zero new rules** · `npm test` ≥1024 passing, 0 failing ·
`npm run build` green · five CLAUDE.md grep checks silent.

## Deliverables

1. `docs/perf-quality-2026-07-12/prompt.md` — this document.
2. `docs/perf-quality-2026-07-12/findings.md` — all findings + verdicts.
3. `docs/perf-quality-2026-07-12/plan.md` — executed track plan (ownership, commits).
4. `docs/perf-quality-2026-07-12/review-round-1.md` — plan/impl review decisions.
5. Draft PR `perf/quality-pass-2026-07-12` → `staging`, CI green, not merged.
