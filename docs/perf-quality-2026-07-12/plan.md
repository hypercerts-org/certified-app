# Implementation plan — performance & code-quality pass (2026-07-12)

Executes every confirmed finding from [findings.md](./findings.md) — 73 findings +
63 triaged lint warnings. **Nothing is deferred.** Where a skeptic issued a fix
correction, the corrected fix is the spec.

## Ground rules

- Branch: `perf/quality-pass-2026-07-12` (off `staging` @ `6dd73dd`). Draft PR into
  `staging` at the end. Never merged by the agent.
- **Disjoint file ownership.** Phase-1 tracks run in parallel in one working tree;
  every file belongs to exactly one track (table below). A track may create new
  files only inside its area and owns the `__tests__` files colocated with its
  sources. If tsc shows errors in files a track does not own, that is another track
  mid-flight — ignore them.
- Phase-2 tracks are cross-cutting (shared helpers with 15–22 call sites); they run
  **sequentially after all phase-1 commits**, so they see the final file layout.
- Implementers do not run git commands; the orchestrator stages per-track file sets
  and commits (one commit per track, conventional scope tag, no emojis).
- Tests may change only when an internal API they exercise changes shape; never
  weaken an assertion. New shared helpers get unit tests.
- Baselines @ `6dd73dd`: tsc clean, typecheck:test clean, lint 63 warnings/0 errors,
  1024/1024 tests, build green, client chunks 3.2 MB.

## Gates (after phase 1, after each phase-2 track, and finally)

`npx tsc --noEmit` clean · `npm run typecheck:test` clean · `npm test` ≥1024 pass /
0 fail · `npm run lint` **≤2 warnings (expected 0) and 0 unused-disable-directive
warnings** — the 23 suppression sites carry inline eslint-disable + justification ·
`npm run build` green · five CLAUDE.md grep checks silent.

## Phase 0 — shared helpers (sequential, before phase 1)

`postIndexer` (rich `{ok,status,data,errors[]}` shape) added to
`src/lib/atproto/indexer.ts`; `deriveIdentity` (options bag) added as
`src/lib/utils/identity.ts`; both with unit tests. T6 builds on postIndexer, T5 on
deriveIdentity; P2a/P2b later migrate only the remaining legacy sites.
Commit: `feat(lib): add postIndexer and deriveIdentity shared helpers`

## Phase 1 — parallel tracks (disjoint ownership)

### T1-home — feed row memoization + extraction
Files: `src/components/home/home-feed.tsx`; new `src/components/home/home-feed-rows.tsx`.
Findings: home-feed-rows-not-memoized (element-wise comparator per skeptic), endorsement-group-expand-unbounded, home-feed-rows-extract.
Commit: `perf(home): memoize feed rows, bound group expansion; extract row layer`

### T2-explore — explore render + data + decomposition
Files: `src/components/explore-page/explore.tsx`, `src/hooks/use-explore.ts`; new `src/components/explore-page/{explore-search-field,quality-filters,results-area}.tsx`, new loader module (e.g. `src/hooks/use-explore-loaders.ts`).
Findings: explore-search-state-too-high, all-view-overfetches-4x50-for-5, explore-quality-filters-extract, explore-results-area-extract, use-explore-loader-layer-split. Lint: use-explore.ts:322 suppress (explore-pipeline). Also owns `src/components/explore-page/explore-types.ts`; extraction named `explore-results.tsx`. (ma-earth-projects-pds-fanout moved to phase 1.5.)
Commit: `perf(explore): isolate search keystrokes, right-size All view, batch Ma Earth projects; split loaders/filters/results`

### T3-detail — activity/project detail
Files: `src/components/feed/activity-detail.tsx`, `src/components/project/project-detail.tsx`, `src/hooks/use-context-updates.ts`, `src/lib/utils/swap-drafts.ts` (loadDraft/saveDraft/clearDraft + the two detail call sites only; `clearAllDraftsForViewer` and auth-context.tsx untouchable), `src/components/context/update-form.tsx`; new extraction file(s) under `src/components/feed/`, new shared contributor-helpers module under `src/lib/atproto/`.
Findings: context-updates-duplicate-fetch, route-rkey-effect-double-render, activity-detail-trailing-components-extract, contributor-helpers-dedupe. Plus the swap-drafts decision from dead-exports-sweep: investigate the conflict-banner flow; default = remove the never-read draft plumbing (loadDraft + saveDraft/clearDraft call sites) in these two files, or keep + wire nothing if actually referenced. Lint: activity-detail.tsx:1835 derive-during-render (same change as route-rkey), use-context-updates.ts:58 fetch-reset.
Commit: `perf(detail): cache context updates, derive route rkey; extract trailing components; drop dead draft plumbing`

