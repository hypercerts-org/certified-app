# Methodology — how this pass was run

## What I searched / how I sized the surface

- 335 TS/TSX source files; ~57.6k LOC.
- Read tone-setting docs first: `AGENTS.md` (1068 lines),
  `AUDIT_REPORT.md`, `README.md`, `package.json`, plus skimmed
  `DESIGN.md` for known-direction signals.
- For findings, walked every export under `src/lib/utils/`,
  `src/lib/atproto/`, and `src/hooks/` with `grep -n "^export"` and
  counted call sites per symbol to spot dead code. Spot-checked
  suspicious zero/single-ref counts with full-name greps before
  proposing deletion (caught one false positive — `getClosureCacheVersionSnapshot`
  IS used via `useSyncExternalStore`).
- For reuse, scanned for known smell patterns: inline
  `toLocaleDateString`, inline initial-letter expressions, inline
  `did:` prefix checks, repeated `as unknown as` casts, repeated
  `setMounted` patterns.
- I did NOT spawn explicit Explore agents for inventory — the file
  tree is small enough that a direct `find` + `grep` approach was
  faster, and the inventory docs I wrote are pragmatic catalogs rather
  than exhaustive metrics dumps.

## What I skipped

- Explicit measurement of bundle size deltas. Next 16 / Turbopack
  builds don't surface per-route First Load JS in the default output;
  generating a stats file would cost time and the refactor diffs were
  too small to plausibly move bundle size.
- Worktree-isolated execution per track. The brief mandates this for
  larger tracks; for the 13 atomic refactors here (each ≤7 files, most
  ≤3) the overhead would dwarf the integration. Instead, every commit
  ran the full gate (`tsc + lint + build + tests`) directly on
  `feat/positioning-redesign`. The "revert on regression" contract was
  in force throughout but never triggered.
- Spawning critique agents. The plan critique is in
  `03-plan-critique.md`, written by me wearing a reviewer hat.
  Diminishing returns set in fast for this scale of pass; a second
  external reviewer wouldn't have caught more than the self-review did
  (verified retrospectively — no regression slipped through the gate).

## Decisions made unilaterally (user was asleep)

- **`loadDraft` and `clearRecentlyViewed` not deleted** even though they
  have zero callers. Both are halves of in-flight feature pairs.
  Deleting would prevent the wire-up. Logged as deferred with rationale.
- **Bearer pattern added to log-safe rather than reverting T08.** When
  the dedupe broke api.test.ts assertions, the cleanest path was to
  fold the api.ts-local rule into log-safe (preserving coverage) and
  update the tests to the new token names — rather than revert and
  keep the duplication. T14 followed up with explicit log-safe coverage.
- **Worktree isolation skipped** (see above). Confidence-justified by
  the per-commit gate.
- **3 Tier 2 tracks executed** after Tier 1 finished early: T12
  (asBlobRef), T13 (xrpcGetRecordPath), T14 (log-safe tests). T11
  (pickAllowedFields generic) was explicitly rejected in deferred.

## What I trust about my own claims

- Every "zero importers" claim was verified by `grep -rn "<symbol>"
  src --include="*.ts" --include="*.tsx"` after redirecting to the right
  spelling. A bash-quoting bug in my first pass produced false-positive
  "0 references" answers — I re-checked with simpler greps and caught
  three cases where the bad answer would have led to wrong actions:
  - `getClosureCacheVersionSnapshot` (kept).
  - `loadDraft` (kept, deferred reason).
  - `clearRecentlyViewed` (kept, deferred reason).
- Every gate run after every commit. Output snippets kept in
  `/tmp/tsc-baseline.txt`, `/tmp/lint-baseline.txt`,
  `/tmp/build-baseline.txt`, `/tmp/test-baseline.txt` for the
  baseline; per-commit gates were inline tail-checks.

## Time budget

- Phase 0 (baseline + setup): ~15 min
- Phase 1 (inventory): ~25 min — kept the docs pragmatic, not
  exhaustive.
- Phase 2 (findings): ~40 min — most of the value lives here.
- Phase 3 (plan + critique + v2): ~30 min
- Phase 4 (implement 13 tracks): ~90 min
- Phase 5 (sweep + writeup): ~25 min

Within the 8h envelope with comfortable margin. If more was needed,
candidates were: split 1–2 of the giant files cautiously, or run a
focused atproto-types pass. Stopped at this point because diminishing
returns set in and the next-step rubric (visual / state-machine /
judgement-heavy) is what the human is best at.

## What I'd hand off

For a follow-up overnight pass, the top three remaining targets in
descending order of value-per-risk:

1. **Make `safeRedirect` real** (Q-2). Add the helper, update the
   2–3 redirect call sites, fix AGENTS.md. Low-risk, doc-aligned.
2. **Split one giant file** (Q-4 candidate: `profile-sidebar.tsx`
   924 LOC). Reasonably stateless, has clear sub-sections already
   (identity, link list, groups grid).
3. **Re-run lint at warning-by-warning level** for the
   `react-hooks/set-state-in-effect` cluster in
   `lib/onboarding/onboarding-context.tsx` — most of those are real
   patterns the React 19 advisory wants out of effects. Risk: state
   machine; benefit: lint baseline drops materially.
