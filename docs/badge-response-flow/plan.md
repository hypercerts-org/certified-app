# Plan — Badge response (accept / reject) flow

Phase 2 of the endorsements-as-badges migration shipped in Phase 1
(see `staging` commits `ac6a473` and `cc39297`).

**Status:** revised after round-1 reviewer feedback. See
`review-round-1.md` for the per-finding decisions.

## Larger goal

Recipient self-curation **without** an app-level allowlist. Phase 1
moved endorsements onto the badge lexicons and let every user
define their own endorsement badge. The structural weakness left
unresolved: anyone can issue an `app.certified.badge.award` to
anyone, and the recipient has no mechanism to filter what shows on
their profile. The previous temp lexicon avoided this by hardcoding
a `TRUSTED_EVALUATORS` set; the badge model is supposed to replace
that gate with **recipient agency**.

Phase 2 closes the gap by adopting `app.certified.badge.response` —
the lexicon-defined record where a recipient declares
`accepted` or `rejected` for a specific award. Profile read paths
honour the response; the recipient drives their own surface.

This is the change that makes the badge migration actually better
than the temp lexicon, not just shaped differently.

## Lexicon reference

`app.certified.badge.response` (canonical, npm v0.12.0):

```json
{
  "key": "tid",
  "required": ["badgeAward", "response", "createdAt"],
  "badgeAward": { "$type": "com.atproto.repo.strongRef" },
  "response": { "knownValues": ["accepted", "rejected"] },
  "weight": { "string, optional, maxLength 50" }
}
```

Notable: `key: tid` (auto rkey) — a user can have many response
records for the same award over time. Latest-by-`createdAt` wins
with rkey lexicographic tie-break; older records become vestigial
but are ignored at read time. No schema-level uniqueness on
`(recipient, badgeAward)`.

## UI surfaces

Two distinct surfaces with distinct roles:

- **`/notifications` rows** with `reason === "endorsement"` — the
  triage surface. Loud, inline `<button>Show</button>` /
  `<button>Hide</button>` controls.
- **Own-profile "Received" rows** and **`/endorsements` Received
  tab** — the audit surface. Quiet kebab menu
  (`MoreHorizontal`) with "Hide from profile" /
  "Reset to default" inside. Profile stays a wall, not a control
  panel.
- **Nav-badge counter** on the Endorsements nav item — count of
  un-responded awards targeting the viewer's DID. Discovery aid
  for default-show in the absence of badge-aware notifications.

Visible state to **the owner only**: per-award `Showing on your
profile` / `Hidden from your profile` indicators inside the kebab
menu. **Other viewers** see only a uniform list of visible awards
with no per-row response state. This avoids the "vouched harder
for that one" misread.

## Alternatives considered

### Axis 1 — default visibility for un-responded awards

| Option | Behaviour | Pros | Cons |
|---|---|---|---|
| A. Opt-in (default-hide) | Award invisible until accept | Max spam resistance | High friction; profile feels empty for disengaged users |
| **B. Opt-out (default-show)** | Award visible until reject | Low friction; smallest delta from Phase 1; the lever exists for cleanup | Spam reaches the profile until acted on; discovery depends on the recipient visiting |
| C. Hybrid (per-user toggle) | A or B, user picks | Best of both | Two code paths; unjustified at current scale |
| D. Trust-based | In-network = show, else hide | Smart middle | Needs follow graph we don't have |

**Chosen: B.** Rationale:

- Current scale is low (totalCount=14 badge awards across the
  network at time of writing).
- Phase 1 is already default-show; this is a zero-behaviour-change
  default with an added opt-out lever.
- The nav-badge counter (see "Discovery gap" below) makes the
  visibility-bias safer than vanilla default-show.
- We can flip the default to opt-in later via a one-line config
  change; the lexicon supports both interpretations.

