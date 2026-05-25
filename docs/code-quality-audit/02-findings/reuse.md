# Findings — reuse & duplication

User's #1 priority. Sorted by impact / safety.

## R-1 — Inline initials computation duplicates `getInitials`

Two pages compute initials inline instead of calling `getInitials` from
`@/lib/utils/initials`:

- `src/app/settings/edit-profile/page.tsx:173-177` —
  ```
  const fallbackInitials = profile?.displayName
    ? profile.displayName.slice(0, 2)
    : did ? did.slice(4, 6) : "?";
  ```
  Same algorithm as `getInitials(profile?.displayName, did)` minus the
  multi-word branch (lossless, since `slice(0,2)` is a superset of the
  multi-word case when only one word exists).
- `src/app/groups/page.tsx:104` — `(org.displayName || org.handle).slice(0, 2)`.
- `src/app/groups/[groupDid]/edit-profile/page.tsx:108-110` — same.

`getInitials` accepts `(displayName, did)`; for the group case we'd accept the
first arg only. **Tier 1** — pure reuse, no behavior change of consequence
(`getInitials` actually does more — multi-word initials, but for these single
displayName cases the visible output stays identical).

## R-2 — Inline date formatting duplicates `formatShortDate`

`src/components/feed/activity-detail.tsx:87-97` declares its own `formatDate`
producing exactly the output of `formatShortDate`. Replace.

**Tier 1**, scope = one file.

## R-3 — "Joined Mon YYYY" / "Mon YYYY" duplicated date format

- `src/components/profile/profile-sidebar.tsx:103-108` — `formatJoined`, calls `toLocaleDateString("en-US", { month, year })`.
- `src/hooks/use-profile-inline-edit.ts:127` — `readableFoundedDate`, same shape.

Both should share a `formatMonthYear` helper in `src/lib/utils/format-date.ts`.
`readableFoundedDate` has an extra "4-digit year passthrough" branch — that's a
caller concern; keep it in the caller, use the shared helper for the
locale-format step.

**Tier 1**.

## R-4 — Duplicate `isDid` predicate

- `src/lib/utils/did.ts:7` — `isDid(s)` checks for `did:plc:` or `did:web:` prefix.
- `src/components/groups/handle-search.tsx:20` — local `isDid` adds a length floor (`> 12`).

The handle-search version is doing two different things at lines 20 + 26
(`isDid` and `looksLikeCompleteDid`). Replace the local `isDid` with the lib
one, keep `looksLikeCompleteDid` as a local extension. Tier 1, low risk.

## R-5 — `ssr-mounted` boilerplate in 3 layout components

`src/components/layout/mobile-sidebar.tsx:74-75`,
`src/components/layout/desktop-left-rail.tsx:96-97`,
`src/components/layout/desktop-top-bar.tsx:206-207` all do:

```
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
```

Extract `useMounted()` into `src/hooks/use-mounted.ts`. Tier 1, mechanical
3-file refactor.

## R-6 — `safeRedirect` mentioned in AGENTS.md doesn't exist

`AGENTS.md §23 #4` instructs callers to use `safeRedirect()`. Looking for it:
- `src/lib/utils/safe-url.ts` exports `safeHttpUrl` only.
- No `safeRedirect` symbol exists in the repo.

This is documentation drift rather than a refactor target. Note in
`quality-other.md`.

## R-7 — `redactSecrets` duplicated in `api.ts` and `log-safe.ts`

`src/lib/utils/api.ts:59-64` defines a private `redactSecrets` that mirrors the
exported one in `src/lib/utils/log-safe.ts:33-65`. The api.ts version is a
strict subset (no JWT-keys redaction etc.). Replace with the lib one.
**Tier 1**, single-file edit, no test changes needed (the test already
exercises the lib version).

## R-8 — `getBlueskyProfile` exists in two files with different shapes

- `src/lib/atproto/profile.ts:52` — `getBlueskyProfile(did)` reads
  `app.bsky.actor.profile` from a user's PDS.
- `src/app/api/resolve-did/route.ts:115` — local `async function getBlueskyProfile(did)`
  fetches `app.bsky.actor.getProfile` from the public bsky AppView.

Same name, different services. Rename the route-local one to
`fetchBskyAppViewProfile` for clarity. **Tier 1**, single file, scope is one
function rename + one call-site update at line 188.

## R-9 — XRPC `getRecord` URL construction duplicated

5 call sites build `?repo=<>&collection=<>&rkey=<>` strings inline:

- `src/lib/atproto/profile.ts:37, 57`
- `src/app/settings/edit-profile/page.tsx:37`
- `src/app/api/groups/[groupDid]/profile/route.ts:37`
- `src/app/api/groups/[groupDid]/metadata/route.ts:41`

A `getRecordPath({ repo, collection, rkey })` helper would centralize. **But
the two `/api/groups/...` routes call the upstream PDS directly with full
`pdsUrl`** — different absolute URL prefix. Helper would need to take a base.
Risk of over-abstraction. **Tier 2; skip unless time** — six call sites is
borderline.

## R-10 — `app.bsky.actor.profile` / `app.certified.actor.profile` collection
strings appear in many files

Strings like `"app.certified.actor.profile"` are inline in routes/lib instead
of being constants. Already done for groups (`ORG_MARKER_COLLECTION` etc.),
but the actor-profile collections are duplicated.

**Tier 2** — touches many files, risk of breaking the carefully-managed
allowlist. Skip unless a track explicitly needs to.

## R-11 — `explore/` vs `explore-page/` — NOT duplicates

Verified: `src/components/explore/` is the per-cert exploration view (used by
`/activity/[did]/[rkey]/explore` and `/project/[did]/[rkey]/explore`),
`src/components/explore-page/` is the global `/explore` page. Naming is
unfortunate but they serve different surfaces. **Not a refactor target.**

## R-12 — `src/lib/hooks/use-layout-breakpoints.ts` is the only file under `lib/hooks/`

Imported by 4 components. Other ~46 hooks live under `src/hooks/`. Move to
`src/hooks/use-layout-breakpoints.ts` for consistency.

**Tier 1**, 4 import-site updates + git mv.

## R-13 — `src/components/onboarding/use-onboarding-commit.ts` — hook under components/

A hook (`useOnboardingCommit`) lives next to its components. Import path
`from "./use-onboarding-commit"`. AGENTS.md establishes `src/hooks/` as
canonical. **Tier 2** — debatable; co-locating with the feature is also a
valid convention. Document but don't move (the file is single-feature, has 2
importers both in the same folder). Skip.

## Things deliberately NOT in scope

- Splitting the 700–1200 LOC components (`profile-endorsements`,
  `profile-overview`, etc.) — too large for an 8h pass per the brief's "skip
  entirely" rules.
- API route shape consolidation — risk of breaking external callers.
- Token / colour refactor (described in DESIGN.md) — requires design judgement.
