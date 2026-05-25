# Refactor plan v2 (final)

Supersedes 03-plan-v1.md. Integrates 03-plan-critique.md.

## Tier 1 — must implement (in this order)

### T01 — Dead code sweep (revised after C1/C2/C5)

- DELETE `src/hooks/use-activities.ts` (verified zero importers).
- DELETE `awardAuthorDid` from `src/lib/atproto/badges.ts:627`.
- Demote `extractYouTubeId` from export to internal in
  `src/lib/atproto/context-attachment.ts:280`.
- Update JSDoc reference in `src/hooks/use-user-activities.ts:8` (drop the
  "Mirrors `useActivities`" line — it no longer exists).

NOT in T01 (moved to deferred):
- `loadDraft` — paired with planned but unwired "restore draft" feature.
- `clearRecentlyViewed` — symmetric companion to other recently-viewed
  helpers; conventional retention.

Files: 4. Diff: ~25 LOC removed.

### T02 — Replace local `formatDate` with `formatShortDate`

Files: `src/components/feed/activity-detail.tsx`.

### T03 — Add `formatMonthYear`; adopt in two sites

Files:
- `src/lib/utils/format-date.ts` (add export)
- `src/components/profile/profile-sidebar.tsx`
- `src/hooks/use-profile-inline-edit.ts`

### T04 — Inline initials → `getInitials`

Files:
- `src/app/settings/edit-profile/page.tsx`
- `src/app/groups/page.tsx`
- `src/app/groups/[groupDid]/edit-profile/page.tsx`

### T05 — Delete unused local `isDid` in handle-search (revised after C12)

The local `isDid` (handle-search.tsx:20) is never called. Just delete it; no
lib swap necessary. Local `looksLikeCompleteDid` (line 26) stays — it's
actively used.

Files: `src/components/groups/handle-search.tsx`.

### T06 — Extract `useMounted` hook (3 layout components)

Files:
- ADD `src/hooks/use-mounted.ts`
- EDIT `src/components/layout/mobile-sidebar.tsx`
- EDIT `src/components/layout/desktop-left-rail.tsx`
- EDIT `src/components/layout/desktop-top-bar.tsx`

### T07 — Relocate `use-layout-breakpoints` to canonical `src/hooks/`

Files:
- RENAME `src/lib/hooks/use-layout-breakpoints.ts` → `src/hooks/use-layout-breakpoints.ts`
- EDIT `src/components/ui/feedback-modal.tsx`
- EDIT `src/components/layout/bottom-nav.tsx`
- EDIT `src/components/layout/navbar.tsx`
- EDIT `src/hooks/use-bottom-sheet-drag.ts`

(The previously empty `src/lib/hooks/` dir will disappear when
git tracks no files there.)

### T08 — Dedupe `redactSecrets` (api.ts ↔ log-safe.ts)

Files: `src/lib/utils/api.ts`.

Verify behavior parity with C9: log-safe's `redactSecrets` doesn't trim
auto; keep the explicit `.trim()` in `messageFor4xx`.

### T09 — Rename `getBlueskyProfile` (route-local) → `fetchBskyAppViewProfile`

Files: `src/app/api/resolve-did/route.ts`.

### T10 — Extract `extractRecordRef` for the 4 group routes

Files:
- EDIT `src/lib/utils/api.ts` (add helper)
- EDIT `src/app/api/groups/[groupDid]/activity/route.ts`
- EDIT `src/app/api/groups/[groupDid]/follow/route.ts`
- EDIT `src/app/api/groups/[groupDid]/location/route.ts`
- EDIT `src/app/api/groups/[groupDid]/project/route.ts`

## Tier 2 — implement if time remains

### T11 — `pickAllowedFields<T>` generic

Type-narrow `pickAllowedFields` so callers don't cast the return. ~6 call
sites.

### T12 — UploadedBlob ↔ BlobRef cast collapse (T-2 from type-safety)

Investigate whether `UploadedBlob` from `lib/atproto/profile.ts` can be a
structural subtype of `BlobRef` such that the `as unknown as BlobRef` casts
disappear at all 7 sites.

## Execution rules

- Implement directly on `feat/positioning-redesign` (per C8).
- After every commit, run gates (typecheck, lint, build, tests). Revert
  immediately on any regression.
- All Tier 1 tracks are file-disjoint, so order is flexible. Execute in the
  numerical order T01 → T10 (safest → most ambitious).
- Each commit message follows: `<type>: <one-line summary>` + body containing
  rationale, baseline SHA, track ID, and the standard Co-Authored-By footer.

## Sequencing (final)

1. T01 (dead code)
2. T09 (route rename — single file)
3. T02 (date dedupe — single file)
4. T08 (redactSecrets dedupe — single file)
5. T05 (delete unused local — single file)
6. T04 (inline initials — 3 files)
7. T03 (formatMonthYear — 3 files)
8. T06 (useMounted — 4 files)
9. T07 (file move — 5 files)
10. T10 (extractRecordRef — 5 files)

Then re-evaluate time and tackle T11/T12 if remaining.

## Gate-keeping reminders

- `npx tsc --noEmit` — must report 0 errors. No new error codes.
- `npm run lint` — must report ≤ 56 warnings, 0 errors.
- `npm run build` — must succeed.
- `npm test` — must show 154 passing across 8 files.
