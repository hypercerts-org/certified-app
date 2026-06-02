# Round 2 — Delta from Round 1

## Baseline (round 2 start)

- Branch: `feat/positioning-redesign`
- HEAD at round-2 start: `26086be`
- Round-1 baseline: `ff5f24ad` (round 1 ended at `393134d`)
- Commits between round-1 end and round-2 start: 145
- Diff: 161 files changed, +17.4K lines, -1.1K lines

## Verification baseline

| Gate | Round-1 end | Round-2 start |
|------|-------------|---------------|
| `tsc --noEmit` errors | 0 | 0 |
| `eslint` errors | 0 | **5** (regression) |
| `eslint` warnings | 55 | 59 |
| `next build` | pass | pass |
| `vitest` tests | 157 passing | 215 passing |

Round-2 takes a hit on the lint baseline: 5 new errors landed in the
145 intervening commits. Triaged:

- `src/hooks/use-click-outside-close.ts:35` — `react-hooks/Error: Cannot
  access refs during render`. The ref-write-during-render pattern I
  added in Pass 9 (writing `onCloseRef.current = onClose` at the top
  of the hook body, outside an effect) is the wrong shape for React
  19. Should move into a `useEffect` or `useEvent`-style pattern.

- `src/hooks/use-explore.ts:318` × 4 — `react-hooks/preserve-manual-
  memoization "Compilation Skipped: Existing memoization could not be
  preserved"`. The react-compiler caught real issues with the
  `useExplore` hook's memoization shape — fragile manual memos that
  the compiler can't safely transform.

Both are real-fix candidates; promoting to Tier 1 for this pass.

## Round-1 deferred-item triage

| Item | Round-1 decision | Round-2 check | Decision |
|------|------------------|---------------|----------|
| `loadDraft` (swap-drafts.ts) | Keep — half of pending feature | Still 0 importers; pending feature still pending | **Keep deferred** — same rationale |
| `clearRecentlyViewed` | Keep — symmetric lib API | Still 0 importers | **Keep deferred** — same rationale |
| T11 `pickAllowedFields<T>` generic | Tier-2 declined | Same | **Keep declined** |
| T15 PDS URL builders | Tier-2 declined (2 sites) | Same | **Keep declined** |
| Q-2 `safeRedirect` doc drift | Skipped — doc fix for human | Still drift; `safeHttpUrl` is the live helper | **Drop from this audit** — out of scope (AGENTS.md doc, not code) |
| Q-4 700–1200 LOC files | Skipped — judgement-heavy | Some new ones added (`profile-lists.tsx` 1450 LOC) | **Keep deferred** — judgement-heavy, user-driven |
| Q-1 55 pre-existing lint warnings | Skipped — judgement-heavy | Now 59 warnings + 5 errors | **Partial pickup** — fix the 5 errors (regressions); keep the warnings deferred for the same reason |
| `extractError` / `extractRouteError` rename | Skipped — aesthetic | Same | **Keep declined** |
| R-10 actor-profile string-constant extraction | Skipped — desync risk | Same | **Keep declined** |
| T-1 `orbiting-logos.tsx` non-null assertions | Skipped — timing-sensitive | Same | **Keep declined** |
| T-4 Tiptap storage casts | Skipped — fragile typing | Same | **Keep declined** |
| N-7 `readableFoundedDate` move | Skipped — small net value | Same | **Keep declined** |
| `use-onboarding-commit.ts` co-location | Skipped — cohesion wins | Same | **Keep declined** |

## Round-2 dimensions widened (vs round 1)

Per the brief, these were either skipped or surfaced as observations
in round 1. Round 2 attacks each in earnest:

1. **Test coverage gaps** — which exported behaviors in `src/lib/`
   have zero tests, especially the new round-1 extractions
   (`asBlobRef`, `extractRecordRef`, `useMounted`, `formatMonthYear`,
   `getInitials`, `xrpcGetRecordPath`, `redactSecrets`,
   `formatShortDate`) + everything added since (`useRemoveAction`,
   `useUrlParam`, `useClickOutsideClose`, `useEvaluatorEndorsements`,
   `parseSubjectInput` — already has tests, etc.).

2. **RSC / server-client boundary cleanup** — misuse of `"use client"`,
   server-only modules pulled into client bundles, dynamic imports
   that should be static.

3. **State management patterns** — duplicate caches, prop-drilling
   ≥2 levels, context overuse, refs-during-render (the use-click-
   outside-close.ts issue above is one).

4. **a11y in earnest** — semantic HTML, focus management, keyboard
   nav, contrast risks in the redesign tokens.

5. **Bundle / dependency analysis** — unused deps, oversized deps with
   smaller alternatives, duplicate transitive versions.

6. **Error + loading state systematic coverage** — every route, every
   async boundary.

7. **Prop API consistency** — across the redesign-era components
   (the recently-extracted shells: `ExploreListRow`, `AppDialog`,
   etc.).

## What round-2 is NOT going to do

Same hard rules as round 1 plus:

- Will not merge any PR. Round-2 commits go directly to
  `feat/positioning-redesign`.
- Will not change lexicons. Lexicons are read-only.
- Will not touch `next.config.ts`, `package-lock.json`, `.env*`.
- Will not change auth surface area.
- Will not refactor any of the 700–1200 LOC files structurally —
  same judgement-heavy carve-out as round 1.
- The 8h time budget in the brief is the ceiling for an unattended
  overnight run; the round-2 actual run is bounded by what's worth
  shipping while staying coherent.
