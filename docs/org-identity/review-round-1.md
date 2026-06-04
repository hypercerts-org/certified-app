# Org-identity aggregation — review round 1 (decisions)

A 6-lens review (data-flow, security, react, flag-off/backward-compat, UX,
tests) over `feat/org-identity-aggregation`, each finding adversarially
verified before counting. 17 confirmed findings. All but one (a documented
non-required micro-optimization) integrated.

## Accepted & fixed

### Major
1. **Home sidebar misattribution** (data-flow). When the viewer switched
   into any group, the "via {group}" byline was dropped for *all* rows but
   the list was never filtered to that group — so personal + other-group
   records rendered with no provenance, implying they belonged to the
   focused group. **Fix:** removed the `activeOrg` coupling from the Home
   sidebar entirely. Home always shows the full managed aggregate with
   provenance *always* visible (acting-as is read-scope and never strips
   "yours"); the dedicated `/managed` hub is where the focus filter narrows
   to one owner. "Show more" now points at `/managed` (the aggregate it
   previews), not the personal profile tab.
2. **Edit eligibility gated on `activeOrg`** (data-flow). A record surfaced
   via read-aggregation couldn't be edited unless the viewer first switched
   the org switcher to its group — the read→edit path was broken. **Fix:**
   eligibility now derives from the managed-author set (`useManagedAuthors`:
   personal + owned/admin groups), not the switcher. Both edit pages also
   wait on the managed-author load for non-personal records so a group
   record the viewer manages doesn't flash "you can't edit". The BFF still
   re-checks role server-side.
3. **ViaByline invisible to screen readers** (UX/a11y). Every child was
   `aria-hidden` and the outer `aria-label` on a roleless span isn't
   reliably announced. **Fix:** the visible "via {name}" text is now the
   accessible name; only the avatar is hidden; the role is appended sr-only
   so SR reads "via {name}, {role}".
4. **owner-tag.ts untested** (tests). The load-bearing tagging logic,
   including the "never label a stranger You" safety branch, had no direct
   coverage. **Fix:** added `owner-tag.test.ts`.

### Minor
5. Home "Show more" count/destination mismatch → pointed at `/managed`
   (folded into fix #1).
6. Notifications fired a throwaway personal fetch + flashed personal-only
   before `managesAnyGroup` resolved → hold both hooks (skeleton) until the
   org roles settle; flag-off path unchanged.
7. Follow/Endorse pickers seeded local state from `postingOptions[0]` once,
   pinning a stale copy before handle/avatar resolved → store the selected
   DID and derive the identity each render.
8. Focus filter could overflow on mobile → the filter rows scroll
   horizontally (scrollbar hidden); strip keeps its intrinsic width.
9. PostingAs menu had no *visible* current-selection mark → reserved-width
   check icon on the selected row.
10. Notifications focus dropdown was full-width vs `/managed`'s 280px cap →
    capped to match.
11. The route's flag-gate + recipients validation was untested (the actual
    flag-off enforcement point) → extracted `operations.ts` (flag injected
    as a param) and added `operations.test.ts` covering both flag states.
12. `fan-out.ts` error isolation + abort re-throw untested → added
    `fan-out.test.ts`.

### Nit
13. `parseRecipients` used a looser DID check than `isValidDid` → now reuses
    `isValidDid`.
15. Orphan `.managed-row__via-label` class → dropped.
16. Unused `.notification-row__via` class → dropped.
17. Profile bridge link hover used `--color-accent` (lighter in light mode =
    inverted affordance) → `--color-accent-hover` (theme-correct stronger).

## Accepted but deferred (with rationale)

14. **`useManagedNotifications` re-tags rows when `byDid` Map identity
    changes on unrelated org refreshes** (react, nit). The reviewer marked
    this "optional micro-optimization only — not required." The fix would
    tighten `useManagedAuthors`'s memo key, which is shared by every managed
    hook; the churn is infrequent (only on a new `groups` array identity)
    and re-tagging a few rows is negligible. Not worth the shared-surface
    risk under a flag. Left as-is.

## Verification

Re-ran the gate after integration: typecheck 0, lint 0 errors, **620 tests**
(was 600; +20 across owner-tag/fan-out/operations + the updated edit test),
build OK. Browser-reverified Home aggregation (via always visible, roles
exposed to SR), the PostingAs check indicator, and the notifications/managed
filters (light + dark + mobile).
