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
0 fail · `npm run lint` monotonically decreasing, **final target ≤ 24 warnings**
(= 63 − 39 fixable; survivors each carry an inline justification) · `npm run build`
green · five CLAUDE.md grep checks silent.

## Phase 1 — parallel tracks (disjoint ownership)

### T1-home — feed row memoization + extraction
Files: `src/components/home/home-feed.tsx`; new `src/components/home/home-feed-rows.tsx`.
Findings: home-feed-rows-not-memoized (element-wise comparator per skeptic), endorsement-group-expand-unbounded, home-feed-rows-extract.
Commit: `perf(home): memoize feed rows, bound group expansion; extract row layer`

### T2-explore — explore render + data + decomposition
Files: `src/components/explore-page/explore.tsx`, `src/hooks/use-explore.ts`; new `src/components/explore-page/{explore-search-field,quality-filters,results-area}.tsx`, new loader module (e.g. `src/hooks/use-explore-loaders.ts`).
Findings: explore-search-state-too-high, all-view-overfetches-4x50-for-5, explore-quality-filters-extract, explore-results-area-extract, use-explore-loader-layer-split, ma-earth-projects-pds-fanout. Lint: use-explore.ts:322 suppress (explore-pipeline).
Commit: `perf(explore): isolate search keystrokes, right-size All view, batch Ma Earth projects; split loaders/filters/results`

### T3-detail — activity/project detail
Files: `src/components/feed/activity-detail.tsx`, `src/components/project/project-detail.tsx`, `src/hooks/use-context-updates.ts`, `src/lib/atproto/swap-drafts.ts`; new extraction file(s) under `src/components/feed/`, new shared contributor-helpers module under `src/lib/atproto/`.
Findings: context-updates-duplicate-fetch, route-rkey-effect-double-render, activity-detail-trailing-components-extract, contributor-helpers-dedupe. Plus the swap-drafts decision from dead-exports-sweep: investigate the conflict-banner flow; default = remove the never-read draft plumbing (loadDraft + saveDraft/clearDraft call sites) in these two files, or keep + wire nothing if actually referenced. Lint: activity-detail.tsx:1835 derive-during-render (same change as route-rkey), use-context-updates.ts:58 fetch-reset.
Commit: `perf(detail): cache context updates, derive route rkey; extract trailing components; drop dead draft plumbing`

### T4-graph — endorsement graph
Files: `src/components/visualization/endorsement-graph.tsx`, `src/hooks/use-endorsement-graph.ts`.
Findings: force-graph-perma-redraw-loop (per skeptic correction), force-graph-reheat-on-resize, endorsement-graph-sequential-chunks.
Commit: `perf(graph): pause redraw when idle, stop reheat on resize, parallelize chunk fetch`

### T5-profile — profile surfaces
Files: `src/components/profile/{profile-endorsements,profile-lists,endorsement-lists}.tsx`, `src/components/endorsements/endorsement-row.tsx`; new `src/components/endorsements/endorsement-subject-row.tsx`, new extraction files under `src/components/profile/`.
Findings: given-endorsements-duplicate-hook-call, endorsement-row-inline-ontoggle-defeats-memo, profile-endorsements-below-fold-split, profile-lists-modals-extract, endorsement-subject-row-triplicated (info+isLoading props per skeptic — hydration stays in callers).
Commit: `refactor(profile): shared endorsement subject row, single hook call, stable callbacks; split below-fold + modals`

### T6-hooks — data-hook caching family
Files: `src/hooks/{use-received-endorsements,use-followers,use-following,use-endorsements,use-endorsement-lists,use-cgs-memberships,use-hyperboard}.ts`, `src/lib/atproto/hyperboard.ts`; new `src/hooks/create-cached-did-resource.ts` + unit test.
Findings: received-endorsements-no-singleflight, followers-no-singleflight, following-no-singleflight, given-endorsements-no-cache, endorsement-lists-permanent-force, cgs-memberships-resolve-n-plus-1, hyperboard-displayprofile-waterfall, displayprofile-board-no-inflight, stale-cache-hook-skeleton (factory; migrate followers+following, others where clean).
Commit: `perf(hooks): single-flight caches for endorsements/followers/following, batch CGS resolution, collapse hyperboard waterfall; shared cached-resource factory`

### T7-server — API routes
Files: `src/app/api/indexer/route.ts` (+ new sibling modules for operations/validation), `src/app/api/xrpc/[...method]/route.ts`, `src/app/api/groups/register/route.ts`, `src/app/api/groups/[groupDid]/{profile,metadata}/route.ts`, `src/app/api/groups/memberships/route.ts`, colocated tests.
Findings: indexer-route-three-module-split (first), indexer-cacheable-get-variant, foreign-blob-no-smaxage, xrpc-get-eager-oauth-restore, xrpc-get-sequential-upstash-roundtrips, same-session-blob-no-cache-header, register-org-limit-walk-no-early-exit, register-org-limit-fail-open, groups-profile-metadata-no-cache-headers, cgs-fetches-missing-timeout.
Commit: `perf(api): cacheable indexer GET for public ops, blob/profile cache headers, lazy OAuth restore, CGS timeouts; split indexer route modules; close org-limit fail-open`

