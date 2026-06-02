# Deferred items

Things considered for this pass but not implemented. Each entry says why.

## Deferred from Tier 1 (after critique)

### `loadDraft` in `src/lib/utils/swap-drafts.ts`

Zero importers today, but the file's header documents a "restore-from-
conflict" flow where `saveDraft` (already wired in `project-detail.tsx`
and `activity-detail.tsx`) is the save half and `loadDraft` is the
post-refresh load half. Deleting it now would block the planned
feature. Keep until the load half is wired.

### `clearRecentlyViewed` in `src/lib/utils/recently-viewed.ts`

Zero importers today. Symmetric companion to `trackRecentlyViewed`,
`getRecentlyViewed`, `removeRecentlyViewed`. Conventional retention for
a symmetric lib API even before the first caller exists (logout,
settings reset, account switch are plausible upcoming consumers).

## Tier 2 declined

### T11 — `pickAllowedFields<T>` generic

Tightening `pickAllowedFields(body, allowed, $type): Record<string,
unknown>` to a generic `Partial<T> & { $type }` would feel cleaner but
gains little: callers pass the return straight into the AT Protocol
agent as `any`-shaped record payload, never read fields back. The
weaker type also keeps `unknown` propagating, which matches the
runtime guarantees the function actually provides. Net: not worth the
churn risk on a security-critical helper.

### T15 — Inline server-side `${pdsUrl}/xrpc/com.atproto.repo.getRecord`
URL builders

Two `/api/groups/[did]/{profile,metadata}` route handlers construct
foreign-PDS URLs with the dotted XRPC shape
(`com.atproto.repo.getRecord`) vs. the BFF's slashed shape
(`com/atproto/repo/getRecord`) handled by T13. Two call sites doesn't
justify a separate helper; the path shape is wrong for it.

## Findings explicitly skipped

### Q-2 — `safeRedirect()` documentation drift

`AGENTS.md §23 #4` references a `safeRedirect()` helper that doesn't
exist in the repo. The existing `safeHttpUrl()` in
`src/lib/utils/safe-url.ts` covers the URL-shape part. Treat as a doc
fix the user should make (delete the reference, or implement and wire
up the helper).

### Q-4 — 700–1200 LOC files

`profile-endorsements`, `profile-overview`, `profile-sidebar`,
`activity-detail`, `project-detail`, `endorsement-lists`, `explore`,
`groups/org-settings`, `settings/sync-social-graph-section` all clear
700 LOC. Splitting them is real refactor work, requires judgement on
where the seams should be, and per the brief's "skip entirely" rule
for judgement-heavy decompositions, it's better for the human to drive.

### Q-1 — 55 pre-existing lint warnings

All `react-hooks/set-state-in-effect` (Next 16 / React 19) or
`react-hooks/exhaustive-deps`. Each is a state-machine pattern where
the lint is technically right but the intent is correct; touching them
requires individual judgement.

### Naming: `extractError` (client) vs `extractRouteError` (server)

Both live in `src/lib/utils/api.ts` with clear JSDoc. Renaming would
churn ~21 call sites for a mostly aesthetic gain. Skip.

### R-10 — `app.bsky.actor.profile` / `app.certified.actor.profile`
string-constant extraction

The string literals appear in many files. Group-side collections
already have `ORG_MARKER_COLLECTION` etc. as constants. Extracting the
actor-profile collections similarly would touch ~10 files and risks
desync with the carefully-managed `ALLOWED_WRITE_COLLECTIONS` allowlist
in the XRPC proxy. Skip unless a future track explicitly owns it.

### T-1 — Non-null assertions in `orbiting-logos.tsx`

7 `el!` assertions inside animation closures. Refactoring the orbiting
landing-page animation is risky (visual, timing-sensitive). Skip.

### T-4 — `editor.storage as unknown as Record<string,
LeafletImageStorage>` (3 sites)

Tiptap typing is fragile. The cast is a centralization candidate but
the storage shape varies enough across extensions that a stable helper
needs careful design. Skip.

### N-7 — Move `readableFoundedDate` to `lib/utils/format-date.ts`

Plausible move but only 3 callers (including the export from
`use-profile-inline-edit.ts`). Net value is small enough to skip.

### File location: `src/components/onboarding/use-onboarding-commit.ts`

A hook colocated with its feature. AGENTS.md sets `src/hooks/` as the
canonical location, but the only two importers are siblings in the
same folder. Co-location wins on cohesion here. Skip.
