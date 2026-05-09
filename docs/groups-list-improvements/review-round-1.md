# Review round 1 — feat/groups-list-improvements

Three reviewers (code quality, security, functional/UX) ran in parallel against PR #53. All three returned a `ship` or `ship-then-fix-nits` verdict — no critical findings. Items below are tracked as accepted (acted on this round) or rejected (with rationale).

## Accepted

| # | Source | Item | Action |
|---|---|---|---|
| A1 | Code quality #2 | Sort comparator redundantly lowercases before `localeCompare` | Drop `.toLowerCase()`, pass `{ sensitivity: "base" }` to `localeCompare` |
| A2 | Code quality #3 | `new Date(joinedAt).getTime()` runs O(n log n) times during sort | Decorate-sort-undecorate: pre-compute timestamps once |
| A3 | Code quality #4 | Bare `aria-hidden` is inconsistent with `aria-hidden="true"` elsewhere | Use the explicit form |
| A4 | Code quality #5 | `e.target.value as SortMode` is an unchecked cast | Validate against `SORT_OPTIONS` before setting state |
| A5 | Code quality #10 + Functional #1 | Tooltip on wrapper div is invisible to keyboard/AT users; current sort mode not announced | Move `title` onto the `<select>` and include the current mode in `aria-label` |
| A6 | Functional #2 | Owners' Leave-button tooltip is a dead-end ("Owners can't leave the group") | Add actionable guidance: "Owners can't leave — transfer ownership in group settings first" |
| A7 | Code quality #7 | `org.displayName \|\| org.handle` is repeated 6x | Extract a local `displayLabel` const inside `renderOrgItem` |

## Rejected

| # | Source | Item | Rationale |
|---|---|---|---|
| R1 | Code quality #1 | Persist `sortMode` to `localStorage` | Out of scope. User explicitly said "by default order them from oldest to newest" — persistence is a separate product decision. The PR body lists this in "Out of scope". |
| R2 | Code quality #6 | Inline `renderOrgItem` JSX in `.map()` instead of extracting | Style preference; helper improves the JSX-block readability. No perf signal. |
| R3 | Code quality #8 + #9 + Functional #3 | Prune `accepted` tie-break from `navbar.tsx`; mark `Group.accepted` optional | Out of scope. PR body explicitly leaves the navbar untouched. `accepted` is still set by `groups/create/page.tsx` and `add-org-modal.tsx`; deeper cleanup belongs in a follow-up. |
| R4 | Security nit | Wrap `console.error("Failed to leave group:", err)` to avoid logging full Error objects | Reviewer rated "Acceptable" — no token/cookie/secret in scope. Pre-existing pattern in the file. |
| R5 | Security important | Removing UserCheck/UserX is a privacy-UX regression (no in-app way to make a previously-public membership private) | User explicitly asked to remove these buttons. Already noted in PR "Out of scope". Flag is for product, not code. |
| R6 | Functional #5 | Safari/Firefox quirks of the transparent-select pattern | Reviewer said "not worth fixing pre-merge". Will be caught by manual smoke before staging→main if it surfaces. |

## Round 2?

Per workflow rule: "Run a follow-up round only if round 1 surfaced ≥5 substantive items." Substantive items here (Important): 2 (A5/A6, the AT/keyboard improvements). The rest are nits or perf polish. **Skipping round 2.**