### T4-graph — endorsement graph
Files: `src/components/visualization/endorsement-graph.tsx`, `src/hooks/use-endorsement-graph.ts`.
Findings: force-graph-perma-redraw-loop (per skeptic correction), force-graph-reheat-on-resize, endorsement-graph-sequential-chunks. Plus: switch the AllEndorsements loader in use-endorsement-graph.ts to the phase-fixed indexer GET contract (from finding 22; T7 builds the endpoint concurrently).
Commit: `perf(graph): pause redraw when idle, stop reheat on resize, parallelize chunk fetch`

### T5-profile — profile surfaces
Files: `src/components/profile/{profile-endorsements,profile-lists,endorsement-lists}.tsx`, `src/components/endorsements/endorsement-row.tsx`; new `src/components/endorsements/endorsement-subject-row.tsx`, new extraction files under `src/components/profile/`.
Findings: given-endorsements-duplicate-hook-call, endorsement-row-inline-ontoggle-defeats-memo, profile-endorsements-below-fold-split, profile-lists-modals-extract, endorsement-subject-row-triplicated (info+isLoading props per skeptic — hydration stays in callers; built on phase-0 deriveIdentity; EndorsementRow keeps its did-based public props). Adds a render test for the shared row. Must NOT touch use-endorsements.ts (T6's).
Commit: `refactor(profile): shared endorsement subject row, single hook call, stable callbacks; split below-fold + modals`

### T6-hooks — data-hook caching family
Files: `src/hooks/{use-received-endorsements,use-followers,use-following,use-endorsements,use-endorsement-lists,use-cgs-memberships,use-hyperboard}.ts`, `src/lib/atproto/hyperboard.ts`; new `src/hooks/create-cached-did-resource.ts` + unit test.
Findings: received-endorsements-no-singleflight, followers-no-singleflight, following-no-singleflight, given-endorsements-no-cache, endorsement-lists-permanent-force, cgs-memberships-resolve-n-plus-1, hyperboard-displayprofile-waterfall, displayprofile-board-no-inflight, stale-cache-hook-skeleton (factory; migrate followers+following, others where clean). given-endorsements-no-cache scope: in-flight single-flight map inside use-endorsements.ts ONLY — the call-site dedup in profile-endorsements.tsx is T5's. Rewritten fetchers use phase-0 postIndexer.
Commit: `perf(hooks): single-flight caches for endorsements/followers/following, batch CGS resolution, collapse hyperboard waterfall; shared cached-resource factory`

### T7-server — API routes
Files: `src/app/api/indexer/route.ts` (+ new sibling modules for operations/validation), `src/app/api/xrpc/[...method]/route.ts`, `src/app/api/groups/register/route.ts`, `src/app/api/groups/[groupDid]/{profile,metadata}/route.ts`, `src/app/api/groups/memberships/route.ts`, colocated tests.
Also adds the `CollectionsByUris` op + buildVariables case (server side of finding 19) and the new tests from plan review: xrpc lazy-restore suite, indexer GET allowlist/cache-header suite. GET contract: `GET /api/indexer?op=<name>[&first=<n>][&after=<cursor>][&badgeType=<t>]` → same body as POST; 400 outside CACHEABLE_OPS; counts get `s-maxage=300, stale-while-revalidate=86400`, AllEndorsements `s-maxage=60, stale-while-revalidate=600`; no Cache-Control on upstream non-200 or `errors` body. Lands as 3 commits (indexer files / xrpc file / groups files).
Findings: indexer-route-three-module-split (first), indexer-cacheable-get-variant, foreign-blob-no-smaxage, xrpc-get-eager-oauth-restore, xrpc-get-sequential-upstash-roundtrips, same-session-blob-no-cache-header, register-org-limit-walk-no-early-exit, register-org-limit-fail-open, groups-profile-metadata-no-cache-headers, cgs-fetches-missing-timeout.
Commit: `perf(api): cacheable indexer GET for public ops, blob/profile cache headers, lazy OAuth restore, CGS timeouts; split indexer route modules; close org-limit fail-open`

### T8-next — Next.js architecture
Files: `src/app/[actor]/page.tsx`, `src/components/settings/settings-panel.tsx`, `src/components/landing/sections/network-stats.tsx`, `src/components/landing/landing-page.tsx`, `src/hooks/use-network-counts.ts`, new server counts helper in `src/lib/atproto/`, `next.config.ts`, title-suffix fixes in the three actual offending pages (`src/app/workspace/page.tsx` confirmed; re-grep for the others), `src/app/sitemap.ts`, `src/app/apps/page.tsx`, `src/app/home/page.tsx`, `src/app/project/new/page.tsx`.
Findings: profile-route-bundles-settings-and-all-tabs, welcome-stats-client-fetch (server helper named `network-counts-server.ts`, queries inlined, fail-soft unit test), no-staletimes-router-cache, double-certified-title-suffix, sitemap-dead-about-url, apps-page-client-for-static-grid, missing-titles-home-project-new. Lint: use-network-counts.ts:72 + network-stats.tsx:135 suppression.
Commit: `perf(next): lazy profile tabs + settings, server-render landing stats, router staleTimes; metadata fixes`

### T9-lint-dead — lint sweep + dead code
Files: the 40 lint-warning files not owned by T2/T3/T8 (list in track brief), `src/lib/tour/tour-context.tsx` (audit-corrected clamp fix), dead hook files + their tests (use-display-profile, use-pending-awards-count, use-user-activities), dead exports (account-email readEmail, app-passwords lockAppPasswords, location parseLocationCoords de-export, urls.ts + activity-uri.ts wrappers + their test references), clipboard adoption (`add-to-list-menu.tsx`, `share-embed-dialog.tsx`, `custom-domain-modal.tsx`), onboarding-modal latent bug.
Lint budget: 39 fixable fixed, 23 suppressed with inline justification comments, 1 latent bug fixed.
app-dialog.tsx moved to T11. Onboarding-modal: prefer key-remount (clears the warning); fallback bug-fix + suppression #24. Adds tour-context shrink-clamp test.
Lands as 3 commits: lint-mechanical / dead-code deletion / behavioral fixes (onboarding-modal, tour-context).

### T10-types — boundary validation
Files: `src/hooks/use-activity.ts`, `src/lib/groups/org-context.tsx`, `src/lib/auth/auth-context.tsx`.
Findings: unvalidated-claim-activity-cast, org-context-unvalidated-group-parse, auth-login-error-body-unguarded-json.
Commit: `fix(types): validate activity records, org-context storage, auth error bodies at boundaries`

### T11-css — tokens + dead CSS + containment
Files: `src/app/styles/*.css` (all), `tailwind.config.ts`, `src/components/ui/app-dialog.tsx` (shadow swap :376 + unused-disable removal :331), `src/components/ui/bottom-sheet.tsx` + `src/components/ui/checkbox.tsx` (arbitrary z-index classes only). No other TSX edits.
Findings: all 11 ds-conformance (z-index tokenization with side-by-side stacking table, error focus ring, status-color tokens, radius literals, modal shadow token, dead domain-modal backdrop), dead-css-blocks (respecting the live compound-selector carve-outs), no-content-visibility-long-lists (home + explore lists, with scroll-restoration check).
Commit: `style(css): tokenize z-index/shadows/status colors, remove ~640 lines dead CSS, add content-visibility to long lists`

## Phase 1.5 — ma-earth batch fetch (sequential, after phase-1 commits)

Files: `src/lib/atproto/indexer.ts` (add `fetchIndexerProjectsByUris`), `src/hooks/use-explore.ts` (or its post-split loader module).
Finding: ma-earth-projects-pds-fanout — batch via T7's new CollectionsByUris op, **fail-soft fallback to the existing per-URI PDS path** if the indexer rejects the filter (no cross-repo blocking).
Commit: `perf(explore): batch Ma Earth project fetch via indexer with PDS fallback`

## Phase 2 — sequential cross-cutting tracks (after phase 1.5)

Ground rule: re-enumerate every call site by grep at track start — findings line
refs are advisory (phase 1 moved code). Phase 0 already created the helpers; these
tracks migrate the remaining legacy sites.

### P2a-indexer — indexer client consolidation
Files: `src/lib/atproto/indexer.ts` (+ new domain modules with re-export shim), all 22 `postIndexer` call sites across lib/hooks/components, colocated tests.
Findings: indexer-post-wrapper-duplicated (helper exists from phase 0 — migrate remaining sites), lib-indexer-domain-split, indexer-fail-soft-swallows-http-errors. Plus the fetchCount POST→GET switch (finding 22 remainder).
Commit: `refactor(indexer): single postIndexer helper across 22 sites, domain-split lib, surface HTTP errors`

### P2b-helpers — shared derivation helpers
Files: `src/lib/urls.ts`, `src/lib/utils/format-date.ts`, `src/lib/atproto/collection.ts`, new `deriveIdentity` helper + the ~20 identity call sites, ~14 rkey call sites, 4 formatTimePeriod sites, 6+ projectPresentation sites (slot-aware `thumb|banner` per skeptic).
Findings: identity-fallback-chain-duplicated, rkey-extraction-five-implementations, format-time-period-four-copies, project-image-precedence-drift. Helpers get unit tests.
Commit: `refactor(shared): deriveIdentity/rkeyFromUri/formatTimePeriod/projectImage helpers replace 50+ duplicated sites`

## Verification & rollback

- After phase 1: full gates BEFORE any commit; orchestrator fixes integration friction; per-track commits staged by file list in dependency order. (Recorded limitation: phase-1 commits are logical units from the end-state tree, not individually CI-verified snapshots.)
- Canary check as soon as T1/T2/T3/T5 report done: tsc + use-endorsement-lists-stale-closure + use-given-endorsements-dedup tests.
- After each phase-2 track: full gates; commit.
- Implementation review round (functional correctness / code quality / perf-regression lenses); accepted fixes land as `fix(review): ...`; decisions recorded in review-round-1.md.
- Final: build + bundle-size delta vs 3.2 MB baseline; CLAUDE.md grep checks; Draft PR.
- Rollback: every track is one revertible commit on a feature branch; the PR is Draft and never auto-merged.
