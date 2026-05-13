# Plan review — round 1

Three reviewers, three lenses: ATProto/lexicon semantics (R1),
UX/accessibility (R2), perf/security/privacy/scaling (R3).

Each finding below: **accept / reject / defer**, with rationale.
The plan has been updated in place to reflect accepted items.

---

## Critical items — block implementation

### C1. Responses fetched from the wrong DID (R1 #2, R3 #1)

**Finding (R1):** `use-my-responses` only solves the own-profile case.
When viewing Alice's profile we need **Alice's** responses, not the
viewer's. The scan currently in the plan doesn't deliver acceptance
criterion #1's "disappears from… other users' views of their profile."

**Finding (R3):** The fan-out anti-pattern would balloon the request
count from ~391 to ~776 per cold profile view. The correct shape is a
single `listRecords` against the recipient's PDS.

**Decision: ACCEPT both.** Combine into a single resolution:

- The hook that handles responses takes a `profileDid` (the recipient
  whose responses we need), **not** a viewer DID.
- One additional `listRecords` per profile view (against
  `profileDid`'s PDS, collection `app.certified.badge.response`).
- Marginal cost: +1 round-trip on top of the existing scan.

Plan updated: §"Scope and file ownership" renames the hook from
`use-my-responses` → `use-profile-responses(profileDid)`. Acceptance
criterion #1 stays. Acceptance criterion clarified: response join is
a single listRecords on the profile owner's PDS, never per-issuer.

---

### C2. Unknown response values must degrade safely (R1 #1)

**Finding:** `response.knownValues` is extensible. Another client
could write `"muted"`, `"deferred"`, anything. Current plan filters
exactly on `"rejected"`; everything else silently treated as no-op.

**Decision: ACCEPT.** Resolution helper normalises to a closed set
`{accepted, rejected, unknown}`. Unknown values are treated as
"no response" — preserving the default-show behaviour and never
silently hiding an award based on a value we don't understand. The
hook records the raw value so it's available to debug.

Plan updated: §"Axis 4" gains an "Unknown response values" subsection
documenting this contract.

---

### C3. Discovery path for default-show is missing (R2 #1)

**Finding:** Default-show means hostile awards land publicly on a
recipient's profile. The plan defers notification-service support
("Files NOT touched"). Result: a recipient who doesn't open
`/notifications` may never know they were endorsed (badly or
otherwise) because the notification service still only detects the
legacy temp lexicon.

**Decision: ACCEPT with scope clarification.** Two parts:

1. **Document the gap explicitly** in the plan as a known limitation
   with default-show. The accept/reject lever still works — but
   discovery depends on the recipient visiting `/endorsements` or
   `/notifications` at all.
2. **Ship a nav-badge counter** in this PR: a tiny chip on the
   Endorsements nav item showing the count of un-responded awards
   targeting the viewer's DID. Forces visibility on next site visit
   even without notification-service support. Implemented via the
   same listRecords-against-own-PDS we're already adding.

Plan updated: §"Scope and file ownership" adds `useNavCounter` (a
trivial wrapper around `use-profile-responses` for the viewer's own
DID, deriving the count of un-responded awards). Notifications-
backend extension still deferred to a follow-up (which we'll file as
a separate issue against the notifications service).

---

### C4. Cache eviction is wrong scope (R2 #3, R3 #3)

**Finding (R2):** AC#1's "~5min" is too lenient — for a hostile
award, the visibility window matters.

**Finding (R3):** The module-level `useReceivedEndorsements` cache is
keyed by `profileDid`. Invalidation-on-write only helps the writer
on their current device. Other viewers / other devices still see the
stale list for up to 5 min. CDN-independent — browser-only — but
still eventually consistent.

**Decision: ACCEPT with honest framing.** Three changes:

1. After a Reject, invalidate the recipient's own browser cache
   (this is what OQ#4 anticipated).
2. AC#1 reworded to drop "~5min" — instead: "appears removed for
   the recipient on the device that issued the Reject immediately;
   other viewers / devices observe within their cache TTL (current
   default: 5min own scan + 30s proxy cache for foreign reads)."
3. Document the eventual-consistency contract in the plan §"Caches
   + eventual consistency" subsection. No CDN/server-side
   invalidation; this is purely a browser-cache layer.

Plan updated.

---

### C5. Surfaces aren't symmetric (R2 #2)

**Finding:** `/notifications` is the triage surface; `/profile`
"Received" is the audit surface. Plan treats them the same and ends
up with verbose controls everywhere.

**Decision: ACCEPT.**

- `/notifications` rows where `reason === "endorsement"`: inline
  Accept + Reject buttons. Loud where loudness matters.
- Own-profile "Received" rows: a kebab menu (`MoreHorizontal` icon)
  with "Hide from profile" / "Reset to default" inside. Quiet so
  the wall stays a wall, not a control panel.
- `/endorsements` "Received" tab: same kebab pattern as profile.

Plan updated: §"Scope and file ownership" splits the original
`AcceptRejectControl` into two components: a loud `<ResponseButtons>`
for notifications, a quiet `<ResponseMenu>` (kebab) for profile +
endorsements. They share the same hook.

---

### C6. Copy is too judicial (R2 #5)

**Finding:** "Accepted" / "Rejected" reads as a verdict on the
issuer. Better framing: outcome-oriented.

**Decision: ACCEPT.**

| Old | New |
|---|---|
| Accept | Show |
| Reject | Hide |
| "Accepted ✓" indicator | (owner-only) "Shown on your profile" |
| "Rejected" indicator | (owner-only) "Hidden from your profile" |
| Revert | "Reset to default" |

Plan updated.

---

### C7. Accept-state must be owner-only (R2 #7)

**Finding:** A profile that shows "✓ Accepted" next to some awards
but not others reads, to a viewer, as "the user vouched harder for
that one." Two awards from the same issuer where one was actively
accepted and the other left default would look like a deliberate
slight.

**Decision: ACCEPT.** Read paths consumed by **non-owner viewers**
return only "is this award visible: yes/no" — no per-award response
state. Owner-only paths return the full response state for kebab
controls. The hook contract makes this explicit:

- `useReceivedEndorsements(profileDid)` returns awards with no
  per-row response state (drops awards whose latest response is
  rejected; everything else passes through).
- `useOwnResponseStates()` (separate hook, viewer-only) returns
  `Map<awardUri, "accepted" | "rejected" | "default">` for the
  current viewer's own profile. Only the kebab menu reads from it.

This prevents leakage even via devtools network inspection.

Plan updated: §"Scope and file ownership" + §"Accept-state visibility"
subsection.

---

## Important items — accept

### I1. AC#2 framing is wrong (R2 #2)

**Finding:** "Accept makes the decision sticky so future default
changes don't unhide it silently" puts the burden on users to
future-proof. If we later flip to opt-in, we should migrate
explicitly, not via "you should have clicked Accept."

**Decision: ACCEPT.** AC#2 reworded to: "Recipient can click Accept
on any award; the award shows on their profile (which was already
the default)." Drop the sticky framing.

### I2. Tie-break for equal timestamps (R3 #4)

**Finding:** ISO timestamps with second-level precision can collide.
The resolution helper needs a deterministic secondary key.

**Decision: ACCEPT.** Tie-break by rkey lexicographic order (TIDs are
time-ordered at PDS-side, so this is "latest commit wins" with a
well-defined order). Documented in the helper's contract.

### I3. Clock skew (R1 #4, R3 #4)

**Finding:** A user accepting on device A and rejecting on device B
with skewed clocks produces a non-deterministic latest.

**Decision: ACCEPT, document only.** Note in code as a known
limitation with a comment block. Not worth a server-side time-stamp
or CRDT for v2. ISO ms precision plus rkey tie-break makes
collisions rare.

### I4. StrongRef CID handling on award deletion (R1 #3)

**Finding:** `response.badgeAward` pins a CID. If issuer deletes +
recreates the award, the CID changes. Dangling responses are
harmless but need a deliberate join strategy.

**Decision: ACCEPT.** Resolution helper joins on `uri` only, ignores
`cid` mismatches. Dangling responses pointing at deleted awards are
filtered out at join time (no award to filter anyway). Documented.

### I5. A11y: control patterns (R2 #6)

**Decision: ACCEPT all of R2's a11y recommendations:**

- Loud buttons (notifications): `role="group"` wrapper with
  `aria-label="Response to endorsement from {issuer}"`. Buttons are
  `<button aria-pressed="true|false">`.
- Kebab menu (profile/endorsements): `aria-haspopup="menu"` +
  `aria-expanded`. Roving tabindex inside, **not** focus trap.
  Escape closes + restores focus to trigger.
- After Reject on profile row: focus moves to next row (or section
  heading if last). Added as AC.
- Reject shows a 6s undo toast with `aria-live="polite"`.

Plan updated.

### I6. Activity leak via response createdAt (R3 #5)

**Decision: ACCEPT, document only.** Note in plan: every response's
public createdAt reveals when the recipient was triaging. Intrinsic
to atproto's public-repo model. We don't claim privacy here.

### I7. CSS class location (R2 #9)

**Finding:** Plan referenced `src/app/styles/components.css` which
doesn't exist. Styles live in `notifications.css` and `globals.css`
per AGENTS.md §11.

**Decision: ACCEPT.** New `endorsement-row__menu*` BEM classes go
alongside the existing `endorsement-row` styles. No new CSS file.

### I8. CSS files referenced

`/workspace/certified-app/src/app/styles/notifications.css` for
notification-row styles; styles for endorsement-row currently
co-located with the other endorsement bits (search the codebase at
implementation time).

---

## Deferred items

### D1. Rate-limiting badge.award writes (R3 #2)

**Finding:** Default-show + no write rate limit = harassment-grade
DoS vector. An attacker can mint 100k awards to a victim, all
publicly render until the victim hides each.

**Decision: DEFER — separate security PR.** Rationale:

- Phase 2 (this PR) ships the recipient's lever to hide spam. The
  attack remains possible but the recipient now has a tool.
- The nav-badge counter from C3 makes the spam visible (the
  recipient sees a high pending count and can act).
- A proper rate limit is a separate concern that touches the proxy +
  Upstash KV for counters; not part of the response-flow
  semantically. It's an abuse-mitigation feature.
- Filing this as a separate issue against the proxy with priority
  "ship before any meaningful marketing push that could attract
  malicious accounts."

Plan updated: §"Out of scope" gains an explicit note about the rate-
limit deferral with a pointer to the follow-up issue.

### D2. Notification-service awareness of badge.award (R2 #1)

**Decision: DEFER — separate backend issue.** The notifications
service is indexer-side. Filed as a separate issue. The nav-badge
counter from C3 closes the discoverability gap in the interim.

### D3. Indexer centralization risk when #65 lands (R3 #6)

**Decision: DEFER — sentence in #65 follow-up plan.** When we
collapse the fan-out into a single GraphQL query, retain a sampled
verification path so we don't fully trust a single indexer. Not
Phase 2 work.

### D4. Soft-block / per-issuer mute (R2 #5)

**Decision: DEFER — Phase 3.** Mentioned in original plan §"Out of
scope." Confirmed.

---

## Nits

- **AC#7 magic number (27 warnings):** rephrase to "no new eslint
  errors; warnings within ±2 of pre-change baseline." Cite the
  baseline capture step.
- **"Pending" pinning in profile sort (OQ#1):** keep chronological;
  pending get a subtle dot indicator, don't reorder. Confirmed.
- **"Reset to default" placement (OQ#2):** inside the kebab menu
  next to "Hide," only visible when a response exists. Confirmed.

---

## Summary of plan changes

The plan file has been edited in place to reflect every ACCEPT
above. Specifically:

- Acceptance criteria #1, #2, #4, #7 reworded.
- §"Axis 4" gains "Unknown response values."
- §"Scope and file ownership" splits the control component (loud +
  quiet), renames the hook, adds the nav-badge counter.
- New subsections: "Caches + eventual consistency", "Accept-state
  visibility", "A11y patterns".
- §"Out of scope" calls out rate-limit deferral.
- §"Open questions" reduced to one — only OQ#3 (issuer notification)
  remains, and the answer is "don't notify" per R2.

No further plan-review round needed: round 1 surfaced enough
substantive items to justify the rewrite, but nothing on the
remaining axes (architecture, security boundary, lexicon shape)
that would require a second pass. The plan is now grounded enough
to start implementation.
