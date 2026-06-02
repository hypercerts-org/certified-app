# Round 2 — Deferred items

## Carried over from round 1 (still deferred)

- **`loadDraft`** (`src/lib/utils/swap-drafts.ts`) — zero importers,
  but the "post-refresh restore" UI it pairs with hasn't shipped.
  Keep; revisit when the restore UI lands.
- **`clearRecentlyViewed`** (`src/lib/utils/recently-viewed.ts`) —
  zero importers; symmetric to the kept companions. Keep.
- **`pickAllowedFields<T>` generic** — same trade-off as round 1
  (the loose unknown return matches the runtime guarantee).
- **`extractError` / `extractRouteError` rename** — aesthetic only.
- **R-10 `app.bsky.actor.profile` / `app.certified.actor.profile`
  constant extraction** — desync risk against the XRPC allowlist.
- **T-1 `orbiting-logos.tsx` non-null assertions** — animation-
  timing-sensitive.
- **T-4 Tiptap storage casts** — fragile typing.
- **N-7 move `readableFoundedDate` to `lib/utils/format-date.ts`** —
  small net value.

## Round-2 explicit deferrals

### AppDialog Tab-cycle focus trap (T04b)

Round 2 shipped focus *restore* (R2-T04a) — closing a modal puts
focus back where it came from. The full Tab-cycle trap (where Tab
from the last focusable element wraps to the first, and Shift-Tab
from the first wraps to the last) is its own small refactor:
enumerate focusables, handle Tab / Shift-Tab keydown, re-query on
DOM mutation. Native `<dialog>` provides part of this in some
browsers but not all. Defer to round 3.

### URL-drive home-feed filter state (R2-T12)

The home-feed quality popover has two filter modes (include vs
exclude depending on whether unlabeled is checked). When read from
a URL, both modes must round-trip correctly. Round-2 plan v2
demoted this from Tier 1 to Tier 3 specifically because the
mode-toggle convention exists on /explore and copying it carefully
takes a focused track. Defer to round 3.

### Drop `@tabler/icons-react` (R2-T15)

The package is only used in `src/components/ui/cert-icon.tsx` and
adds ~43KB. Replacing with the closest Lucide equivalent is
plausible but requires the visual judgement on whether the new
icon reads as a "certificate". Defer — user-driven design call.

### Test `saveWithSwap` (R2-T17)

40-50 lines of test surface with non-trivial mocks for the
underlying agent. Worth doing but didn't fit the round-2 envelope.
Plan v2 marked Tier-3 explicitly.

### Test `ensureEndorsementDefinition`

Web Locks + cross-tab dedupe state machine. Mocking Web Locks is
heavy. Higher cost than the other test-floor work for round 2.

### 49 `react-hooks/set-state-in-effect` warnings

Each is a state-machine pattern where the lint is technically right
but the intent is correct. Round 1 deferred for the same reason;
round 2 confirms.

### 10 `@next/next/no-img-element` warnings

Each is a judgement call (sizing, blob URL constraints from the
xrpc proxy, immediate render priority for above-fold images vs
lazy below-fold). Round 1 deferred; round 2 confirms.

### 700–1200 LOC component files

`profile-lists.tsx` (1450), `profile-endorsements`,
`profile-overview`, `endorsement-lists`, etc. Splitting requires
judgement on where the seams belong. Round 1 deferred; round 2
confirms.

### Investigate `NotificationsContext` necessity (S agent observation)

The context wraps a Provider but most consumers tolerate null. May
be reducible to plain module exports + hooks. Low impact; defer.

### HomeFeedBody prop-drilling collapse (S agent observation)

8 props through a single intermediate. Worth a small refactor in
round 3 if combined with the larger HomeFeed split.

### `safeRedirect` AGENTS.md drift

Documentation issue, not code. Round 1 noted; round 2 confirms —
user-driven doc cleanup.

## Decisions made unilaterally in round 2

- **Tier-3 candidates promoted ad-hoc**: T16 (swap-drafts test)
  was Tier 3 in plan v2 but landed because it was small and
  high-value. T11 (parseSubjectInput audit) was Tier 2 but
  skipped — the existing tests cover the documented edge cases.
- **T14 (HomeFeed error surface) marked done without changes**:
  The hook already exposes `error` and HomeFeedBody already
  renders it (`Could not load activity: {error}`). Confirmed by
  reading the code; no commit needed.
- **T04 split into T04a (focus restore) + T04b (Tab-cycle trap)**
  per critique-1. T04a shipped; T04b deferred.
- **The 5 lint errors were the primary regressions** caught by
  round-2; round-1's deferred lint warnings stayed deferred for
  the same reasons.
