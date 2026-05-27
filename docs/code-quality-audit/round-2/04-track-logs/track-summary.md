# Round 2 — Track logs

Round 2 ran 13 tracks across 3 implementation commits (plus the
scaffold docs commit). Tracks within each commit were sequenced
on disjoint file ownership per the plan.

## Commit `048bd33` — Tier 1 batch

| Track | Files | Outcome |
|-------|-------|---------|
| R2-T01 | src/hooks/use-click-outside-close.ts | ref write moved into useEffect; -1 lint error |
| R2-T02 | src/hooks/use-explore.ts | deps lists extended; -4 lint errors + -2 warnings |
| R2-T03 | src/app/create/page.tsx | useRef pattern replaced with useState lazy init |
| R2-T04a | src/components/ui/app-dialog.tsx | focus save+restore; Tab-cycle trap deferred to T04b |
| R2-T05 | src/components/ui/{cert-icon,loading-spinner}.tsx | "use client" dropped; build green |
| R2-T06 | src/components/ui/error-boundary-fallback.tsx (new) + 4 segment error.tsx | segment fallbacks live |
| R2-T07 | src/lib/atproto/__tests__/activity-uri.test.ts (new) | +12 cases |
| R2-T08 | src/lib/utils/__tests__/initials.test.ts (new) | +9 cases |
| R2-T09 | src/hooks/__tests__/use-url-param.test.tsx (new) | +12 cases; FIRST hook test |
| R2-T19 | src/components/explore-page/explore.tsx Popover | Escape closes the menu |

Gate at end: 0 / 58 / 250 / pass.

## Commit `e94a635` — Tier 2 batch

| Track | Files | Outcome |
|-------|-------|---------|
| R2-T10 | src/lib/atproto/__tests__/badges.test.ts (new) | +14 cases for extractAwardSubjectDid |
| R2-T13 | src/components/leaflet/{link-dialog,leaflet-editor}.tsx | onCancel → onClose |
| R2-T18 | src/hooks/use-following.ts | cache contract comment |

Gate at end: 0 / 58 / 264 / pass.

## Commit `0e10d0b` — swap-drafts test

| Track | Files | Outcome |
|-------|-------|---------|
| R2-T16 | src/lib/utils/__tests__/swap-drafts.test.ts (new) | +17 cases (round-trip + computeDirtyFields) |

Gate at end: 0 / 58 / 281 / pass.

## Tracks NOT shipped this round

| Track | Reason |
|-------|--------|
| R2-T04b | Defer to round 3 — Tab-cycle trap is its own track |
| R2-T11 | Existing parseSubjectInput tests cover the documented cases |
| R2-T12 | URL-drive home filters — defer to round 3 |
| R2-T14 | Already done (HomeFeedBody renders `error` from useHomeFeed) |
| R2-T15 | Investigate-only; Tabler icon visual decision is user-driven |
| R2-T17 | saveWithSwap test — mocks are heavy; defer |
