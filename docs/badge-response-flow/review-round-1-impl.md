# Implementation review — round 1

Three reviewers, three lenses on the code shipped in commits `f1691c0`
+ `b232c4b`:

- R1: code correctness + plan fidelity
- R2: security / privacy / abuse resistance
- R3: UX + a11y

Each finding below: **accept / defer / reject**, with rationale. The
fixes for accepted items land in the next commit on staging.

---

## Critical — block merge to main

### CB1. Cross-hook staleness (R1 B1)

**Finding.** `useReceivedEndorsements(did)` and `useOwnResponseStates()`
each instantiate `useProfileResponses(did)`. The module cache is
shared but each hook has its own `useState<BadgeResponseRecord[]>`.
After Hide, `ownStates.invalidate()` drops the cache and
`ownStates.refetch()` updates **only** the ownStates instance.
`useReceivedEndorsements`'s inner instance keeps the stale response
list, so the row that the user just rejected stays visible on the
profile / endorsements list until something else remounts.

**Decision: ACCEPT — must fix.** This breaks the primary action path.

**Fix:** Refactor `use-profile-responses.ts` to use
`useSyncExternalStore`. The module-level Map becomes the source of
truth; both hook instances subscribe and re-render together. The
inflight promise per DID is shared so concurrent loads collapse.

### CB2. AC#7 + AC#8 unimplemented (R1 B2 / R3 #1 #2)

**Finding.** Plan acceptance criteria for focus management and the
undo toast were committed in review-round-1 but not built:

- After Hide on a profile row, the row should disappear and focus
  should move to the next row (or section heading if last). Today
  focus falls to `<body>`.
- Hide should announce via an `aria-live="polite"` toast for ~6s,
  with an Undo affordance.

**Decision: ACCEPT — must fix.**

**Fix:**
- Move focus inside `ResponseMenu.onAfterWrite` callback, identifying
  the next/previous focusable kebab trigger on the same list.
- Add a lightweight toast surface — single mountable at the page
  level, dismisses after 6s, with an Undo button that re-creates the
  prior response (or deletes the new rejection).

### CB3. Roving tabindex inside kebab missing (R3 #3)

**Finding.** Plan §"A11y patterns" specified Arrow-key navigation
inside the menu. Implementation only handles Esc + outside-click.
Tab leaves the menu on first press.

**Decision: ACCEPT — must fix.**

**Fix:** Add ArrowDown/ArrowUp/Home/End handling in the menu; auto-
focus the first menuitem when the menu opens; manage tabIndex on
each item per the WAI-ARIA menu pattern.

### CB4. aria-label collision on desktop nav rail (R3 #4)

**Finding.** `desktop-left-rail.tsx:258` formats ANY badged item as
`"${label}, ${badge} unread"` — so the new pending-endorsement chip
announces as "Endorsements, 3 unread", which lies about what's
unread.

**Decision: ACCEPT — must fix.**

**Fix:** Differentiate the badge semantics — Notifications uses
"unread", Endorsements uses "pending". Both rails carry their own
formatter.

### CB5. Touch targets below 44px (R3 #5)

**Finding.** `.response-menu__trigger` is 28x28; `.response-buttons__btn`
is ~24px tall. WCAG 2.5.5 / Apple HIG / Material all require ≥44px
on touch surfaces.

**Decision: ACCEPT — must fix.**

**Fix:** Add a mobile-specific bump in feed.css (`@media (max-width:
799px)`) so trigger / buttons hit 44px minimum without inflating the
desktop UI.

### CB6. Missing owner-only state indicator (R3 plan-vs-code drift)

**Finding.** Plan §"UI surfaces" specified per-award `Showing on
your profile` / `Hidden from your profile` indicators owner-only.
Implementation has no such indicator anywhere.

**Decision: ACCEPT — must fix.**

**Fix:** Add a small state line inside the kebab menu — above the
action items — saying "Currently: Showing / Hidden / Default". This
gives owner-only state visibility per the plan, without leaking it
to non-owner viewers (the indicator only renders when the kebab is
visible, which is owner-only by surface gating).

---

## Important — fix in this PR

### IB1. Nav-rail scan triggers on every authed page (R2 #I-1)

**Finding.** `usePendingAwardsCount` is wired into both desktop and
mobile nav. On every authenticated page render with a cold cache,
the hook kicks off `scanReceivedEndorsements` — fan-out across every
known certified user via `appCertifiedActorProfile`. Up to 5000
PDS round-trips. Expands the perf-cost surface from "user visits
/endorsements" to "user opens any authed page in the app."

**Decision: ACCEPT — fix in this PR.**

**Fix:** Gate the nav-rail call so the fan-out scan only fires when
already-cached, OR defer to `requestIdleCallback`. Concretely: keep
the hook in place but bail out from triggering a *cold* network
fetch — only consume cached data; let `/endorsements` or `/profile`
be the surface that initiates the cold scan.

### IB2. `useOwnResponseStates` always calls listResponses on /notifications mount (R1 I2)

