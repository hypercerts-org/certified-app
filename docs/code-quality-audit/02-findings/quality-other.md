# Findings — other quality observations

Lower-tier items not slated for this pass; logged as observations.

## Q-1 — Lint warnings: 56 `react-hooks/set-state-in-effect` instances

Pre-existing Next 16 / React 19 advisory warnings. Most legitimate (state
machines transitioning on auth/route changes). Out of scope.

## Q-2 — `safeRedirect()` is referenced in AGENTS.md but doesn't exist

`AGENTS.md §23 #4` instructs callers to use `safeRedirect()` for redirects.
The repo has `safeHttpUrl()` in `src/lib/utils/safe-url.ts` but no
`safeRedirect`. Either a doc-drift item or a missing helper. Out of scope for
this code-quality pass; flag for the user.

## Q-3 — `console.error`-with-prefix is the canonical logging idiom

102 call sites use `console.{error,warn}(...)`. AGENTS.md endorses the
`[Tag] message` convention. No action needed.

## Q-4 — Several giant files (700–1200 LOC)

`profile-endorsements`, `profile-overview`, `profile-sidebar`,
`activity-detail`, `project-detail`, `endorsement-lists`, `explore` (page).
Each warrants a focused split, but per the brief's "skip entirely" rules
(judgment-heavy, multi-track effort), out of scope for this pass.

## Q-5 — Lint reports `next/next/no-img-element` in a handful of places

Not surfaced as line-numbered in baseline; would need re-run with `--format
json` to enumerate. Pre-existing; not introduced by this pass. Skip.

## Q-6 — Two `did.ts` files (utils + atproto) — naming clash, different responsibilities

`src/lib/utils/did.ts` — validators (`isValidDid`, `isDid`).
`src/lib/atproto/did.ts` — network resolvers (`resolveHandle`, etc.).

Different concerns; the names are clear in import paths. No rename.

## Q-7 — Dual-cast pattern `as unknown as BlobRef` repeated 7 times

Captured in `type-safety.md` T-2. Tier 2.

## Q-8 — `useEffect` cleanup wrappers like `useEffect(() => () => { aliveRef.current = false }, [])`

Used in `use-bsky-posts.ts:142`. Combined with `useEffect`-onMount it's a
standard isMounted pattern. A `useIsMounted` hook could replace, but the lift
is small. Out of scope.
