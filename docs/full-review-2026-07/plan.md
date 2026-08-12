# Implementation plan — full review refactor (2026-07-02)

Executes the confirmed findings from [`findings.md`](./findings.md) on `staging`.
34 of 36 confirmed findings are implemented; 2 are deferred (below). A test-only
track adds coverage for the highest-value untested security paths surfaced by the
testing dimension.

## Ground rules

- Branch: `staging` (project convention — substantial work commits directly to staging).
- **Disjoint file ownership** — every source file belongs to exactly one track; no
  two tracks edit the same file. Implementers edit only their listed files (plus new
  files they create in their area). If a full-tree typecheck shows errors in files a
  track does not own, that is another track mid-flight — ignore it.
- One commit per track, conventional scope tag, no emojis.
- Gates (orchestrator runs after all tracks land, before each commit):
  `npx tsc --noEmit` clean · `npm run lint` ≤ 64 warnings (no new) · `npm test`
  ≥ 937 passing · the five CLAUDE.md grep checks silent · dark-mode + ≤799 px spot
  checks on touched surfaces.
- Baselines @ `6788152`: tsc clean, lint 64 warnings/0 errors, 937 tests pass.

## Deferred (documented, not implemented)

- **`waterfall-hyperboard-displayprofile`** (low, risk:medium) — niche cached surface;
  the second serial round-trip is small and the fix reshapes a two-stage resolver. Not
  worth the regression risk this pass.
- **`cache-indexer-proxy-no-shared-cache`** (low, risk:low) — an in-memory Map cache is
  per-instance in serverless (marginal hit-rate) and risks serving stale money-adjacent
  counts. A proper edge `s-maxage` GET variant is a larger, separate change.
- **`ds-zindex-literals`** / **`ds-error-focus-ring-rgba`** (refuted-bucket, medium) —
  real conformance gaps but re-tokenizing 18 z-index rules risks stacking regressions;
  tracked as known debt, not this pass.

## Tracks (disjoint file ownership)

### T-sec-ssrf — SSRF & proxy hardening (security)
Findings: `sec-ssrf-wellknown-handle`, `sec-ssrf-ip-filter-bypass`,
`sec-ssrf-pds-redirect-follow`, `sec-xrpc-get-no-ratelimit`, `sec-getblob-unbounded-stream`.
Owns:
- `src/lib/atproto/did.ts`
- `src/app/api/xrpc/[...method]/route.ts`
- `src/app/api/resolve-did/resolve-core.ts`
- `src/lib/atproto/get-record-server.ts` (the `getCertsProfile` upstream fetch)
- `src/lib/auth/group-account-session.ts`
- new test file(s) under `src/lib/atproto/__tests__/`
Notes: validate `.well-known` handle as a hostname then run `isAllowedPdsUrl`; reject
non-canonical IP literals (decimal/hex/octal) and add `0.0.0.0/8`, `100.64.0.0/10`;
set `redirect:"error"` on all upstream PDS fetches; add IP-scoped limiter to the xrpc
GET handler (define `makeLimiter(...)` at module scope in the route file — do **not**
edit `rate-limit.ts`); cap the foreign getBlob stream by counting bytes independent of
Content-Length. Ship a regression test for the SSRF hostname/IP validation.

### T-sec-auth — auth throttle & email relay (security)
Findings: `authz-group-account-unlock-guess-oracle`, `sec-feedback-email-relay`.
Owns:
- `src/app/api/groups/[groupDid]/account/session/route.ts`
- `src/app/api/feedback/route.ts`
- their `__tests__` siblings
Notes: add a per-**target** (`groupDid`) unlock limiter alongside the per-caller one,
deny if either trips (define the limiter locally in the route file). For feedback, stop
emailing attacker-controlled content to attacker-supplied addresses — drop the
user-facing auto-reply or send only to the authenticated account email. Add tests for
the dual limiter and the feedback recipient rule.

### T-next — Next.js platform (headers / routing / SEO)
Findings: `next-embed-frame-headers-block-embeds`, `next-root-client-redirect-flash`,
`next-og-metadata-uncached-fetch`, `next-robots-omits-internal-routes`.
Owns:
- `next.config.ts`
- `src/app/page.tsx`
- `src/lib/og-metadata.ts`
- `src/app/robots.ts`
Notes: split `headers()` so `/embed/*` omits `X-Frame-Options` and sets
`frame-ancestors *` while everything else keeps `DENY`/`'none'`. Convert root `/` to a
Server Component that reads `getSessionDid()` and `redirect()`s (preserve exact
semantics: Redis/session present → `/home`, else `/welcome`; `/home` re-verifies). Wrap
OG metadata resolution in `unstable_cache` (or `next:{revalidate:300}`) keyed by
did/(did,collection,rkey). Add `/workspace`, `/endorsement-graph`, `/profile` to robots
disallow. Do **not** edit `src/app/[actor]/page.tsx` (owned by T-bundle).

