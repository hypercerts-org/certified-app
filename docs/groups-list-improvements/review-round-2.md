# Review round 2 — feat/groups-list-improvements

Two reviewers (code quality, functional/UX) ran against the round-1 fix commit. Both verdicts: `ship`. One **Important** item flagged independently by both reviewers; the rest are nits.

## Accepted

| # | Source | Item | Action |
|---|---|---|---|
| B1 | Functional Important + Code quality nit | `aria-label="Sort groups, current: <label>"` is redundant — native `<select>` already announces the selected `<option>` after the role | Revert to `aria-label="Sort groups"`. Keep the `title` attribute (different audience: sighted keyboard/mouse). |
| B2 | Both reviewers (nit) | Stale comment "reuse the lowercased label" — the label is no longer lowercased | Update comment + add a note that ES2019 `Array.prototype.sort` is stable so equal keys don't need an explicit tiebreak |
| B3 | Code quality nit | Two `as SortMode` casts inside the `onChange` validator | Extract a `isSortMode(v): v is SortMode` type predicate; `SORT_VALUES` widened to `ReadonlySet<string>` so the predicate's input doesn't need a cast |

## Rejected

| # | Source | Item | Rationale |
|---|---|---|---|
| C1 | Functional nit | Restructure the NaN sentinel: `const d = …; ts = d && !Number.isNaN(d.getTime()) ? d.getTime() : null` | Equivalent behavior, style preference. Current form is two lines and self-documents via `Number.isNaN(t) ? null : t`. |
| C2 | Code quality nit | Trim the `?? ""` defensive fallback on `currentSortLabel` | `?? ""` is harmless and keeps the type as `string` rather than `string \| undefined`, simplifying interpolation. Defensive but cheap. |

## Round 3?

Substantive items in round 2: 1 (B1). Below the ≥5 threshold for a follow-up round per the workflow rule. Both reviewers explicitly returned `ship` verdicts. **Stopping here.**