### T8-next — Next.js architecture
Files: `src/app/[actor]/page.tsx`, `src/components/settings/settings-panel.tsx`, `src/components/landing/sections/network-stats.tsx`, `src/components/landing/landing-page.tsx`, `src/hooks/use-network-counts.ts`, new server counts helper in `src/lib/atproto/`, `next.config.ts`, `src/app/{explore,endorsements,endorsement-graph}/page.tsx` (title fixes as found), `src/app/sitemap.ts`, `src/app/apps/page.tsx`, `src/app/home/page.tsx`, `src/app/project/new/page.tsx`.
Findings: profile-route-bundles-settings-and-all-tabs, welcome-stats-client-fetch, no-staletimes-router-cache, double-certified-title-suffix, sitemap-dead-about-url, apps-page-client-for-static-grid, missing-titles-home-project-new. Lint: use-network-counts.ts:72.
Commit: `perf(next): lazy profile tabs + settings, server-render landing stats, router staleTimes; metadata fixes`

### T9-lint-dead — lint sweep + dead code
Files: the 40 lint-warning files not owned by T2/T3/T8 (list in track brief), `src/lib/tour/tour-context.tsx` (audit-corrected clamp fix), dead hook files + their tests (use-display-profile, use-pending-awards-count, use-user-activities), dead exports (account-email readEmail, app-passwords lockAppPasswords, location parseLocationCoords de-export, urls.ts + activity-uri.ts wrappers + their test references), clipboard adoption (`add-to-list-menu.tsx`, `share-embed-dialog.tsx`, `custom-domain-modal.tsx`), onboarding-modal latent bug.
Lint budget: 39 fixable fixed, 23 suppressed with inline justification comments, 1 latent bug fixed.
Commit: `fix(lint): resolve 39 warnings, justify 23 suppressions; delete dead hooks/exports; adopt useCopyToClipboard everywhere`

### T10-types — boundary validation
Files: `src/hooks/use-activity.ts`, `src/lib/groups/org-context.tsx`, `src/lib/auth/auth-context.tsx`.
Findings: unvalidated-claim-activity-cast, org-context-unvalidated-group-parse, auth-login-error-body-unguarded-json.
Commit: `fix(types): validate activity records, org-context storage, auth error bodies at boundaries`

### T11-css — tokens + dead CSS + containment
Files: `src/app/styles/*.css` (all), `tailwind.config.ts`; TSX edits allowed ONLY to replace arbitrary z-index utility classes with tokened equivalents.
Findings: all 11 ds-conformance (z-index tokenization with side-by-side stacking table, error focus ring, status-color tokens, radius literals, modal shadow token, dead domain-modal backdrop), dead-css-blocks (respecting the live compound-selector carve-outs), no-content-visibility-long-lists (home + explore lists, with scroll-restoration check).
Commit: `style(css): tokenize z-index/shadows/status colors, remove ~640 lines dead CSS, add content-visibility to long lists`

## Phase 2 — sequential cross-cutting tracks (after all phase-1 commits)

### P2a-indexer — indexer client consolidation
Files: `src/lib/atproto/indexer.ts` (+ new domain modules with re-export shim), all 22 `postIndexer` call sites across lib/hooks/components, colocated tests.
Findings: indexer-post-wrapper-duplicated (rich `{ok,status,data,errors[]}` return per skeptic), lib-indexer-domain-split, indexer-fail-soft-swallows-http-errors. New helper gets a unit test.
Commit: `refactor(indexer): single postIndexer helper across 22 sites, domain-split lib, surface HTTP errors`

### P2b-helpers — shared derivation helpers
Files: `src/lib/urls.ts`, `src/lib/utils/format-date.ts`, `src/lib/atproto/collection.ts`, new `deriveIdentity` helper + the ~20 identity call sites, ~14 rkey call sites, 4 formatTimePeriod sites, 6+ projectPresentation sites (slot-aware `thumb|banner` per skeptic).
Findings: identity-fallback-chain-duplicated, rkey-extraction-five-implementations, format-time-period-four-copies, project-image-precedence-drift. Helpers get unit tests.
Commit: `refactor(shared): deriveIdentity/rkeyFromUri/formatTimePeriod/projectImage helpers replace 50+ duplicated sites`

## Verification & rollback

- After phase 1: full gates; orchestrator fixes integration friction; per-track commits.
- After each phase-2 track: full gates; commit.
- Implementation review round (functional correctness / code quality / perf-regression lenses); accepted fixes land as `fix(review): ...`; decisions recorded in review-round-1.md.
- Final: build + bundle-size delta vs 3.2 MB baseline; CLAUDE.md grep checks; Draft PR.
- Rollback: every track is one revertible commit on a feature branch; the PR is Draft and never auto-merged.
