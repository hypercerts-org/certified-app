# Refactor plan v1

Tracks proposed for the overnight pass. Each is a self-contained commit.
"Files" is the partition — strictly disjoint across in-flight tracks.

## Tier 1 — must implement

### T01 — Dead code sweep

- Scope: delete `useActivities` (D-1), `clearRecentlyViewed` (D-2),
  `loadDraft` (D-3), `awardAuthorDid` (D-4). Demote `extractYouTubeId` to
  private (D-5).
- Files:
  - DELETE `src/hooks/use-activities.ts`
  - EDIT `src/lib/utils/recently-viewed.ts`
  - EDIT `src/lib/utils/swap-drafts.ts`
  - EDIT `src/lib/atproto/badges.ts`
  - EDIT `src/lib/atproto/context-attachment.ts`
- Expected diff: ~30 LOC removed.
- Risk: L. Verified zero importers.
- Dependencies: none.

### T02 — `formatShortDate` consolidation in feed/activity-detail

- Scope: replace local `formatDate` in `activity-detail.tsx` with
  `formatShortDate`.
- Files: `src/components/feed/activity-detail.tsx`.
- Expected diff: ~12 LOC removed, 1 import added.
- Risk: L. Identical output.
- Dependencies: none.

### T03 — Extract `formatMonthYear` to lib + adopt in 2 sites

- Scope: add `formatMonthYear(iso)` to `src/lib/utils/format-date.ts`. Use it
  in `profile-sidebar.tsx`'s `formatJoined` and
  `use-profile-inline-edit.ts`'s `readableFoundedDate`.
- Files:
  - EDIT `src/lib/utils/format-date.ts` (add export)
  - EDIT `src/components/profile/profile-sidebar.tsx`
  - EDIT `src/hooks/use-profile-inline-edit.ts`
- Expected diff: +10 / -8.
- Risk: L. Same locale + options.
- Dependencies: none.

### T04 — Inline initials → `getInitials`

- Scope: replace three inline initials computations with `getInitials`.
- Files:
  - EDIT `src/app/settings/edit-profile/page.tsx`
  - EDIT `src/app/groups/page.tsx`
  - EDIT `src/app/groups/[groupDid]/edit-profile/page.tsx`
- Expected diff: -10 / +6.
- Risk: L. Behavior identical in single-displayName cases. For multi-word
  display names the new version actually produces "Ab" instead of "Al"
  (Alice Bob) — that's the correct behavior; current code is sub-par.
- Dependencies: none.

### T05 — Local `isDid` in handle-search → lib `isDid`

- Scope: in `src/components/groups/handle-search.tsx`, delete local
  `isDid` and import the lib version. Keep local `looksLikeCompleteDid`.
- Files: `src/components/groups/handle-search.tsx`.
- Expected diff: -6 / +2.
- Risk: L. Local was a superset check (added length floor); lib is the
  prefix check. The two call sites use it for "should I treat input as a
  DID rather than a handle" — the length floor wasn't load-bearing
  (`looksLikeCompleteDid` does the strict check before commit).
- Dependencies: none.

### T06 — Extract `useMounted` hook from 3 layout components

- Scope: add `src/hooks/use-mounted.ts` with `export function useMounted()`.
  Use in mobile-sidebar, desktop-left-rail, desktop-top-bar.
- Files:
  - ADD `src/hooks/use-mounted.ts`
  - EDIT `src/components/layout/mobile-sidebar.tsx`
  - EDIT `src/components/layout/desktop-left-rail.tsx`
  - EDIT `src/components/layout/desktop-top-bar.tsx`
- Expected diff: +8 (new file) / -6.
- Risk: L.
- Dependencies: none.

### T07 — Move `use-layout-breakpoints` from `lib/hooks/` to `hooks/`

- Scope: `git mv src/lib/hooks/use-layout-breakpoints.ts
  src/hooks/use-layout-breakpoints.ts`. Update 4 importers.
- Files (git rename + 4 import updates):
  - RENAME `src/lib/hooks/use-layout-breakpoints.ts` → `src/hooks/use-layout-breakpoints.ts`
  - EDIT `src/components/ui/feedback-modal.tsx`
  - EDIT `src/components/layout/bottom-nav.tsx`
  - EDIT `src/components/layout/navbar.tsx`
  - EDIT `src/hooks/use-bottom-sheet-drag.ts`
- After: delete the now-empty `src/lib/hooks/` directory.
- Expected diff: 0 LOC net.
- Risk: L. Pure file move.
- Dependencies: none.

### T08 — `redactSecrets` dedupe (api.ts ↔ log-safe.ts)

- Scope: delete private `redactSecrets` from `src/lib/utils/api.ts` and
  import the exported one from `log-safe.ts`.
- Files: `src/lib/utils/api.ts`.
- Expected diff: -7 / +1.
- Risk: L. The lib version is a strict superset; behavior either equivalent
  or strengthened (more secret patterns redacted).
- Dependencies: none.

### T09 — Rename `getBlueskyProfile` in resolve-did route

- Scope: rename `getBlueskyProfile` → `fetchBskyAppViewProfile` in
  `src/app/api/resolve-did/route.ts`. Local function only.
- Files: `src/app/api/resolve-did/route.ts`.
- Expected diff: 2 line edits.
- Risk: L. Local symbol, no external impact.
- Dependencies: none.

### T10 — Extract `extractRecordRef` helper for group route XRPC casts

- Scope: add `extractRecordRef(upstream)` to `src/lib/utils/api.ts` (or a new
  helper file). Use in 4 group route handlers.
- Files:
  - EDIT `src/lib/utils/api.ts`
  - EDIT `src/app/api/groups/[groupDid]/activity/route.ts`
  - EDIT `src/app/api/groups/[groupDid]/follow/route.ts`
  - EDIT `src/app/api/groups/[groupDid]/location/route.ts`
  - EDIT `src/app/api/groups/[groupDid]/project/route.ts`
- Expected diff: +10 / -12.
- Risk: L–M. Server-side helper, test path not exercised by current vitest
  suite; rely on build + typecheck.
- Dependencies: none.

## Tier 2 — implement only if Tier 1 done early

### T11 — `pickAllowedFields<T>` generic

T-5. Tightens types without changing behavior. ~6 call sites.

### T12 — `safeRedirect` helper (or doc fix)

Q-2. Decision: skip; the helper doesn't exist and is referenced once; adding
it without callers is over-engineering. Mark as doc drift.

### T13 — `extractYouTubeId` private already covered in T01.

## Sequencing

All Tier 1 tracks are independent (verified by file-list intersection). They
can run in parallel worktrees and be integrated in any order.

The disjoint partition is provable: no track edits a file that another track
also edits. (T03/T04 both touch `use-profile-inline-edit.ts`/`profile-sidebar.tsx`?
NO — T03 touches `profile-sidebar.tsx` + `use-profile-inline-edit.ts`; T04
touches three pages, none of which T03 touches. Verified.)

## Risk register

- T08 changes the redaction surface of error messages. Lib version is broader.
  Worst case: a 4xx echoed back to the client has more `[redacted]` substrings.
  Considered acceptable.
- T10 changes the *call shape* but not the wire shape of API responses. Verify
  with build.
