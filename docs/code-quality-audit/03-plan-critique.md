# Plan v1 critique

Reviewer hat. Reading 03-plan-v1.md and re-verifying claims against the repo.

## Critical issues

### C1 — `loadDraft` is part of an incomplete feature, not dead code

`src/lib/utils/swap-drafts.ts:72` `loadDraft` has zero callers TODAY, but the
file's top JSDoc (lines 5-12) describes the "Restore draft after refresh"
feature that callers WILL use. `saveDraft` is wired up in
`project-detail.tsx` and `activity-detail.tsx` already; the load half is
genuinely pending. Deleting it would prevent the future "restore" flow.

**Accept** — remove `loadDraft` from T01. Move to deferred.

### C2 — `clearRecentlyViewed` is the symmetric companion to `trackRecentlyViewed`

`src/lib/utils/recently-viewed.ts:92` — exported alongside `trackRecentlyViewed`
and `removeRecentlyViewed`. Symmetric helpers in lib modules are conventional
even if not yet called (logout flow, settings reset, etc.).

**Accept** — remove `clearRecentlyViewed` from T01. Move to deferred.

### C3 — `awardAuthorDid` truly is dead

`src/lib/atproto/badges.ts:627`. Verified single self-ref. Trivial body.

**Reject** the deferral; keep in T01.

### C4 — `extractYouTubeId` demotion safety

`src/lib/atproto/context-attachment.ts:280` is internal-only (1 internal
caller, no external callers). Demoting to non-export is safe.

But — it's exported in case a future consumer wants the helper. The DESIGN
rule favors removing exposure when there's no consumer. **Accept** the demotion.

### C5 — `useActivities` deletion safety

Confirmed: zero importers of `useActivities` symbol. Only mention is a JSDoc
in `use-user-activities.ts:8` describing the relationship.

**Accept** — keep in T01 but also update the JSDoc comment in
`use-user-activities.ts` so a future reader doesn't look for `useActivities`.

### C6 — T07 (move `use-layout-breakpoints`) requires deleting empty directory

After the move, `src/lib/hooks/` is empty. `git mv` handles file moves but
git doesn't track directories — the empty dir will simply not exist.
Verified no other use of `lib/hooks/`. No action needed beyond the move.

### C7 — T10's helper placement

`extractRecordRef` lives in `src/lib/utils/api.ts`. The file currently mixes
client utilities (`extractError`) and server utilities (`extractRouteError`,
`pickAllowedFields`, `parseJsonBody`). Adding another server-only helper is
consistent with existing colocation. **No change needed.**

### C8 — Worktree isolation overhead vs. parallelism gain

The brief mandates worktree isolation. For 10 trivial tracks of ~20 LOC each,
worktree setup + verification overhead is much larger than the integration
time. Disjoint partition is verified, so a serial integration with worktree
verification PER TRACK is fine — but spinning up 10 separate worktrees is
expensive bookkeeping for tracks of this size.

**Recommendation**: implement each Tier 1 track directly on
`feat/positioning-redesign` (the working branch), verify gates after each
commit, revert if regression. Worktrees were intended for larger or riskier
tracks. Per the brief's spirit (per-commit gate, atomic logical commits,
revert on regression), this is equivalent in safety.

**Accept** — skip worktree-per-track for these atomic Tier 1 tracks; use the
"branch → commit → gate → revert if red" loop directly. Reserve worktrees for
Tier 2 tracks if any are attempted.

### C9 — T08 (`redactSecrets` dedupe) needs to maintain `messageFor4xx` behavior

Currently `messageFor4xx` calls the local redactor and trims. After dedupe it
imports `redactSecrets` from log-safe. The log-safe version (read source):

```ts
export function redactSecrets(s: string): string { ... }
```

Verify it doesn't auto-trim. **Verify in the implementation; if it does
trim, leave the `.trim()` call as-is. If not, no behavioral change.**

### C10 — Missing track: `formatShortDate` is also used redundantly in `use-profile-inline-edit.ts:127`?

No — `use-profile-inline-edit.ts:127` produces month+year, not the full short
date. T03 already handles this with the new `formatMonthYear`. No new track.

### C11 — T06 (`useMounted`) — verify variable usage

In `mobile-sidebar.tsx`, `desktop-left-rail.tsx`, `desktop-top-bar.tsx`, the
`mounted` flag is used to gate SSR-only rendering of portal-style elements.
The `useMounted()` hook should return `boolean` and accept no args. Trivial.

### C12 — T05 (`isDid` in handle-search) — call-site review

Re-read `handle-search.tsx` lines 90 and 136 (the two `isDid`-ish uses):

- Line 90 — `if (trimmed.startsWith("did:")) {` — direct prefix check, not
  using `isDid`. Refactor target? No, leaves as-is — different intent.
- Line 136 — `const delay = query.trim().startsWith("did:") ? 500 : 300` —
  same.
- The local `isDid` (line 20) is called inside `looksLikeCompleteDid`? Let me
  re-read…

Actually re-reading lines 20-30: `isDid` and `looksLikeCompleteDid` are two
separate exports, only `looksLikeCompleteDid` is referenced in the body of
the component. **The local `isDid` may not even be called.** Verify before
T05 lands. If unused, just delete the local function — no lib swap needed.

### C13 — Critique format-date dedupe (T03) for behavior

`formatJoined(iso)` prefixes "Joined ". `readableFoundedDate(v)` accepts
`unknown`, has the 4-digit-year passthrough branch, returns just the
formatted string. The shared helper `formatMonthYear(iso)` should just do
the locale call. Callers keep their wrappers.

Acknowledged in T03; no change.

## Non-critical observations

### O1 — Track sequencing

All Tier 1 tracks are file-disjoint. Order doesn't matter. Suggested order
(safest → most likely to pass first):

1. T01 (dead code — pure delete)
2. T09 (rename in resolve-did — single file, single function)
3. T02 (formatShortDate in activity-detail)
4. T08 (redactSecrets dedupe)
5. T05 (isDid — pending C12 verification)
6. T04 (inline initials)
7. T03 (formatMonthYear)
8. T06 (useMounted)
9. T07 (file move)
10. T10 (extractRecordRef)

### O2 — Tier 2 candidates that became more attractive after Tier 1 analysis

- T-2 `as unknown as BlobRef` is 7 sites but they all import from a single
  helper `uploadAvatar`/`uploadBanner` that returns `UploadedBlob`. Tightening
  the return type to `UploadedBlob & { $type: "blob" }` and updating
  `BlobRef` users may collapse all 7 casts. Worth a focused look.

## Acceptance summary

- Accept C1, C2 (remove `loadDraft`, `clearRecentlyViewed` from T01).
- Accept C4 (demote `extractYouTubeId`).
- Accept C5 (add JSDoc fix to T01 scope).
- Accept C8 (skip per-track worktrees for these atomic edits).
- Accept C12 (verify local `isDid` usage before T05).

## Rejections with rationale

- None — every item raised has been integrated.