### T-bundle — code-splitting heavy deps + activity-detail render
Findings: `bundle-tiptap-static-import`, `bundle-contributor-board-d3-static`,
`perf-activity-detail-contributor-rows`.
Owns:
- new `src/components/leaflet/leaflet-editor-dynamic.tsx`
- the 8 `LeafletEditor` import sites: `src/app/project/new/page.tsx`,
  `src/app/[actor]/page.tsx`, `src/app/create/page.tsx`,
  `src/components/context/update-form.tsx`,
  `src/components/project/project-edit-route.tsx`,
  `src/components/project/project-detail.tsx`,
  `src/components/feed/activity-detail.tsx`,
  `src/components/feed/activity-edit-route.tsx`
Notes: `LeafletEditor` is a plain default-export function with **no ref usage at any
call site** (verified) → wrap it with `dynamic(() => import('./leaflet-editor'),
{ ssr:false, loading: … })` in `leaflet-editor-dynamic.tsx` and swap each import line to
it (one line per file; preserve the same default-import name and props). In
`activity-detail.tsx` also lazy-load `ActivityFancyBoard` via `dynamic({ssr:false})`
(d3-hierarchy, tab-gated) and memoize the contributor rows + weight-percent maps.
`funding-receipt-row.tsx` is imported here but **owned by T-render** — do not edit it.

### T-render — explore/profile render + explore a11y + explore truncateDid
Findings: `perf-explore-results-wholesale-rerender`, `a11y-nested-main-landmarks`,
`perf-endorsements-cards-not-memoized`, `dup-truncatedid-triplicated` (explore two).
Owns (whole dirs, disjoint from all other tracks):
- `src/components/explore-page/**` (explore.tsx + all row/card components)
- `src/components/home/home.tsx`
- `src/components/profile/profile-endorsements.tsx`
Notes: `useMemo` the sorted lists; wrap the row components (`CertListRow`,
`AccountListRow`, `ProjectListRow`, `ExploreUserCard`, `ExploreProjectCard`,
`FundingReceiptRow`) in `React.memo`; same for endorsement cards, and drop the duplicate
in-grid filter/sort in profile-endorsements. Change the inner page-level
`<main className="explore__main">` (two sites) and `<main className="home__main">` to
`<div>`/`<section>` (class-only CSS selectors — verified — so ≥1300 px visuals
unchanged). Replace the local `truncateDid` in `explore-user-card.tsx` and
`account-list-row.tsx` with `import { truncateDid } from "@/lib/utils/did"`.

### T-navbar — navbar context split + page-title heading (perf + a11y)
Findings: `perf-navbar-context-monolithic-value`, `a11y-page-title-not-heading`.
Owns:
- `src/lib/navbar-context.tsx`
- `src/components/layout/navbar.tsx`
- `src/components/layout/desktop-top-bar.tsx`
Notes: split navbar context into a memoized **setters** context and a **values**
context; **the public hook API (`usePageTitle`, etc.) must stay byte-for-byte
compatible** so no consumer file needs editing. Render the page title as `<h1>` (keep
existing class for visual parity; mobile navbar and desktop bar are mutually
`display:none`, so exactly one `h1` is ever in the a11y tree).

