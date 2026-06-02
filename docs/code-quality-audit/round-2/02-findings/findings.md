# Round 2 — Findings (widened)

Source of each item: F# = derived inline from the lint baseline,
T# = test-coverage agent, S# = state/prop-API agent, R# = RSC/bundle
agent, A# = a11y/error-loading agent.

## F. Lint baseline regressions (5 errors, 59 warnings)

| # | Severity | Where | Issue |
|---|---------|-------|-------|
| F-1 | error | `src/hooks/use-click-outside-close.ts:35` | `react-hooks/Error: Cannot access refs during render` — `onCloseRef.current = onClose` is written at render time, outside a useEffect. React 19 disallows this. |
| F-2 | error ×4 | `src/hooks/use-explore.ts:318` | `react-hooks/preserve-manual-memoization "Compilation Skipped"` — react-compiler can't preserve the manual memo on `loadMore` because of stale-deps risk. |
| F-3 | warning | `src/hooks/use-explore.ts:302` | `react-hooks/exhaustive-deps` — useEffect missing `excludeCertLabels`, `excludeOrgLabels`, `includeCertLabels`, `includeOrgLabels` in deps. The effect uses string-form `excludeKey` / `includeKey` keys, but the captured raw labels are also read inside, so this is a real stale-closure risk. |
| F-4 | warning | `src/hooks/use-explore.ts:388` | Same as F-3 but on the `loadMore` useCallback. |
| F-5 | warning | misc components | 49× `react-hooks/Error: Calling setState synchronously within an effect`. Same cluster round-1 deferred — judgement-heavy. Defer again. |
| F-6 | warning | misc | 10× `@next/next/no-img-element`. Defer — each is a judgement call (sizing, blob URL constraints). |

## T. Test coverage gaps

| # | Severity | File / symbol | Why |
|---|---------|---------------|-----|
| T-1 | CRITICAL | `src/lib/atproto/save-with-swap.ts` — `saveWithSwap` | Retry loop, conflict detection, livelock guard. 4 inline-edit surfaces depend on this. Zero tests. |
| T-2 | CRITICAL | `src/lib/atproto/badges.ts` — `ensureEndorsementDefinition` | Web Locks + cross-tab dedupe state machine. Endorsement-issuance critical path. Zero tests. |
| T-3 | HIGH | `src/hooks/use-url-param.ts` | URL search-param state machine: replace vs push, defaultValue semantics, empty-string drop logic (the M1 fix in Pass 9). Heavily used across /explore, /profile. Zero tests. |
| T-4 | HIGH | `src/lib/atproto/badges.ts` — `extractAwardSubjectDid` | Three union shapes, defensive parsing, security-adjacent. Zero tests. |
| T-5 | HIGH | `src/lib/utils/swap-drafts.ts` — `computeDirtyFields` / `shallowEqual` | Exact-match dirty detection. 4 callers. Edge cases not tested. |
| T-6 | MED | `src/lib/atproto/activity-uri.ts` — `parseActivityUri` | Small but load-bearing for activity routing. Zero tests. |
| T-7 | MED | `src/lib/utils/sanitize.ts` — `sanitizeEmail` / `sanitizeHandle` | Security-sensitive for auth flows. Zero tests. |
| T-8 | MED | `src/lib/utils/initials.ts` — `getInitials` | Display-critical, easy to test. Round-1 extracted it; nobody added tests. |
| T-9 | OBSERVATION | systemic | **53 hooks, 0 hook tests.** Biggest gap. |

## S. State management + prop API

| # | Severity | Where | Issue |
|---|---------|-------|-------|
| S-1 | BUG | `src/app/create/page.tsx:25-31` | `arrivedFromInAppRef.current` is read AND written at component render scope. React 19 violation; will lint-error in due course. |
| S-2 | BUG | `src/components/home/home-feed.tsx` (HomeFeed) | `includedTiers` and `selectedEvaluators` state is local, not URL-driven. Filters can't be shared via link. |
| S-3 | NIT | `src/components/home/home-feed.tsx` HomeFeedBody | Prop-drilling: 8 props through a single intermediate that only destructures + forwards. |
| S-4 | NIT | extracted shells | Inconsistent callbacks: `onClose` vs `onCancel` across modals. Standardize on `onClose`. |
| S-5 | NIT | extracted shells | `title` vs `subjectLabel` naming inconsistency on dialog headers. |
| S-6 | NIT | extracted shells | `PreviewCard.meta: string[]` vs `ExploreListRow.metaItems: ReactNode[]`. Unify on `ReactNode[]`. |
| S-7 | OBSERVATION | `src/hooks/use-following.ts:26` + `src/hooks/use-typed-lists.ts:35-36` | Both have module-level caches but only typed-lists is plugged into the invalidation bus. Not a bug today; document cache ownership. |

## R. RSC + bundle/dependency

| # | Severity | Where | Issue |
|---|---------|-------|-------|
| R-1 | NIT | `src/components/ui/cert-icon.tsx` | `"use client"` is unnecessary — pure presentational wrapper around an icon library. Drop directive. |
| R-2 | NIT | `src/components/ui/loading-spinner.tsx` | `"use client"` is unnecessary — pure CSS animation. Drop directive. |
| R-3 | INVESTIGATE | `@tabler/icons-react` | Only imported in `cert-icon.tsx`. Consolidating to `lucide-react` saves ~43KB. |
| R-4 | KEEP | `@tiptap/pm` | Zero direct imports but it's a Tiptap peer dep. Don't remove. |
| R-5 | CLEAN | no server-only imports in client chains; no other bloat patterns. |

## A. a11y + error/loading state

| # | Severity | Where | Issue |
|---|---------|-------|-------|
| A-1 | IMPORTANT | `src/components/explore-page/explore.tsx` Popover | Plain `<div role="menu">` with no Escape/Enter handlers. Filter popovers (Sort/Filter/Quality) are not keyboard-dismissible. |
| A-2 | IMPORTANT | `src/components/ui/app-dialog.tsx` AppDialog | Uses native `<dialog>` (good) but no focus trap. Tab can escape modal to background page. |
| A-3 | IMPORTANT | `src/app/explore/page.tsx` | No `error.tsx` segment file. Async fetch failures fall back to the generic root `error.tsx`. |
| A-4 | IMPORTANT | `src/app/home/page.tsx` | Same — no `error.tsx`. `useHomeFeed` swallows errors with `console.error` only. |
| A-5 | IMPORTANT | `src/app/profile/[handle]/page.tsx` | Same — no `error.tsx`. |
| A-6 | IMPORTANT | `src/app/endorsements/page.tsx` (if exists) | Same. |

## Cross-cutting observations

- **Round-1 unchanged**: every Tier-1 / Tier-2 extraction from
  round 1 (`asBlobRef`, `extractRecordRef`, `useMounted`,
  `formatMonthYear`, `getInitials`, `xrpcGetRecordPath`,
  `redactSecrets`, `formatShortDate`) is still in use and still
  has minimal-to-no test coverage — round-2 picks up the test
  layer.
- **A growing test surface**: round-1 had 154 tests; round-2 starts
  at 215. Most additions came with feature work (typed-lists,
  parse-subject-input, app-dialog), not as systematic backfill.
