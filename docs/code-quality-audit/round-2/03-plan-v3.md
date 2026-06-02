# Round 2 — Plan v2 (post-critique-1)

## Tier 1 — must ship

| # | Track | Files |
|---|-------|-------|
| R2-T01 | Fix ref-during-render in `useClickOutsideClose` | `src/hooks/use-click-outside-close.ts` |
| R2-T02 | Fix `useExplore` memo + exhaustive-deps (add labels to deps; fix (a) from critique) | `src/hooks/use-explore.ts` |
| R2-T03 | Fix ref-during-render in `src/app/create/page.tsx` | `src/app/create/page.tsx` |
| R2-T04a | AppDialog focus save+restore | `src/components/ui/app-dialog.tsx`, `src/components/ui/__tests__/app-dialog.test.tsx` |
| R2-T05 | Drop `"use client"` from cert-icon + loading-spinner | `src/components/ui/cert-icon.tsx`, `src/components/ui/loading-spinner.tsx` |
| R2-T06 | Segment error boundaries (4 routes) | `src/app/{home,explore,profile/[handle],endorsements}/error.tsx` (new) + shared fallback in `src/components/ui/error-boundary-fallback.tsx` (new) |
| R2-T07-09 | Bundled tests: `parseActivityUri`, `getInitials`, `useUrlParam` | 3 new test files |
| R2-T19 | Explore popover Escape handler | `src/components/explore-page/explore.tsx` |

## Tier 2 — promote if time

| # | Track | Files |
|---|-------|-------|
| R2-T10 | Test `extractAwardSubjectDid` | `src/lib/atproto/__tests__/badges.test.ts` (new) |
| R2-T11 | Audit + extend `parseSubjectInput` tests | `src/lib/utils/__tests__/parse-subject-input.test.ts` |
| R2-T13 | Standardize prop API: `onCancel` → `onClose` on the two outlier modals | `src/components/profile/endorse-reason-modal.tsx`, `src/components/leaflet/link-dialog.tsx`, callers |
| R2-T14 | Surface error state in HomeFeed | `src/components/home/home-feed.tsx` |
| R2-T18 | Cache ownership docs | `src/hooks/use-following.ts`, `src/hooks/use-typed-lists.ts` |

## Tier 3 — investigate, may decline

| # | Track | Files | Notes |
|---|-------|-------|-------|
| R2-T12 | URL-drive home-feed filters | `src/components/home/home-feed.tsx` | Defer — explore-page convention exists; copy it carefully |
| R2-T15 | Drop `@tabler/icons-react` | `src/components/ui/cert-icon.tsx`, `package.json` | Investigate; ~43KB win if Lucide has a fit |
| R2-T16 | Test `swap-drafts` | `src/lib/utils/__tests__/swap-drafts.test.ts` (new) | Round-1 H11 follow-up |
| R2-T17 | Test `saveWithSwap` | `src/lib/atproto/__tests__/save-with-swap.test.ts` (new) | Big mocks; risky |

## Deferred to round 3

- T04b: AppDialog Tab-cycle focus trap (real trap, not just restore)
- 49 set-state-in-effect warnings
- 10 no-img-element warnings
- 700–1200 LOC file splits
- Test for `ensureEndorsementDefinition` (Web Locks scenarios are heavy to mock)
- Investigate `NotificationsContext` necessity
- HomeFeedBody prop drilling collapse

## Per-commit gate (every track)

- `npx tsc --noEmit` — 0 errors
- `npm run -s lint` — error count ≤ baseline (5 → goal: 0 by end of Tier 1)
- `npm run -s build` — pass
- `npm run -s test` — pass; tests added count up only

## Disjoint file ownership (parallel tracks may run)

- T01: `use-click-outside-close.ts` — leaf hook
- T02: `use-explore.ts` — leaf hook
- T03: `src/app/create/page.tsx` — leaf
- T04a: `app-dialog.tsx` + its test
- T05: `cert-icon.tsx` + `loading-spinner.tsx`
- T06: 4 new `error.tsx` + 1 new helper component
- T07-09: 3 new test files
- T19: `explore.tsx`

No two tracks touch the same file. Run in any order.
v3 = v2 (no structural changes after critique-2). Inline clarifications:

1. T01 uses useEffect for the latest-ref pattern.
2. T05 reverts per-file if RSC build catches an issue with the icon imports.
3. T19 verified before changes — fix only if real (the popover may already have Escape via useClickOutsideClose).
4. T13 includes caller-side TS sweep after rename.
5. T06 shared fallback signature: { title, message, onReset }.
