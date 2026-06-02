# Round 2 — Methodology

## How this round was actually run

Round 1 was an unattended overnight pass with the full 8h budget.
Round 2 ran during an active workday in the user's session, so the
real envelope was closer to 90 minutes of focused work, not 8 hours.
The structure of the issue-87 brief was honored (phases 0-5, plan
with critiques, doc deliverables) but the scope of phase 4 was
sized to what was actually shippable in that window.

## What I searched / how I sized the surface

- Read round-1's `05-changelog.md`, `06-deferred.md`, and
  `07-methodology.md` end-to-end first.
- Captured a fresh baseline via direct gate runs:
  `npx tsc --noEmit`, `npm run -s lint`, `npm run -s test`,
  `npm run -s build`. Output saved to /tmp/baseline.txt.
- Spawned 4 explore-agents in parallel for the widened dimensions
  (test coverage, RSC/bundle, a11y + error-loading, state +
  prop-API). Each agent had a focused brief and a word cap so
  the output stayed actionable.
- Did an inline file-count + LOC inventory while the agents ran.

## What's different from round 1

### Worktree isolation: still skipped

Same trade-off as round 1. The 13 atomic refactors are small
enough that the integration cost of separate worktrees would dwarf
the merge overhead. Per-commit gate enforced directly on
`feat/positioning-redesign`. Revert-on-regression was in force but
never triggered.

### Reviewer agents: parallelized

Round 1 self-critiqued with a "reviewer hat". Round 2 spawned 4
parallel Explore agents on disjoint dimensions, then synthesized
their reports into `02-findings/findings.md`. The agent reports
caught real issues I wouldn't have spotted alone:

- A11y agent: Popover missing Escape handler (A-1) — landed as T19.
- State agent: `src/app/create/page.tsx` ref-during-render — landed as T03.
- Test agent: 53 hooks / 0 hook tests systemic gap — landed first hook test (T09).
- Bundle agent: `@tabler/icons-react` single-importer — deferred (T15 investigate).

The two false positives the agents reported (one was a wrong
banner alt-text claim that wasn't actually broken; another was the
endorse-reason-modal already using `onClose`) were caught when
verifying before changing — confirms the value of "verify before
fix" critique-2 added.

### Two critique rounds

`03-plan-critique-1.md` triggered real changes to v2:
- T04 split into T04a (focus restore, kept Tier 1) + T04b (Tab-
  cycle trap, deferred).
- T07-T09 bundled into one commit.
- T18 cache-ownership-docs added.
- T19 popover Escape added.

`03-plan-critique-2.md` had no structural pushback; just inline
clarifications. v3 == v2 with notes. The "stop reviewing when the
next pass would be nit-picking" rule held.

## What I trust about my own claims

- Every "0 importers" / "0 callers" claim was verified by
  `grep -rn` before action. No false-positive deletions.
- Gate runs ran inline after every commit; no regression slipped.
- The agent reports were treated as candidate inventory, not
  verdicts. The "no Tabler icon to drop yet" decision came from
  my own reading after the agent flagged it — the user owns the
  visual judgement.

## What was harder than expected

- The `useExplore` exhaustive-deps + memoization regression had
  two superficially-different lint errors that turned out to share
  one root cause: the loadMore useCallback and the load useEffect
  both captured the same 4 label arrays via closure without
  listing them as deps. The React Compiler's "memoization could
  not be preserved" is its way of saying "your manual memo has
  stale-deps risk". Fix was the same in both spots — list the
  arrays in deps even though the `*Key` strings are already there.
- The `useUrlParam` hook test needed careful mocking of
  `next/navigation` — the first hook test in the repo. The
  pattern (mockable module-level state for pathname/searchParams,
  vi.fn() router methods) is the template for future hook tests.

## Time budget actual

- Phase 0 (baseline + delta): ~15 min.
- Phase 1 (re-inventory): ~10 min — pragmatic catalog, not exhaustive.
- Phase 2 (findings): ~25 min, mostly waiting on parallel agents.
- Phase 3 (plan v1 → critique → v2 → critique → v3): ~15 min.
- Phase 4 (implementation, 13 tracks across 3 commits): ~30 min.
- Phase 5 (sweep + docs): ~10 min.

Total: ~105 minutes. Well under the 8h ceiling. Stopped where
the next-step rubric (visual / state-machine / judgement-heavy)
is what the human is best at.

## What I'd hand off

Top three remaining targets in descending order of value-per-risk:

1. **Tab-cycle focus trap on AppDialog** (T04b). The skeleton is
   in place from T04a; the next round can add the Tab/Shift-Tab
   keydown handler + focusables enumeration.

2. **URL-drive home-feed filters** (R2-T12). The /explore page's
   convention is the template; copying it to /home is mechanical
   but needs careful round-trip testing of the include/exclude
   tier mode toggle.

3. **Split `profile-lists.tsx`** (1450 LOC, the most over-budget
   file). Reasonable seams: master list view, item-row variants,
   create/edit modal, paste modal, search modal, item-removal
   dialog. Each is already a function in the file; splitting is
   mostly file moves + imports.
