# Track T01 — Dead code sweep

Commit: `d903a05`

Removed three dead exports and demoted one to internal-only.

- `src/hooks/use-activities.ts` — DELETED. `useActivities()` was a single
  wrapper around `useUserActivities(did)` with zero importers outside the
  file itself.
- `src/lib/atproto/badges.ts` — removed `awardAuthorDid` function. Exported
  with zero callers.
- `src/lib/atproto/context-attachment.ts` — demoted `extractYouTubeId`
  from export to internal-only; only `uriThumbnailUrl` inside the same
  file used it.
- `src/hooks/use-user-activities.ts` — JSDoc cleanup; the "Mirrors
  `useActivities`" line no longer applied.

Considered for deletion but kept (logged in 06-deferred.md):
- `clearRecentlyViewed` — symmetric companion to track/get/remove
  in the same helper file.
- `loadDraft` — half of a planned restore-from-conflict feature whose
  save half is already wired in project-detail.tsx/activity-detail.tsx.

Verification: all four gates passed (tsc 0, lint 56 warnings unchanged,
build pass, tests 154 pass).
