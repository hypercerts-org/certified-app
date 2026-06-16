# Plan review — round 1 decisions

4 reviewers (spec-correctness, autonomy-risk, sequencing-completeness, skeptic-value) critiqued the plan against the real code. Near-total convergence. Decisions below; the plan is revised to v2 accordingly.

## Accepted (plan changed)

| # | Item | Decision | Change |
|---|---|---|---|
| 1 | **correctness-2** — "default to remove" the server-side `confirmedBy` plumbing | **ACCEPTED (blocker ×3)** | It is deliberate forward-scaffolding for magic-indexer #214 (route.ts:825, indexer.ts:569 comments; matches project memory that funding work is blocked on #214). **Flip to KEEP + one doc comment.** Removal becomes a "needs your call" item, not an autonomous default. |
| 2 | **performance-1** — prefer option (b) batch-resolve | **ACCEPTED (×3)** | Option (b) needs forUri dedupe + porting `resolveActivityImageUrl`/title fallback + a prop-contract change across 4 row sites, and collides with Tracks 3/5/6 on `explore.tsx`. **Switch to option (a): uri-keyed module cache + in-flight coalescer in `useActivity`, mirroring `resolve-ens.ts`.** Self-contained, dedupes by construction, zero prop change. |
| 3 | **code-quality-4** — authorLabels derivation dup 4× | **ACCEPTED (blocker, dropped finding)** | Was missing from the plan entirely (triage math hid it). **Added to Track 2.** Honor caveats: `use-explore.ts` coerces empty→`undefined`, `indexer.ts` empty→`null` (parameterize sentinel); do NOT fold the `authors []→[]` line at indexer.ts ~320. |
| 4 | **correctness-1** — default filter semantics | **ACCEPTED w/ tight constraints (blocker ×4)** | Implement the **minimal** change only: when selection == default (all role buckets + empty third-parties), `matchesConfirmedBy` returns `true` (shows every receipt the count includes, incl. third-party-only and zero-attestation). **Non-default path byte-for-byte unchanged.** Touch all THREE surfaces (explore ResultsArea, All-view hardcoded block, activity-detail body+header count). Reconcile the explore.tsx:1215 "but not third-party-only ones" comment. **Unit tests are a HARD GATE.** Own commit. **Flag prominently in PR for sign-off** — this is product semantics. (Chose proceed-with-constraints over full defer: leaving "count says 12, list shows 0" live for 6h is the worse outcome, and per memory all prod receipts are third-party-only so the default view is currently empty.) |
| 5 | **accessibility-1** — row `role=button` re-architecture | **ACCEPTED → DEFER-AND-FLAG (important ×3)** | Re-architecting the grid/subgrid row + modal-trigger to the overlay pattern can't be layout/AT-verified without a browser; current state is functional (guarded mouse+keyboard), defect is ARIA-conformance only. **Defer to the PR's human-review list.** |
| 6 | **accessibility-2** — popover focus/role | **ACCEPTED w/ constraint (important ×2)** | Fix lives in the SHARED `ui/popover.tsx` used by Quality/Sort popovers. **Additive opt-in only** (new prop, e.g. `role="group"` + focus-first-focusable, used by Confirmed-by). Never change the default menuitem-roving. If not cleanly additive → defer. |
| 7 | **accessibility-6** — 36px tap targets | **ACCEPTED w/ constraint (important ×2)** | 36px was deliberately chosen for the right-pinned flex cluster. **Layout-neutral variant only:** invisible ≥44px hit region (padding/pseudo-element, visual box & flex width unchanged) OR correct the misleading "44px" comment. **Forbid hard-resize to 44×44.** |
| 8 | **accessibility-4** — tour inert background | **ACCEPTED w/ constraint (minor)** | Inert a **sibling** wrapper of the body-portal, never an ancestor (would kill the spotlight click-through / tour buttons / toasts). Verify tour Next/Back/Skip still operable. If no clean sibling → document the limitation (acceptable fallback). |
| 9 | **performance-3** — All-view page size cap | **ACCEPTED → DEFER (×3)** | Needs new page-size plumbing through the hook; client-side post-filtering means an aggressive cap silently under-fills blocks. Fetches are already parallel; option (a) of performance-1 removes the compounding cost. **Defer to attended follow-up.** |
| 10 | **performance-2** — memoize rows + ResultsArea | **ACCEPTED → DOWN-SCOPE (×2)** | `useExploreData` returns a fresh object literal each render, so `React.memo(ResultsArea)` is a no-op and forcing it risks staleness. **Scope to a single `useMemo` on the filtered receipts array** (keyed on stable inputs). Drop the row-level memo churn. |
| 11 | **security-1** — /api/ens limiter | **ACCEPTED w/ refinements** | Use **100/60** (match `resolve-handle`, not 120/60). Insert limiter **after** ADDRESS_RE validation, **before** the upstream fetch. Ensure the 429 carries **no** `s-maxage` (don't edge-cache a throttle). Keep fail-open. |
| 12 | **correctness-4** — reset count on did change | **ACCEPTED w/ refinement** | Prefer keying the value to `did` (treat mismatch as null) over raw `setCount(null)` in the effect, to **avoid re-adding a `set-state-in-effect` warning**. If the warning is unavoidable, also update the now-stale lines 19-21 comment. |
| 13 | **Verification criteria** — "Track 7 clears set-state-in-effect" | **ACCEPTED (inverted claim)** | correctness-3/-4 ADD `set-state-in-effect` hints (warn, not error). Restate: assert **0 lint errors, no NEW warning categories**; warnings may rise by the count of intentional sync-resets. Remove the "clears the warning" claim. |
| 14 | **code-quality-8** — mapWorkScope cast | **ACCEPTED (factual fix)** | The finding's fallback ("type as `WorkScopeCel`") would NOT compile (requires expression/usedTags/version/createdAt). **Just drop the `as`, no fallback.** |
| 15 | **code-quality-6** — unread `forCid` | **ACCEPTED → COMMENT not delete** | May be reserved for the same #214 strongRef-verification as `attestations`. **Add a reservation comment** in the existing forward-reference style instead of removing. |
| 16 | **code-quality-1** — delete kindChips | **ACCEPTED + extra** | Confirmed zero importers. Delete the 3 exports + their test block, **and** update the stale "kind chips" wording in the `funding-provenance.ts` docstring and `funding-receipt-row.tsx:86`. |
| 17 | **Track 3 commit grouping** | **ACCEPTED** | Split: correctness-1 (+tests) own commit; kindChips own commit; correctness-2 doc-only own commit; code-quality-7 own commit (low priority). |
| 18 | **Track 4 copy hook** | **ACCEPTED w/ scope** | Hook not component. Scope to the 2 in-range sites (CopyableValue, WalletAddress) + the 2 cleanly-foldable pre-existing (profile-sidebar, cert-locations-map) only if trivially mechanical. **Exclude custom-domain-modal** (2000ms tri-state). |
| 19 | **code-quality-2** — HydratedIdentityRow | **ACCEPTED w/ constraint** | Keep minimal (`did/size/className/noLink` only). If it accretes more props → drop and leave the duplication. |
| 20 | **File ownership** | **ACCEPTED** | `explore.tsx` + `use-explore.ts` co-owned by Tracks 2/3/5; edit order: **data/cache → correctness+comment → memoization LAST**. `funding-confirmed-by-popover.tsx` + `funding-receipt-row.tsx` co-owned by Tracks 2/6 (Track 2's extraction runs first). Triage note: raw 31 → 2 dropped FPs → 29. |

## Kept as-is (reviewer agreed or low-risk)
- **react-ts-1** (memoize ViewTransition context), **correctness-5** (finishRef) — trivial, safe; fold into the single Track 7 commit, don't gate on them.
- **security-2, react-ts-3, code-quality-3, code-quality-7** — proceed as planned.
- **design-system-2** (tour dialog) — remains deferred/documented.

## Implementation review (round 1) — outcomes

3 reviewers (functional-correctness, regression-hunter, completeness-rules) checked the committed diff; every finding was adversarially verified. **6 confirmed, all nit-level; 0 blockers, 0 regressions.** Actions:

| Finding | Action |
|---|---|
| All-view funding `.filter(matchesConfirmedBy(default))` is now provably always-true | **Fixed** — removed the vacuous filter (slice only); dropped the now-unused `DEFAULT_CONFIRM_ROLES` + `CONFIRM_ROLES` import. |
| `useActivity` cache-key comment said `\0` but code uses a space | **Fixed** — comment corrected (space is collision-free; DIDs/rkeys have no spaces). |
| activity-detail count==display comment overstates the guarantee for >100-receipt activities | **Fixed** — softened to note the page-1 (#214) window cap. |
| `resolve-ens` security-2 labelled "no behavior change" but it narrows accepted avatars | **Acknowledged (no code change)** — it is an intended defense-in-depth narrowing; rejected values (`javascript:`/`data:`/non-http) were never loadable as `<img>` and the proxy already drops them, so no real-path behavior changes. |
| accessibility-3 done via `role="group"` + `aria-labelledby` instead of "p → real headings" | **Accepted as-is** — for a filter popover, labelled groups are more correct than document headings (which would pollute heading-nav order). Recorded here as the deliberate choice. |
| Quality/Sort explore popovers also contain checkboxes under `role="menu"` (same pattern) | **Out of scope (follow-up)** — pre-existing popovers, not in the 3-day diff. The new `role="group"` opt-in on `ui/popover.tsx` makes fixing them a clean follow-up. |

Dropped (verified non-issues): default-count-vs-preview on the overview (matches staging, acceptable); the Quality/Sort item above (out of scope).

## Net effect
- **Deferred to PR "needs your call" / human-review list:** accessibility-1, performance-3, correctness-2 removal (kept+documented instead), correctness-1 semantics (implemented but flagged), accessibility-2/-4 if not cleanly doable.
- **Fix-now count:** 24 implemented this round + 2 documented (correctness-2, design-system-2) + 3 flagged/deferred (accessibility-1, performance-3) = 29 accounted for.