### T-hooks-correct — hook correctness fixes
Findings: `correctness-homefeed-loadmore-stale-append`,
`correctness-user-indexer-activities-no-dedupe`, `correctness-session-noretry-on-http-error`.
Owns:
- `src/hooks/use-home-feed.ts`
- `src/hooks/use-user-indexer-activities.ts`
- `src/hooks/use-session.ts`
Notes: add an abort/generation guard to home-feed `loadMore`; de-dupe by URI in the
user-indexer-activities merge; on a non-OK `getSession` response reset the cached
promise so the next mount refetches (don't cache the null).

### T-hooks-perf — hook performance fixes
Findings: `nplus1-project-items-getrecord`, `perf-use-layout-breakpoints-resize-storm`.
Owns:
- `src/hooks/use-project-items.ts`
- `src/hooks/use-layout-breakpoints.ts`
Notes: route project-item URIs through `fetchIndexerActivitiesByUris` (batch of 50),
falling back to per-URI `getRecord` only for URIs the indexer reports missing (preserves
cross-PDS/not-yet-indexed behavior). Guard the breakpoint setter with an equality check
so unchanged breakpoints bail during a resize drag.

### T-css — design-system token conformance
Findings: `ds-overlay-hover-darkmode`, `ds-status-tint-tokens`,
`ds-onboarding-avatar-shadow-rgba`, `ds-leaflet-attribution-rgba`, `ds-scrim-pill-literals`.
Owns:
- `src/app/styles/components.css`
- `src/app/styles/feed.css`
- `src/app/styles/profile-inline-edit.css`
- `src/app/styles/tokens.css`
Notes: swap raw rgba hover/tint literals for the theme-aware tokens listed in the
findings (`--overlay-weak/-medium`, `--color-success-bg/-error-bg/-error-border`); token
the onboarding avatar shadow (`--shadow-md`) and the leaflet attribution surface
(`--navbar-bg`, delete the hand dark override). For the 8 invariant scrim literals, add
`--scrim-pill*` invariant tokens to `tokens.css` (defined once, not per-theme) and
reference them from both `components.css` and `profile-inline-edit.css`. Verify light +
dark after.

### T-quality — dead code + remaining truncateDid dedup
Findings: `dead-file-activity-contributor-board`, `dead-exported-functions`,
`dup-truncatedid-triplicated` (workspace one).
Owns:
- `src/components/contributor-board/activity-contributor-board.tsx` (DELETE — verified 0 imports)
- `src/components/landing/guilloche-art.tsx` (delete `GuillocheMeshQuiet`)
- `src/lib/atproto/hyperboard.ts` (delete `fetchContributorInformation`)
- `src/components/workspace/workspace-types.ts` (delete `scopeKey`)
- `src/lib/tour/tour-sentinel.ts` (delete `clearTourCompleted`)
- `src/components/workspace/workspace-pane.tsx` (truncateDid dedup → import shared)
Notes: **re-verify zero references** with grep before deleting each export (the finding
did, but confirm against the live tree). Remove any now-unused local helpers the deleted
functions alone referenced.

### T-tests — coverage for high-value untested security paths (test files only)
From the testing dimension (recorded as refuted only due to the lens mismatch — see
findings.md caveat). **Adds test files only; edits no source**, so it is disjoint from
every source track. Routes covered are owned by no other track.
Owns (new `__tests__` files next to each route):
- `src/app/api/groups/[groupDid]/password-reset/` — cross-account safety (`test-pwreset-cross-account-verify`, high)
- `src/app/api/onboarding/clone-blob/` — SSRF host-allowlist + `redirect:error` (`test-cloneblob-ssrf`, high)
- `src/app/api/groups/[groupDid]/members/` — anti-escalation (cannot add member as owner) (`test-members-owner-escalation`, medium)
- `src/app/api/groups/[groupDid]/upload-blob/` — content-type allowlist + size cap (`test-upload-blob-limits`, medium)
Notes: read each route + its existing sibling tests for mocking patterns before writing;
assert the security invariant, not implementation detail. If a route's real path is
different from the guessed one, locate it via `find`. These must not touch
`session/route.ts` or `feedback/route.ts` (T-sec-auth adds those tests).

## Commit order (orchestrator)

Security first, then platform, then perf/bundle, then a11y/render, then css, then
quality/tests:
1. `fix(security): harden SSRF filter + PDS proxy redirects/limits` (T-sec-ssrf)
2. `fix(security): per-target unlock throttle + stop feedback email relay` (T-sec-auth)
3. `fix(next): unblock /embed framing, server-redirect root, cache OG, robots` (T-next)
4. `perf(bundle): lazy-load TipTap editor + contributor board; memoize activity rows` (T-bundle)
5. `perf(render): memoize explore/endorsement rows; fix nested main; dedupe truncateDid` (T-render)
6. `perf(navbar): split context value; mark page title as h1` (T-navbar)
7. `fix(hooks): abort stale loadMore, dedupe activities, retry session` (T-hooks-correct)
8. `perf(hooks): batch project-item fetch; guard breakpoint resize` (T-hooks-perf)
9. `style(tokens): replace raw rgba with theme-aware tokens; add scrim tokens` (T-css)
10. `chore(cleanup): remove dead exports; dedupe truncateDid in workspace` (T-quality)
11. `test(security): cover password-reset, clone-blob SSRF, members, upload-blob` (T-tests)