**Finding.** Even when zero notification rows are badge.awards, the
hook fires one round-trip. Wasted call, not critical.

**Decision: DEFER (downgraded).** After the B1 refactor of
`useProfileResponses` to a useSyncExternalStore-backed module store,
the cost is genuinely one round-trip total per `/notifications`
visit (singleflighted across all rows). Marginal. Hoisting the
hook to the list level would help avoid the call entirely when zero
rows are badge-awards, but that touches the notifications page
architecture; deferring as a small follow-up.

### IB3. Plan-doc drift: "over the wire" overclaim (R1 I5)

**Finding.** Plan §"Accept-state visibility" says non-owner viewers
"literally don't receive the response data over the wire." Not
true — `useReceivedEndorsements` fetches the profile owner's full
response list to compute the visible-filter. The hook contract
correctly never **exposes** per-row state to non-owners, but the
data does transit.

**Decision: ACCEPT — fix the plan doc.** Reword to "the response
data is fetched (necessary for the visible-filter) but never
exposed past the hook boundary; non-owner read paths return only
the filtered award list, never per-row state."

### IB4. Dead CSS `.left-rail__pending-chip` (R3 #9)

**Finding.** Rule exists in feed.css; nothing renders it. Desktop
rail uses `.left-rail__badge` instead.

**Decision: ACCEPT — remove.**

---

## Deferred — follow-up

### D1. Row baseline drift between owner/non-owner views (R3 #10)

Cosmetic; rows with the kebab have an extra 28px on the right edge.
Date column shifts between rows. Worth fixing but not blocking.

**Decision: DEFER.** Track as a small CSS follow-up; reserve the
28px slot with `visibility: hidden` on non-owner rows.

### D2. Pressed-state hover feedback (R3 #11)

The pressed-state buttons keep the same colors on hover, giving no
"clickable to toggle off" hint. Acceptable today; the cursor stays
`pointer` and the button stays clickable.

**Decision: DEFER.** Small polish.

### D3. `aria-busy` during write (R3 #12)

Disabled state is the only signal that a write is in flight. Could
add `aria-busy={isWriting}` on the group wrapper.

**Decision: DEFER.** SR users get the disabled signal; aria-busy is
a nice-to-have.

### D4. Partial-failure handling in `deleteAllResponsesForAward` (R1 I3)

Serial deletes with no rollback. Hit only when a user has multiple
vestigial responses for the same award; quite rare; the failure
mode is "wrong state survives," not data loss.

**Decision: DEFER.** Document in code comment; address if it
surfaces in practice.

### D5. Notification-row body should be clickable when buttons render (R3 #6)

Today the badge.award notification row has no deep-link target (the
plan acknowledged this). When/if a record-detail route lands for
awards, restore the inner link on the body text.

**Decision: DEFER.** Filed as follow-up issue once detail routes
exist.

### D6. Memory: unbounded module caches (R2 #O-3)

`use-profile-responses` and `use-received-endorsements` caches grow
without eviction. Bounded by browsing patterns; not a security risk;
slow memory leak only.

**Decision: DEFER.** LRU eviction can land later if memory profiling
shows a real growth pattern.

### D7. Endorser-note visual mimicry (R2 #O-2)

A malicious issuer could craft a `note` that visually mimics
control UI. Auto-escaping covers script injection but not text
mimicry.

**Decision: DEFER.** Content policy / display max-length / visual
distinction from UI text is a polish concern.

### D8. Inconsistent error UI between profile and /endorsements (R3 #8)

`profile-endorsements.tsx` uses an inline placeholder paragraph;
`/endorsements` uses `<ErrorMessage>`. Should consolidate but not
critical.

**Decision: DEFER.**

---

## No drift detected — confirmed good

- Plan compliance for C1, C2, C5, C6, C7 (owner-only), I1, I2, I4 —
  R1 verified.
- Server-side write enforcement (proxy `repo === sessionDid` +
  collection allowlist + CSRF check) — R2 verified.
- Owner-only response state structural at the hook boundary — R2
  verified.
- XSS-safe rendering of `note` (React text node, no
  dangerouslySetInnerHTML on user content) — R2 verified.
- Notification payload trust (service-auth-protected indexer; URI
  collection check; mis-targeted response writes are bounded harm
  to the user themselves) — R2 verified.
- Response createdAt not surfaced anywhere in the UI — R2 verified.
- `createResponse` strongRef integrity (lexicon validation by PDS;
  client-side fake refs are bounded) — R2 verified.
- C3 (nav-badge counter), C4 (cache invalidation correctness for
  own-device case), I1 (AC#2 reworded), I2 (rkey tie-break), I4
  (URI-not-CID join) — R1 verified.

---

## Summary

Six critical items must land before this merges to `main`. Three
important fixes also land in the next commit. Everything in the
"defer" list is a real concern but not a release-blocker. Once
fixes ship, a second implementation-review round is **not**
warranted — the items in this round are well-scoped and isolated;
fixing them doesn't open a new surface that needs reviewing.

The next commit on staging carries the CB and IB fixes plus this
review doc.
