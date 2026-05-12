# Review round 2 — desktop-layout

Two focused reviewers ran against `plan.md` after round 1's 36 items were integrated:

- **R2-Consistency** (cross-section sweep, internal contradictions, executability) → `ship-then-fix-nits`
- **R2-DesignFid** (re-check of the round-1 `block` verdict after A1/A2 integration) → `ship-then-fix-nits` (**block lifted**)

R-DesignFid confirmed both round-1 blockers fully landed: zero `720` mentions remain, `fill`/`filled` appears only in negation form, all token names referenced in the plan exist in `tokens.css`. The verdict shift from `block` → `ship-then-fix-nits` is the headline of round 2.

## Accepted

| # | Source | Severity | Item | Action |
|---|---|---|---|---|
| B1 | R2-Consistency #4 | Important | PR1 alone leaves ≥800px users with navbar-only navigation (no rails yet). Plan must guard against `staging → main` of PR1 in isolation. | Added "Merge guards" section under Implementation order: PR1 may merge to `staging` but the `staging → main` release PR bundles PR1 + PR2. |
| B2 | R2-DesignFid #1 | Important | At 1920px+ the rails + center will anchor-left unless an outer wrapper centers the unit. | Added explicit centering rule: outer wrapper `max-width: 1300px; margin: 0 auto` so the three-column unit centers in the viewport. Outer gutters on ultra-wide displays are passive whitespace per `DESIGN.md`. |
| B3 | R2-Consistency #1 | Nit | Skip-nav (9999) ranks below Feedback (10000) in the z-index map — unusual since skip-nav typically needs to be reachable above everything. | Confirmed intentional: when a modal is open, skip-nav isn't user-relevant; modal interaction is the active context. Reordered table for visual clarity (skip-nav listed before feedback) and added a parenthetical clarifying the feedback portal is existing/not-migrated. |
| B4 | R2-Consistency #2 | Nit | Feedback-modal's existing 10000 vs token migration scope ambiguous. | Clarified in z-index map row: "existing — NOT migrated to tokens in this PR; out of scope". File-ownership row for `feedback-modal.tsx` already lists only the `<=768` migration. Aligned. |
| B5 | R2-Consistency #6 | Nit | Open Question 3 (suggested-people data source) implicit but no resolution checkpoint in PR2 step ordering. | Added explicit prerequisite to PR2 implementation order: "resolve OQ3 in impl review before starting step 2." |
| B6 | R2-DesignFid #2 | Nit | `-0.005em` rail-label tracking is half DESIGN.md's display-size convention and may get "corrected" by a future contributor. | Added note to PR2's `DESIGN.md` update step: include rationale for the deliberate `-0.005em` tracking on rail labels (smaller-than-display intentional). |
| B7 | R2-DesignFid #3 | Nit | "Middle dot OR vertical bar" — pick one. | Picked middle dot `·` to match feed-card meta separator already used in `DESIGN.md`. Updated Visual specs row. |

## Rejected

| # | Source | Severity | Item | Rationale |
|---|---|---|---|---|
| Y1 | R2-Consistency #3 | — | "Open Question 1 / Decision 9 are redundant" | Confirmed intentional. Decision 9 documents the deferral; OQ1 carries the open thread forward. Two surfaces serve different reading paths (decision in scope; open question in followups). No action. |
| Y2 | R2-Consistency #5 | — | "Z2 rejection framing is stale" | Cosmetic. Z2's principle (consistent JS-unmount for focusable content) is in fact accepted via A24; the rejection label is correct only because Z2 proposed it as a standalone item that A24 subsumed. Leaving `review-round-1.md` as the as-of-then record. |
| Y3 | R2-DesignFid #4 | — | Active-state recipe specified in two places with slight shorthand differences | Cosmetic; both forms are equivalent. Could canonicalize in a future polish pass but not load-bearing for implementation. |

## Round 3?

Per the workflow rule: ≥5 substantive items → round 3 warranted. Round 2 surfaced **2 Important + 4 Nits**. Below the threshold. **Stopping.**

Both reviewers explicitly returned ship verdicts (R2-DesignFid: "Ship after nit 1 is incorporated — that's a 1-line addition, not a re-review."). A round 3 would be nit-picking on text polish, not catching design or correctness issues.

Plan is **implementation-ready**.
