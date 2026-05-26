# Findings — naming & structure

## N-1 — `src/lib/hooks/` exists with one file; the other 46 hooks live in `src/hooks/`

`src/lib/hooks/use-layout-breakpoints.ts` is the only file under that path.
4 importers (navbar, bottom-nav, feedback-modal, use-bottom-sheet-drag).

Move to `src/hooks/use-layout-breakpoints.ts`. Tier 1. (Same item as R-12.)

## N-2 — `formatDate` local in `activity-detail.tsx` shadows global `formatShortDate`

Identical output. Tier 1 reuse (same item as R-2).

## N-3 — Two `getBlueskyProfile` functions with different signatures

Server-side fetch helper in `resolve-did/route.ts` vs PDS read in
`lib/atproto/profile.ts`. Rename the route-local one to
`fetchBskyAppViewProfile`. Tier 1 (same as R-8).

## N-4 — `extractError` (client) vs `extractRouteError` (server)

Both live in `src/lib/utils/api.ts`. Names are confusable. Different shapes:
`extractError(res, fallback)` reads a `Response`, `extractRouteError(err, prefix)`
classifies a caught error. The current names are documented well in the
JSDoc; renaming would churn ~21 call sites. **Skip** — naming is acceptable
once the JSDoc is read.

## N-5 — `app.certified.actor.profile` literal in many places

See R-10. Defer.

## N-6 — File names use kebab-case consistently; types use PascalCase

Spot-checked — convention is consistent. No finding.

## N-7 — Some local helpers should live in the lib

- `contributionRoleText` in `activity-detail.tsx:80` — only used in that file. Keep.
- `formatJoined` in `profile-sidebar.tsx:103` — only used in that file. Keep or
  swap to `formatMonthYear`.
- `readableFoundedDate` in `use-profile-inline-edit.ts:121` — used 3 times
  including from outside the hook. Could move to `lib/utils/format-date.ts`.
  **Tier 2** — only if a format-date track is run.

## Decision

Tier 1 targets here are all already represented in `reuse.md`. No new ones.
