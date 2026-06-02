# Round 2 — Plan v1 critique

Wearing a reviewer hat. Concerns about plan v1, decisions made.

## C1: T04 AppDialog focus trap — scope is bigger than peers

Adding a proper Tab-cycle focus trap inside AppDialog is its own
small refactor: enumerate focusables, handle Tab/Shift-Tab, deal
with elements that become focusable async. **Accepted concern.**
Split into two: (a) save+restore previous focus on mount/unmount —
small, ships now; (b) Tab-cycle trap — defer to round 3.

## C2: T02 useExplore memoization is the riskiest single track

The `loadMore` useCallback captures 4 label arrays via closure. Two
fix shapes:

(a) Add the labels to the useCallback deps. Each label change will
re-create `loadMore`. Existing consumers (IntersectionObserver in
the parent) won't care.

(b) Stash labels in a ref, read via ref. Avoids re-creation but
introduces a new ref dance.

**Decision: go with (a)**. Simpler, fewer moving parts, the React
compiler will be happy. The downside (re-create on every label
change) is harmless — `loadMore` is consumed by a stable callback
prop on the IntersectionObserver wrapper.

## C3: T07 / T08 / T09 are all small. Bundle them.

Three test additions, all ≤30 lines each. They're independent files
but share the testing infrastructure. **Accepted.** Bundle into one
commit "test: cover round-1 extractions + useUrlParam".

## C4: T05 — verify the directive removal doesn't break SSR

Dropping `"use client"` from cert-icon.tsx and loading-spinner.tsx
means they'll render server-side. If either imports a Lucide icon
from a side-effecty module, we'd hit an RSC-incompatibility error
at build time. **Concern accepted but cheap to verify**: the build
gate catches it. If it breaks, revert that file's directive only.

## C5: T-12 URL-drive home-feed filters — verify the indexer

The home-feed quality filter has two modes (include vs exclude
depending on whether unlabeled is checked). When read from the URL,
both modes must round-trip correctly. **Accepted concern but the
mode-toggle is already URL-readable conceptually** — the URL just
needs the same convention as the explore page: a `?quality=` param
that holds the included-set as comma-separated slugs. **Defer to
Tier-2 status** — promote if time, don't block on it.

## C6: Missing track — cache ownership documentation

S-7 in findings notes that `use-following` and `use-typed-lists`
both maintain module-level caches but only one invalidates. This is
documentation, not behavior change. **Accepted.** Add as R2-T18 in
v2: 5-line comment on each cache explaining ownership.

## C7: Missing track — A1 keyboard handlers on filter popover

The explore page's filter popover (Sort/Quality/etc.) doesn't
handle Escape from the popover content. `useClickOutsideClose`
provides Escape on the outer wrapper but only when focus is on a
focusable element bound to the doc. **Accepted.** Add as R2-T19
in v2.

## C8: Tier-1 is already large

T01-T09 = 9 tracks. The plan brief says "stop reviewing when the
next pass would be nit-picking". Tier-2 + Tier-3 add 6 more. With
the 8h budget, that's fine; but in this actual run (a workday
slice, not overnight) we're going to prioritize Tier-1 + maybe 2-3
from Tier-2.

## Net changes to ship in v2

- T04 splits: T04a (focus save/restore) — keep Tier 1. T04b (tab cycle) — defer to round 3.
- T02 specifies fix (a): add deps to useCallback / useEffect.
- T07/T08/T09 bundle into one commit.
- New: T18 cache ownership docs (Tier 2).
- New: T19 explore popover Escape handler (Tier 1, IMPORTANT a11y).
