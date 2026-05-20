# Group Membership Architecture — Disclosure-First Model

**Status:** Discussion draft / implementation proposal
**Author:** prepared for the team, 2026-05-19

**TL;DR:** Two-record model that separates *provenance* (the group says you're a member) from *disclosure* (you choose to publish that fact). Same end-user UX as today — Public / Private / Leave — but under the hood, public memberships become verifiable from public ATProto data alone via a cross-reference between the group's PDS and the user's PDS. **CGS changes are confined to a new public-add write path and three credential lifecycle hooks; client changes are mostly read-path updates and one lexicon rename.** Intentionally out of scope for this version: audience policies, role hiding, cryptographic signatures, member-vs-admin roster visibility.

---

## 1. The model

Today, `app.certified.actor.membership` on a user's PDS plays two roles at once: it's both the user's *claim to be a member* and the *public disclosure flag*. The proposal splits those into two records on two different repos.

| Concern | Record | Lives on |
|---|---|---|
| **Provenance** — "the group asserts this DID is a member" | `app.certified.group.membership.credential` | the **group's** PDS |
| **Disclosure** — "the user chooses to publish this membership" | `app.certified.actor.membership.disclosure` | the **user's** PDS |

A public membership exists when **both** records exist. The cross-reference is the verification — no privileged server query needed.

## 2. Record schemas

### 2.1 `app.certified.group.membership.credential`

Written by the CGS to the group's PDS via the existing proxy write pattern. Lives in the group's repo.

```json
{
  "lexicon": 1,
  "id": "app.certified.group.membership.credential",
  "defs": {
    "main": {
      "type": "record",
      "description": "Group-issued credential asserting that a subject DID is a member of this group. Written by the group service to the group's own PDS.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "issuedAt"],
        "properties": {
          "subject": {
            "type": "string",
            "format": "did",
            "description": "DID of the member."
          },
          "role": {
            "type": "string",
            "knownValues": ["owner", "admin", "member"],
            "description": "Optional. When present, publicly asserts the member's role. Omit to publicly assert membership without disclosing rank."
          },
          "issuedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```

### 2.2 `app.certified.actor.membership.disclosure`

Written by the user to their own PDS. Replaces today's `app.certified.actor.membership`.

```json
{
  "lexicon": 1,
  "id": "app.certified.actor.membership.disclosure",
  "defs": {
    "main": {
      "type": "record",
      "description": "User-issued disclosure that they are a public member of a group. Written by the user to their own PDS. Cross-referenced against the group's app.certified.group.membership.credential to verify the membership.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["groupDid", "disclosedAt"],
        "properties": {
          "groupDid": {
            "type": "string",
            "format": "did",
            "description": "DID of the group. Reference by DID (not strongRef) so the disclosure remains stable across credential updates (e.g. role changes)."
          },
          "disclosedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```

That's the entire data model. Two records, six fields total.

## 3. State model

| Group's credential | User's disclosure | State | Visibility to a foreign viewer |
|---|---|---|---|
| ✗ | ✗ | Not a member | not visible |
| ✓ (CGS internal roster only — no PDS record) | ✗ | **Private member** (Case 1 — see §4.1) | not visible |
| ✓ (in group's PDS) | ✗ | Added publicly, user hasn't disclosed (post Case 2 add, pre-accept; or post-reject before CGS cleanup) | credential is publicly readable but treated as "pending / invalid" by render paths |
| ✓ | ✓ | **Publicly verified member** (Case 3) | visible on user's profile |
| ✗ | ✓ | Invalid state — should never occur in steady state | render paths treat as not-a-member |

Notes:
- **The internal CGS roster is the universal first-class record.** Both Case 1 (private) and Case 2 (public) create an internal roster entry. The credential in the group's PDS is *additional* state for the public case.
- **Member-can-list permission stays as-is.** Today's CGS already allows any group member to call `app.certified.group.member.list`. Per the conversation, no change for this version. The roster-leak property (any member can enumerate all member DIDs) persists; a per-group toggle is in §8 as deferred.

## 4. The three core flows

### 4.1 Private add (Case 1)

Admin adds a user with `public: false` (or whatever flag name we pick — see §9):

1. CGS creates the internal roster entry.
2. **No PDS records written anywhere.**
3. CGS may emit a notification to the added user (existing notification system).
4. User sees the membership in their `/groups` page → Private tab.
5. User can do nothing (stay a private member), Make public (writes their disclosure record — §4.3), or Leave (CGS removes the internal roster entry).

No explicit accept ceremony. The implicit-accept-on-add model from today's UX is preserved.

### 4.2 Public add (Case 2)

Admin adds a user with `public: true`:

1. CGS creates the internal roster entry.
2. **CGS writes a `membership.credential` record to the group's PDS.** Subject = the added user's DID. Role = either included (per call flag or group policy) or omitted.
3. CGS emits a notification to the added user.
4. The user sees the membership in their `/groups` page → Private tab (because they haven't yet disclosed it themselves).
5. User can:
   - **Make public / Accept** — writes their disclosure record. Now publicly a verified member (both records exist).
   - **Reject / Leave** — CGS removes the internal roster entry AND deletes the credential from the group's PDS. The user is no longer a member, in either source.
   - **Do nothing** — credential sits in the group's PDS unmatched. UI on both sides treats this as "pending."

**Consent leakage window:** the credential is publicly readable from the moment the CGS writes it. Between "added publicly" and "rejected" (if rejection ever happens), anyone watching the group's PDS sees the add. Acceptable for most use cases (community DAOs, public organizations); flagged here for any group dealing with sensitive associations. Default new groups to private-add if that's a concern.

### 4.3 User-initiated transitions

These flows are unchanged from today's UX shape:

- **Make public.** User writes `app.certified.actor.membership.disclosure` to their PDS with `groupDid`. No CGS interaction.
- **Make private.** User deletes their disclosure record. No CGS interaction. Credential in group's PDS may or may not exist (depending on whether the membership originated as private or public).
- **Leave.** User calls `member.remove` on themselves. CGS removes the internal roster entry. If a credential exists in the group's PDS, CGS also deletes it. User also deletes their disclosure record (if any). Three writes, atomically initiated by the user.
- **Role change.** Admin updates the role via `role.set`. CGS updates the internal roster entry; if a credential exists in the group's PDS, CGS updates (or removes-and-rewrites) the credential to match. User's disclosure is unaffected — no re-publish needed.

## 5. What changes in the CGS

The CGS is the only entity with write authority to group PDSes (via `withProxy("certified_group", groupDid)`). All credential lifecycle happens server-side; client apps don't write credentials directly.

### 5.1 New input: `public` flag on `member.add`

The XRPC `app.certified.group.member.add` procedure gains a parameter:

```
public: boolean (default: false)
```

When `false`: today's behavior (internal roster entry only).
When `true`: internal roster entry **plus** write `membership.credential` to the group's PDS.

### 5.2 New input: `includeRole` flag on `member.add` (optional)

```
includeRole: boolean (default: see §9)
```

Only meaningful when `public: true`. Controls whether the public credential carries the `role` field. See §9 for the per-call vs. per-group-policy design call.

### 5.3 Three credential lifecycle hooks

| Trigger | CGS behavior |
|---|---|
| `member.add` with `public: true` | Write `membership.credential` to the group's PDS with `subject = memberDid`, optional `role`, `issuedAt = now`. |
| `member.remove` | If a `membership.credential` exists in the group's PDS with `subject = memberDid`, delete it. (Idempotent — no-op if no credential exists.) |
| `role.set` | If a `membership.credential` exists in the group's PDS for the subject, update the credential to reflect the new role. Two options: putRecord at same rkey with updated CID, OR delete-and-recreate with a new rkey. Either works since the user's disclosure references by DID, not strongRef. PutRecord is simpler. |

### 5.4 New lexicon registration

Add `app.certified.group.membership.credential` to the CGS's known lexicons. The credential write uses the existing `app.certified.group.repo.createRecord` / `putRecord` / `deleteRecord` procs internally — no new write proc needed.

### 5.5 Roster query: no change

`app.certified.group.member.list` remains as-is. Member-can-list permission unchanged. Internal roster format unchanged. The credential records are an *additional* public surface, not a replacement for the internal roster.

### 5.6 Optional: notification emission

If the existing notification system doesn't already emit notifications for `member.add`, this is a good moment to add it. Not strictly required by the architecture — the user can discover memberships from their `/groups` page on next visit — but improves the UX of the Case 2 "you've been added" surface.

---

**Net CGS work:** one new parameter on one existing proc, three lifecycle hooks, one lexicon registration. No new endpoints, no new proxy routes, no permission model changes.

## 6. What changes in the certified-app client

### 6.1 Lexicons + write paths

- Add `app.certified.actor.membership.disclosure` to `ALLOWED_WRITE_COLLECTIONS` in `src/app/api/xrpc/[...method]/route.ts`.
- Update `src/lib/groups/api.ts`:
  - `putMembership(did, groupDid)` writes to the new collection. Drop the `role` parameter — the user's disclosure doesn't carry it.
  - `deleteMembership(did, groupDid)` switches to the new collection.
  - `listMemberships(did)` reads from the new collection (with a fallback to the old collection during the migration window).
- Update `addOrgMember(...)` to accept and pass through `public: boolean` and `includeRole: boolean`.

### 6.2 Read paths

- `resolveGroups()` in `src/lib/groups/api.ts:444` keeps its current shape but reads the new disclosure collection.
- Foreign profile rendering (where it shows another user's groups) gains a cross-reference check: read the user's disclosure records, then for each one, optionally verify the credential exists in the corresponding group's PDS. The verify step is best-effort and lazy — unverified disclosures still render (backward compat), but UI can show a small "verified" chip on confirmed ones.
- The `/groups` page keeps its Public / Private tab shape unchanged.

### 6.3 UI surface for Case 2

- New "Accept" / "Reject" affordance on a public-added but undisclosed membership in the user's `/groups` page. Accept = `putMembership` (writes disclosure). Reject = `removeOrgMember` (CGS removes roster entry + credential).
- Existing "Make public" / "Make private" / "Leave" buttons work unchanged for private memberships and already-disclosed public memberships.

### 6.4 Indexer

- Index `app.certified.group.membership.credential` records so foreign-profile rendering can verify credential existence in one query instead of N PDS round-trips. Same pattern as the existing `appCertifiedGraphFollow` / `appCertifiedBadgeAward` fan-in queries.

## 7. Migration plan

Four phases, each independently shippable.

### Phase 1 — CGS dual-writes credentials (invisible to clients)

CGS gains the `public` flag and the three lifecycle hooks (§5.1–5.3). Existing client calls without the `public` flag default to `false` and behave exactly as today (no PDS writes). Credentials for new public-adds start appearing in group PDSes.

**Backfill:** optional batch job that walks the existing internal roster and writes credentials for every member who has *also* written today's `app.certified.actor.membership` record (i.e., for every currently-public member). This makes the cross-reference check work for the existing public-member set from day one.

### Phase 2 — New disclosure lexicon, client-side

Ship the new `app.certified.actor.membership.disclosure` lexicon, allowlist, and write helpers in the client. New `putMembership` calls write to the new collection. Old collection is still read.

### Phase 3 — Switch read paths

Profile rendering, `/groups` tabs, foreign-viewer queries read the new collection. Old collection becomes deprecated — still readable as a fallback but no new writes.

### Phase 4 — Cleanup

Optional: a background helper rewrites old `app.certified.actor.membership` records into the new disclosure shape next time each user is signed in. After saturation, old records can be deleted and the old lexicon retired.

## 8. What's intentionally out of scope (deferred)

Five things we discussed and explicitly are not building in this version. Each is a clean extension to the architecture above — none require restructuring.

| Deferred feature | Why deferred | How to add it later |
|---|---|---|
| **Audience policies** ("show this membership to followers only," "to members of org X only") | No current product driver; binary public/private covers known use cases. | Add optional `audience` field to the disclosure record. Read paths filter by audience match. |
| **Role hiding** on the user side | Out of scope per user spec — only group-side role hiding is in scope. | Add optional `showRole: boolean` to the disclosure record. |
| **Cryptographic signatures** on the credential | No off-platform verifier requirement today. | Add optional `signatures: array` to the credential (badge.blue-style inline form). Verify against the group's DID-doc-published key. Same primitive as the badge / receipt discussions. |
| **Per-group "only admins can see roster" toggle** | Member-can-list works for the groups we have; flag the property to the team in case a sensitive use case appears. | Add a group-metadata flag; CGS authz check branches on it. |
| **Member acceptance state distinct from disclosure** | Implicit-accept-on-add is fine for the private case; explicit accept for the public case maps directly to "write disclosure." | Would require a third state in the roster (`pending` / `accepted` / `member`). Not worth the complexity. |

## 9. Open design calls

Three calls worth making explicitly before the CGS team starts on Phase 1:

### 9.1 Per-call vs. per-group policy for `public` and `includeRole`

Two coherent options:

- **Per-call.** `member.add` takes `public: boolean` and `includeRole: boolean` parameters each time. Admins choose at the moment of add. Maximally flexible.
- **Per-group policy.** Group metadata carries `defaultPublic: boolean` and `defaultIncludeRole: boolean`. Admins don't think about it per-add; the policy decides. Simpler UX.
- **Hybrid (recommended).** Per-group defaults, optionally overridable per-call. Best of both — admins of "always-public" groups don't need to remember the flag, but exceptions are possible.

### 9.2 putRecord vs. delete-and-recreate for role changes

When `role.set` is called and a credential exists, the credential needs to be updated.

- **putRecord (same rkey, new CID).** Simpler. URI stays stable. Any consumer caching by URI gets the update on next fetch.
- **Delete + create (new rkey).** "Old role" credential is gone; "new role" credential is fresh. Cleaner if we ever want a history of role changes.

Either works because the user's disclosure references by DID, not strongRef. Recommend **putRecord** for simplicity unless someone has a reason to want role-change history.

### 9.3 What labels for the Case 2 transitions?

Pure UX call; data model is unchanged either way.

- Today: **Make public** / **Make private** / **Leave**.
- For Case 2 (publicly added, not yet disclosed): **Accept** / **Reject** is more honest about the consent gate. But it adds a fourth label.
- Could simplify by reusing **Make public** (for accept) and **Leave** (for reject). One label set, semantically slightly off (Leave-before-you-ever-engaged isn't really "leaving"). Probably fine.

## 10. Open questions for the meeting

1. **Is the per-group-policy + per-call-override hybrid (§9.1) the right shape for the public/includeRole flags?**
2. **Notification emission on `member.add`** — does the existing notification system already cover this, or do we need to extend it?
3. **Backfill on Phase 1** — write credentials for all currently-public members, or just for new adds going forward? Backfill makes the cross-reference work universally from day one; not-backfilling means existing public members render unverified until they re-publish.
4. **Indexer schema work** — does `magic-indexer` need a new collection schema for `membership.credential`, or can existing `appCertifiedGroup*` patterns handle it?
5. **§8 deferred list — anyone object to any of those being deferred?** Particularly the per-group roster-visibility toggle, given the roster-leak property is real for any large sensitive group.

---

## Appendix — Net work summary

| Surface | Work | Estimate |
|---|---|---|
| CGS | 1 new param + 3 lifecycle hooks + 1 lexicon | ~1 sprint |
| CGS (optional) | Backfill job | ~few days |
| certified-app — lexicons | 1 new disclosure lexicon, 1 new credential lexicon (read-only) | ~1 day |
| certified-app — write paths | Update `putMembership` / `deleteMembership` / `addOrgMember` | ~few days |
| certified-app — read paths | Switch `resolveGroups`, update profile rendering | ~few days |
| certified-app — UI | Accept/Reject affordance on Case 2 pending memberships | ~few days |
| Indexer | New collection schema for `membership.credential` | ~few days |
| Migration | Old-collection fallback + (optional) re-publish helper | ~few days |

Total: roughly 2 sprints of focused work across the CGS + certified-app + indexer, ignoring review / QA / deploy buffers. Independently shippable in phases.
