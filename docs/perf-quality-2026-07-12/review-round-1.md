# Plan review round 1 — decisions (2026-07-12)

Two reviewers: (A) file-ownership disjointness & hidden coupling; (B) sequencing,
risk & test strategy. Every item accepted/rejected with rationale; the plan and
track briefs are updated accordingly.

## Accepted

- **C1 (A) app-dialog.tsx double ownership (T9 lint :331 vs T11 shadow :376).**
  app-dialog.tsx moves wholly to T11 (does both edits). T11's TSX carve-out widened
  to: arbitrary z-index classes (`ui/bottom-sheet.tsx` z-[71]/z-[70],
  `ui/checkbox.tsx` z-[1]) + the app-dialog shadow swap. Nothing else.
- **C2 (A) finding 9/15 duplicate spec (T5 vs T6).** The call-site dedup in
  profile-endorsements.tsx is T5's. T6's scope for `given-endorsements-no-cache` is
  ONLY an in-flight single-flight map inside use-endorsements.ts (skeptic already
  rejected the TTL cache). T5 must not add caching to the hook.
- **C3 (A) + item 1b/2 (B) ma-earth finding 19 collision + cross-repo gate.**
  Split three ways: T7 (owns the route + split) adds the `CollectionsByUris` proxy
  op + buildVariables case; a new sequential **phase 1.5** (after phase-1 commits)
  adds `fetchIndexerProjectsByUris` to lib and swaps use-explore.ts to it **with a
  fail-soft fallback to the existing per-URI PDS path** — so the change ships even
  if magic-indexer lacks `where:{uri:{in}}` (no cross-repo blocking, honoring
  no-deferral safely).
- **C4 (A) finding 22 client switches unassigned.** T7 ships the GET handler only.
  GET contract fixed now so parallel tracks code against it:
  `GET /api/indexer?op=<name>[&first=<n>][&after=<cursor>][&badgeType=<t>]` →
  same body as POST; 400 outside CACHEABLE_OPS; `Cache-Control: public,
  s-maxage=300, stale-while-revalidate=86400` for zero-variable count ops,
  `s-maxage=60, stale-while-revalidate=600` for AllEndorsements pages; no
  Cache-Control when upstream non-200 or body has `errors`. AllEndorsements client
  switch → T4 (its file). fetchCount switch → P2a.
- **G1 (A).** T8's double-suffix file is `src/app/workspace/page.tsx` (not
  endorsements). T5 constrained: EndorsementRow keeps its did-based public props;
  hydration stays inside it as a caller of the shared row.
- **G2 (A).** swap-drafts is `src/lib/utils/swap-drafts.ts`; T3 scope =
  loadDraft/saveDraft/clearDraft + the two detail-file call sites + colocated test;
  `clearAllDraftsForViewer` and auth-context.tsx are untouchable (T10's file).
- **G3 (A).** T3 gains `src/components/context/update-form.tsx` (invalidate
  context-updates cache on save).
- **G4 (A).** T10 gains `src/hooks/use-project-items.ts` (+ test) — same
  `coerceClaimActivityValue` guard as use-activity.ts.
- **G5 (A).** T2 gains `src/components/explore-page/explore-types.ts`; extraction
  file name fixed to `explore-results.tsx`.
- **G6 (A).** network-stats.tsx:135 animation-driver suppression → T8's brief.
- **G7 (A).** T8's server helper named `network-counts-server.ts` (P2a reserves
  `indexer-counts.ts`); T8 inlines its five count queries, no imports from T7's
  in-flight modules.
- **1 (B) Phase 0.** New sequential pre-phase: create `postIndexer` (rich
  `{ok,status,data,errors[]}` shape, in lib/atproto/indexer.ts) and
  `deriveIdentity` (options bag, in `src/lib/utils/identity.ts`) + unit tests,
  committed before phase 1. T6 builds its rewritten fetchers on postIndexer; T5
  builds the shared subject row on deriveIdentity. P2a/P2b then only migrate the
  remaining legacy sites (re-enumerated by grep — see next).
- **3 (B).** P2 ground rule added: re-enumerate all call sites by grep at track
  start; findings line refs are advisory (phase 1 moved code).
- **4 (B) lint gate restated.** Suppressions are eslint-disable directives and
  vanish from output: final gate is **≤2 warnings** (expected 0), plus **0
  unused-disable-directive warnings**; the 23 suppression sites carry inline
  justifications. Onboarding-modal: T9 prefers the key-remount restructure (fix
  clears the warning); falls back to bug-fix + suppression #24 if the restructure
  isn't clean.
- **5 (B) missing tests added to briefs.** T7: xrpc lazy-restore (foreign GET with
  cookie never calls getOAuthClient; failed restore → 401 + deleteSession;
  same-repo restore-failure falls back public) + indexer GET allowlist/cache-header
  suite. T8: server-counts fail-soft unit test. T5: shared subject-row render test.
  T9: tour-context shrink-clamp test.
- **7 (B) commit splits** where file-disjoint from end state: T9 → 3 commits
  (lint-mechanical / dead-code / behavioral onboarding+tour). T7 → 3 commits
  (indexer route files / xrpc file / groups files). Finding 19 already its own
  phase-1.5 commit. T11 stays one commit — content-visibility edits share files
  with tokenization, so an end-state file split is unreliable; the hunk is small
  and independently revertible.

## Partially accepted

- **6 (B) mid-flight gates.** Full per-track-commit compile verification is
  unattainable in a shared working tree without serializing the tracks (commits are
  staged from the end state). Accepted instead: gates run once after phase 1
  before any commit; commits ordered by dependency; the two canary tests
  (use-endorsement-lists-stale-closure, use-given-endorsements-dedup) plus tsc run
  as soon as the extraction-heavy tracks (T1/T2/T3/T5) report done. Recorded
  limitation: individual phase-1 commits are logical units, not individually
  CI-verified snapshots (same trade the 2026-07-02 pass made).

## Rejected

- **(B) treating manual browser checks as blocking gates.** Local dev against real
  data isn't available mid-pass; the ≥1300px visual checks (subject-row surfaces,
  explore scroll restoration, home back-nav) go into the PR test-plan checklist for
  staging-preview verification instead. Rationale: CI gates cover compile/tests;
  visual parity items are enumerated, not silently dropped.