**Discovery gap.** Default-show with no badge-aware notification
service means a recipient who doesn't visit `/endorsements` or
`/notifications` may not know they were endorsed. Mitigated by the
nav-badge counter — a small chip on the Endorsements nav item
showing the count of un-responded awards on the viewer's profile.
A proper notification-service extension for `app.certified.badge.award`
is filed as a separate issue.

### Axis 2 — where the recipient acts

Two-surface approach (notifications + profile audit) chosen. See
"UI surfaces" above. Notifications are the action-on-arrival
surface; profile is the cleanup-old-stuff surface.

### Axis 3 — what "rejected" means publicly

**Soft-hide chosen.** The award stays on the issuer's PDS; the
rejection record is public on the recipient's PDS but the UI just
filters profile-side. The issuer can technically discover their
award was rejected by inspecting the recipient's public repo, but
we don't surface this in-app. Honest data model; no fake delete.

Privacy note worth knowing: every response record's public
`createdAt` reveals when the recipient was triaging. Intrinsic to
atproto's public-repo model. We don't claim privacy here.

### Axis 4 — write strategy for response records

`key: tid` means multiple responses per award are possible.

**Chosen: append-only, latest-by-createdAt wins.** Tie-break on
equal timestamps: rkey lexicographic order (TIDs are time-ordered
PDS-side). Rationale:

- One round-trip per write; no race condition across tabs.
- Storage cost trivial.
- Vestigial records accumulate slowly; we don't sweep them.
- Cross-device clock skew is a known limitation — if a user accepts
  on device A (clock +5s) then rejects on device B (clock -5s),
  reject ends up dated earlier and Accept wins. Documented as a
  known limitation; not worth a CRDT for v2.

#### Unknown response values

`response.knownValues` is extensible. Another client could write
`"muted"`, `"deferred"`, or anything. The resolution helper
normalises to a closed set:

- `"accepted"` → accepted
- `"rejected"` → rejected
- anything else → **unknown**, treated as "no response" (preserves
  default-show, never silently hides based on a value we don't
  understand)

Raw value retained for debug. Documented in the helper contract.

## Caches + eventual consistency

This system is **not** strongly consistent across viewers/devices.
We don't pretend it is.

After a Reject on device A:

- Device A's local `useReceivedEndorsements` cache: invalidated on
  write (eviction call in the kebab handler).
