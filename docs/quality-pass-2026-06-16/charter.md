# Quality pass — 2026-06-16 (autonomous)

Autonomous multi-round review + fix of the last 3 days of merged work on `certified-app`.

## Scope

- **Review base:** `b6e2a15` (`test(setup): stub window.matchMedia ...`)
- **Target:** `staging` @ `0bc8c88` (== working branch head at start)
- **Diff:** 28 commits, 87 files, +7,833 / −1,210 (50 tsx, 20 ts, 17 css)
- **Working branch:** `chore/quality-pass-2026-06-16` (off `staging`)
- **End state:** Draft PR `chore/quality-pass-2026-06-16 → staging`, CI green. Never merge.

### Feature areas in scope
- Funding receipts + provenance attestation tags + "confirmed-by" filter (`src/components/explore-page/*`, `src/lib/atproto/funding-provenance.ts`, `src/hooks/use-funding-confirmed-by.ts`)
- ENS wallet-address resolution (`src/lib/ens/resolve-ens.ts`, `src/components/ui/wallet-address.tsx`)
- Indexer proxy + lib (`src/app/api/indexer/route.ts`, `src/lib/atproto/indexer.ts`)
- Product tour (`src/components/tour/*`, `src/lib/tour/*`)
- View transitions (`src/lib/view-transitions.tsx`, `src/app/styles/view-transitions.css`)
- Mobile detail/profile polish (`activity-detail.tsx`, `project-detail.tsx`, `profile-follow-endorse.tsx`, CSS)
- Landing AI section (`src/components/landing/sections/ai-world.tsx`)
- Explore list/search (`src/hooks/use-explore.ts`, `src/components/explore-page/explore.tsx`, `explore-list-row.tsx`)

### Out of scope
- Code outside the diff (flag only if a new change directly worsens it)
- The pre-existing 64-warning lint baseline, except warnings introduced by new code
- Local stashes / branches (ignored per user instruction)
- Dependency upgrades; product/UX redesigns

## Baselines (measured on `staging` @ 0bc8c88)
- **tsc:** 0 source errors (6 errors all in generated `.next/dev/types/validator.ts`)
- **lint:** 64 problems, 0 errors, 64 warnings
- **First-checks (CLAUDE.md):** to be re-run after each implementation round; all must stay silent

## Dimensions (each round)
1. Security · 2. Performance · 3. Correctness/bugs · 4. Code quality · 5. Reuse & design-system compliance · 6. Accessibility · 7. React/TS soundness

## Method (per round)
investigate → reviewers (1/dimension) → adversarial verification of every finding → synthesize plan → multi-reviewer plan critique → adapt → implement (disjoint file ownership) → verify (tsc/lint/build + first-checks) → implementation review → log decisions. Repeat until a round yields no new high-confidence worth-fixing items, or the 6h window closes.

## Guardrails
Commit per logical group with scope tags. Never merge. Never force-push main. Never `--no-verify`. Root-cause fixes only. Defer product-facing/ambiguous items to a "needs your call" list in the PR.

## Round log
- Round 1: complete. Review → 29 confirmed findings (`round-1-findings.md`); plan + 4-reviewer plan-review (`review-round-1-decisions.md`); implemented 8 tracks (16 commits); 3-reviewer implementation review → 6 nits, 0 blockers, applied. Verification green. See `summary.md`. **Converged** — no second round warranted (impl review surfaced only nits).
