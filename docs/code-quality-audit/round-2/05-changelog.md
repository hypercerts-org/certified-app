# Round 2 — Changelog

Branch: `feat/positioning-redesign`
Baseline SHA (round 2 start): `26086be`
Commits made in round 2: 4 (1 docs + 1 Tier 1 batch + 2 Tier 2 commits).

| # | SHA | Type | Track(s) | Summary |
|---|-----|------|----------|---------|
| 1 | (this dir) | docs | n/a | Round-2 scaffold: delta, inventory, findings, plan v1→v3 |
| 2 | `048bd33` | refactor + feat | T01, T02, T03, T04a, T05, T06, T07–T09, T19 | Tier 1 batch: clear all 5 lint regressions, segment error boundaries on 4 routes, restore-focus on AppDialog, drop `"use client"` from 2 pure components, popover Escape, +33 unit tests for `parseActivityUri` / `getInitials` / `useUrlParam` |
| 3 | `e94a635` | chore + test | T10, T13, T18 | Tier 2: extractAwardSubjectDid tests (+14), LinkDialog onCancel → onClose rename, useFollowing cache-invalidation contract docs |
| 4 | `0e10d0b` | test | T16 | swap-drafts round-trip + computeDirtyFields tests (+17) |

## Aggregate impact

### Lint baseline

| | Round-2 start (26086be) | After all tracks |
|--|------------------------:|------------------:|
| `tsc --noEmit` errors | 0 | 0 |
| `eslint` errors | **5** | **0** |
| `eslint` warnings | 59 | 58 |
| `next build` | pass | pass |
| `vitest` tests | 215 | **281** |

### What changed

- **+66 tests** across 5 new test files (`activity-uri`, `initials`,
  `use-url-param`, `badges/extractAwardSubjectDid`, `swap-drafts`).
- **5 lint errors → 0**. All five were regressions from the
  intervening 145 commits since round 1 ended.
- **2 React 19 violations** fixed at the source pattern (ref writes
  during render in `useClickOutsideClose` and `src/app/create/page.tsx`).
- **1 React Compiler memoization issue** fixed in `useExplore` —
  the closure now declares all captured variables in its dep list.
- **4 segment error boundaries** added (/home, /explore,
  /profile/[handle], /endorsements) + 1 shared fallback component.
- **2 RSC corrections**: dropped `"use client"` from pure
  presentational wrappers (cert-icon, loading-spinner).
- **1 a11y win**: AppDialog now restores focus to the previously-
  focused element on close.
- **1 a11y win**: explore-page Popover responds to Escape.
- **1 prop-API consolidation**: LinkDialog onCancel → onClose,
  aligning with AppDialog / other modals.
- **1 cache-invalidation contract** documented (`useFollowing`).

### Verification

- Every commit passed `tsc --noEmit`, `eslint`, `vitest`, `next build`.
- No regression on any gate at any point.
- The lint count fell because all 5 round-1-baseline regressions
  resolved; the single warning that dropped (59→58) was a secondary
  benefit of the useExplore dep-list cleanup.
- The test count rose by 66 (215 → 281).

## Top 5 wins

1. **Lint errors → 0.** Five regressions cleared. The two React 19
   ref-during-render violations were latent bugs; the four React
   Compiler errors were the compiler refusing to preserve manual
   memoization because of incomplete dep lists — fixed at the
   source.

2. **Segment error boundaries.** Async-data failures on /home,
   /explore, /profile/[handle], /endorsements now show a
   context-aware fallback instead of falling through to the
   generic root error page. Each segment has a retry button.

3. **Test floor for round-1 + round-2 extractions.** `getInitials`,
   `parseActivityUri`, `useUrlParam`, `extractAwardSubjectDid`,
   `swap-drafts` were all carrying real edge cases (M1 empty-string
   semantics, three union shapes, three input flavours, dirty-
   field semantics) with zero coverage. Now 66 cases protect them.

4. **First hook tests in the repo.** The `useUrlParam` test
   (12 cases) is the first hook test ever landed. Establishes
   the mock-`next/navigation` pattern that the next hook tests can
   reuse.

5. **AppDialog focus restoration.** Closing a modal returns
   keyboard focus to whatever opened it, matching native dialog
   expectations. A small fix with big real-world impact for
   keyboard-only users.

## Reverts

None. All commits remain in history.

## What's NOT done

See `06-deferred.md`. Headline items intentionally skipped or
re-deferred:

- AppDialog Tab-cycle focus trap (real trap, not just restore).
- saveWithSwap test — big mocks needed.
- ensureEndorsementDefinition test — Web Locks scenarios are heavy.
- URL-driving home-feed filter state — fine in theory but the
  include/exclude tier dance needs careful round-trip testing.
- Dropping `@tabler/icons-react` — investigation only; Lucide may
  not have an equivalent cert/seal icon and the visual baseline
  matters.
- Refactor the 700–1200 LOC files — judgement-heavy, user-driven.
- 49 `react-hooks/set-state-in-effect` warnings — same.
- 10 `@next/next/no-img-element` warnings — same.