- Device B / other viewers / anonymous browsing: their browser
  cache + proxy cache headers govern. Worst-case observable window
  is `5min` (the scan's module cache) + the proxy's
  `Cache-Control: private, max-age=30` on foreign listRecords. No
  CDN/server-side invalidation; this is purely browser-local.

Acceptance criteria phrased accordingly — no false "within ~5min"
claims for cross-viewer staleness.

## Accept-state visibility

The hook contract makes the owner-only requirement structural, not
just a UI rule:

- `useReceivedEndorsements(profileDid)` returns awards filtered by
  the latest response (rejected = excluded). The shape returned to
  the caller is just the visible-award list — no per-row response
  state for non-owner viewers. They literally don't receive the
  response data over the wire.
- `useOwnResponseStates()` (separate hook, viewer-only) returns
  `Map<awardUri, "accepted" | "rejected" | "default" | "unknown">`
  for the viewer's own DID. Only the kebab menu and the nav-badge
  counter consume it.

This prevents devtools-level leakage even on own-profile pages
viewed by someone who somehow obtained the cookie of another user.

## Scope and file ownership

### New files

- `src/hooks/use-profile-responses.ts` — fetches a specific DID's
  response records from their PDS. Single `listRecords` against
  `<profileDid>.PDS / app.certified.badge.response`. Module-cached
  per DID with the same 5min TTL as the scan.
- `src/hooks/use-own-response-states.ts` — wrapper around the
  above scoped to the authenticated viewer, returns the
  award-uri → state map for kebab consumption + nav-badge.
- `src/hooks/use-pending-awards-count.ts` — nav-badge counter:
  derives `count = awards.length − resolvedResponses.size` from
  the viewer's own scan + responses. Cached, refetches on window
  focus.
- `src/components/badges/response-buttons.tsx` — loud Show/Hide
  buttons for notifications.
- `src/components/badges/response-menu.tsx` — quiet kebab menu for
  profile + endorsements rows.

### Modified files

- `src/lib/atproto/badges.ts` — add CRUD for responses
  (`listResponses`, `createResponse`, `deleteResponse`) and a
  resolution helper (`resolveResponseState(awardUri, responses) →
  "accepted" | "rejected" | "default" | "unknown"`).
- `src/hooks/use-received-endorsements.ts` — accept an optional
  `viewerIsOwner: boolean` parameter. For owner views, join the
  profile owner's responses and filter out `rejected`. For
  non-owner views, do the same filter but don't return per-row
  state. Single `listRecords` against profile-owner PDS (NOT
  per-issuer — the wrong shape is explicitly forbidden).
- `src/components/notifications/notification-row.tsx` — render
  `<ResponseButtons>` when `reason === "endorsement"` and the
  notification's award URI is resolvable.
- `src/components/profile/profile-endorsements.tsx` — render
  `<ResponseMenu>` next to received rows when the viewer is the
  profile owner.
- `src/components/endorsements/endorsement-row.tsx` — accept an
  optional `responseMenu` slot rendered into the existing action
  column.
- `src/app/endorsements/page.tsx` — render the kebab on the
  Received tab; pending-count chip on nav.
- `src/components/layout/desktop-left-rail.tsx` and
  `mobile-sidebar.tsx` — show the nav-badge counter on the
  Endorsements nav item.

### Files NOT touched

- `src/lib/atproto/notifications.ts` and the notifications backend's
  data model — endorsement detection still keys on the legacy
  temp lexicon. Adding badge.award detection is a separate
  backend issue, deferred.
- `src/hooks/use-trusted-endorsed-dids.ts` — feed-side filter, separate
  migration.

## Acceptance criteria

1. **Hide:** the recipient can click "Hide" on any endorsement
   they receive. The award is no longer rendered on their own
   profile and `/endorsements` view immediately. Other viewers
   and other devices observe the change within their browser
   cache TTL (no CDN/server invalidation guarantee).
2. **Show:** the recipient can click "Show" on any endorsement.
   The award stays visible (it was already the default).
3. **Reset to default:** the recipient can revert via the kebab
   menu, deleting their response record. Award returns to
   un-responded state.
4. **Surfaces:**
   - `/notifications` rows with `reason === "endorsement"`:
     inline Show + Hide buttons.
   - Own-profile "Received" list: kebab menu per row, owner-only.
   - `/endorsements` Received tab: same kebab pattern.
   - Endorsements nav item: pending-count chip.
5. Read paths honour the latest response per award, tie-broken by
   rkey lexicographic order. Vestigial response records ignored.
   Unknown response values treated as no response.
6. Accept-state is **owner-only** — non-owner read paths return no
   per-row response state.
7. After a Hide on a profile row, keyboard focus moves to the
   next row (or the section heading if it was the last).
8. Hide shows an undo toast (~6s) with `aria-live="polite"`.
9. No regression on Given list, /create, profile editing, or other
   surfaces.
10. `tsc`, `eslint`, `next build` all green. No new eslint
    *errors*; warnings within ±2 of the pre-change baseline
    (current baseline: 27 — recapture during step 5).
11. Smoke test: account A endorses account B; B clicks Hide on
    `/notifications`; the endorsement disappears from B's profile
    when viewed by A (after cache TTL) and a logged-out visitor.

## Out of scope

- **Rate-limiting `badge.award` writes.** The default-show model
  combined with the proxy's lack of per-DID write rate limits is a
  harassment vector (a malicious issuer can fill a recipient's
  profile with garbage awards). Phase 2 ships the recipient's
  lever to hide spam; a proper rate limit is a separate security
  PR (filed as a follow-up issue against the proxy).
- **Notification-service awareness of `app.certified.badge.award`.**
  The notifications backend still detects only the legacy temp
  lexicon. We mitigate via the nav-badge counter; full
  notification-service support is filed as a follow-up.
- **Weight field.** The lexicon supports `weight` for accepted
  badges; not surfaced in v2.
- **Soft-block** (rejected = also blocked from future awards).
  Future phase.
- **Indexer-side filtering of accepted/rejected awards.** Today we
  filter client-side after the PDS-fan-out scan. When magic-indexer
  issue #65 lands we'll move both the subject filter and the
  response join into a single GraphQL query. When that happens we
  retain a sampled fan-out verification path so we don't fully
  trust a single indexer.
- **Bulk actions** (accept/reject many at once).
- **Per-issuer mute** ("never accept anything from X").

## Rollback plan

The change is **additive**:

- New response records on user PDSes — harmless if read paths
  ignore them.
- Read-path changes filter on response state — reverting reverts
  to "show everything," the current behaviour.

Single-commit revert restores Phase 1. Response records that
users wrote stay on their PDSes but become inert.

## A11y patterns

Loud buttons (notifications surface):

- Wrap in `<div role="group" aria-label="Response to endorsement
  from {issuer displayName}">`.
- Each button: `<button aria-pressed="true|false">`. `aria-pressed`
  carries toggle semantics; no separate `aria-live` region needed.
- Unknown response value: render no-response UI but include
  `<span class="sr-only">Unrecognized response state</span>`.

Quiet kebab (profile + endorsements surface):

- Trigger: `aria-haspopup="menu"` + `aria-expanded`.
- Menu items: roving tabindex (Arrow keys), **not** focus trap.
- Escape closes + returns focus to trigger.
- After Hide removes the row from the DOM, move focus to the
  next row (or section heading if last). Don't let focus fall to
  `<body>`.
- Hide shows an undo toast with `aria-live="polite"`. Toast
  auto-dismisses after 6s.

## Open question for the operator

Only one left after review:

1. **OQ3 from initial plan — issuer notification of rejection.**
   Reviewers (R2 + R3) recommend not surfacing rejection to the
   issuer in-app. Confirmed: no UI surfacing.
   The public-PDS record means a determined issuer can find their
   own rejection; we don't broadcast it and don't pretend it's
   secret. Surfaced honestly in this plan but no in-app affordance.

## File map summary

```
docs/badge-response-flow/
  plan.md                      (this file)
  review-round-1.md            (reviewer decisions)

src/lib/atproto/badges.ts      (extend: response CRUD + resolveResponseState)
src/hooks/use-profile-responses.ts        (new — listRecords on profileDid PDS)
src/hooks/use-own-response-states.ts      (new — viewer-only state map)
src/hooks/use-pending-awards-count.ts     (new — nav-badge counter)
src/hooks/use-received-endorsements.ts    (modify: join responses, owner-aware shape)

src/components/badges/response-buttons.tsx    (new — loud, notifications)
src/components/badges/response-menu.tsx       (new — quiet kebab, profile/endorsements)

src/components/notifications/notification-row.tsx  (modify — embed buttons)
src/components/profile/profile-endorsements.tsx    (modify — embed menu owner-only)
src/components/endorsements/endorsement-row.tsx    (modify — accept menu slot)
src/app/endorsements/page.tsx                      (modify — nav chip, kebab on Received)
src/components/layout/desktop-left-rail.tsx        (modify — nav-badge counter)
src/components/layout/mobile-sidebar.tsx           (modify — nav-badge counter)
```

Approx surface area: 5 new files, ~7 component/hook touches, 1 lib
extension. Reviewable in a single commit per logical chunk; the
implementation will land in ~3-4 atomic commits (lib + hooks,
components, surface wiring, polish).
