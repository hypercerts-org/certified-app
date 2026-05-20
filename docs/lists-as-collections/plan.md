# Lists-as-collections — plan

Migrate endorsement lists from "one `app.certified.badge.definition` per list" to "one `org.hypercerts.collection` record per list, owning a curated `items` array of award strongRefs." All awards continue to point at a single per-issuer default `badge.definition`; lists become a curation overlay rather than a badge sub-type.

Branch: `feat/lists-as-collections` off `feat/positioning-redesign`. Draft PR opens into `feat/positioning-redesign`.

## Why

See `discovery.md` and the user-facing pros/cons summary in the chat session — short version:

- Schema proliferation: every new list is a published lexicon-shaped record today; moving to a generic collection means one schema for all lists.
- Cross-list queries become trivial — the indexer already speaks `orgHypercertsCollection` (Projects tab uses it).
- Lists become composable curation, decoupled from badge identity. Deleting a list does not delete endorsements.
- The user has explicitly asked for Option B: lists as `org.hypercerts.collection` records, all endorsements sharing one badge definition.

## Target architecture

### Three actors, three records

1. **One `app.certified.badge.definition` per issuer.** The existing default (auto-created via `ensureEndorsementDefinition`) with `badgeType: "endorsement"` and `title: "Endorsement"`. No more user-created list-defs.
2. **`app.certified.badge.award` for every endorsement.** Subject DID + `note` unchanged. The `badge` strongRef always points at the issuer's single default def.
3. **`org.hypercerts.collection` per list.** New record shape:
    ```jsonc
    {
      "$type": "org.hypercerts.collection",
      "type": "endorsement-list",
      "title": "Frontend mentors",
      "description": "...optional...",
      "createdAt": "2026-05-20T...",
      "items": [
        {
          "itemIdentifier": {
            "uri": "at://did:plc:.../app.certified.badge.award/<rkey>",
            "cid": "..."
          },
          "addedAt": "2026-05-20T..."
        }
      ]
    }
    ```
   - `type: "endorsement-list"` disambiguates from projects (`type: "project"`).
   - `items[i].itemIdentifier` is a strongRef to an award (same shape as project items strongRef to certs).
   - `items[i].addedAt` is optional metadata; client preserves on round-trip.
   - All awards on a list are owned by the same issuer, so all item URIs share the issuer's DID — same PDS as the collection record.

### Lifecycle

- **Create list:** write a new `org.hypercerts.collection` with `type: "endorsement-list"`, `title`, `description`, empty `items`.
- **Add subject to list:** ensure-default-def → ensure award exists for subject (create if absent) → read collection → append item → write collection.
- **Remove subject from list:** read collection → drop item → write collection. Award is not deleted.
- **Edit list metadata:** read collection → splice title/description → write back (server-pins `createdAt`, `type`).
- **Delete list:** delete collection record. Awards survive.
- **Default endorsements panel:** unchanged — the existing default-def + award flow already works without lists.

## Files

### Service layer

- `src/lib/atproto/collection.ts` — extend with:
  - `LIST_TYPE = "endorsement-list"` constant.
  - `EndorsementListCollectionValue` type narrowing `CollectionValue` to the list shape.
  - `listEndorsementListCollections(did, signal?, opts?)` — fetch `org.hypercerts.collection` records, filter `type === "endorsement-list"`. Reuses the existing `fetchCollections` helper.
  - `createEndorsementListCollection(ownDid, {title, description})`, `updateEndorsementListCollection(ownDid, rkey, {title, description, items, existingCreatedAt})`, `deleteEndorsementListCollection(ownDid, rkey)`, `appendItemToList(ownDid, rkey, existing, awardRef)`, `removeItemFromList(ownDid, rkey, existing, awardUri)`. All go through `/api/xrpc/com/atproto/repo/createRecord`, `putRecord`, `deleteRecord` (own-DID path only; lists are personal, no group flow for v1).
  - `purgeAwardFromLists(ownDid, awardUri)` — iterates the owner's lists and removes items whose `itemIdentifier.uri === awardUri`. Called from `deleteEndorsementAward` to keep lists consistent.
- `src/lib/atproto/badges.ts` — remove the list-via-definition surface area:
  - Remove `createListDefinition`, `updateListDefinition`, `deleteListAndAwards`, `createListAward`.
  - `ensureEndorsementDefinition` stays — it's the one definition every award still points at.
  - `createEndorsementAward` stays unchanged.
  - `deleteEndorsementAward` extended to call `purgeAwardFromLists` (in `collection.ts`) before the actual award delete, so a revoke from the Given panel doesn't leave ghost rows on the issuer's lists.
  - Keep response helpers untouched.
- `src/app/api/xrpc/[...method]/route.ts` — **no change.** `"org.hypercerts.collection"` is already in `ALLOWED_WRITE_COLLECTIONS` (used by the projects flow). Verified during review-round-1.
- `src/lib/auth/rate-limit.ts` — `RATE_LIMITED_WRITE_COLLECTIONS`:
  - Keep `"app.certified.badge.award" → "endorsement-issue"`.
  - Add `"org.hypercerts.collection" → "endorsement-list-write"` (new scope, conservative limit: 30/hour, 100/day). Reason: prevents abuse via mass list creation.

### Hooks

- `src/hooks/use-endorsement-lists.ts` — full refactor:
  - Replace `listDefinitions`/`listAwards` parallel call with `listEndorsementListCollections` + `listAwards`.
  - Group: for each list collection, resolve `items[i].itemIdentifier.uri` to an award record (lookup in the fetched awards array by URI). **Items that don't resolve are dropped silently — orphan items render nothing and re-fetches don't carry them forward.** (Possible causes: an award was revoked elsewhere, or a foreign-PDS race.)
  - `createList(title, description)` calls `createEndorsementListCollection`.
  - `updateList(rkey, title, description)` calls `updateEndorsementListCollection`.
  - `deleteList(rkey)` calls `deleteEndorsementListCollection`. Returns `void` (awards survive; old `{deletedAwards}` shape is dropped — only consumer is `endorsement-lists.tsx:217` which discards the value).
  - Add `addSubjectToList(rkey, subjectDid)`: dedupe (skip if already in the list) → ensure-award (`createEndorsementAward`, which is idempotent at the def level and creates a fresh award even if one exists already — that's existing behaviour, do not change in this PR) → read collection → append item → put. Optimistic UI.
  - Add `removeSubjectFromList(rkey, awardUri)`: read collection → drop item by `itemIdentifier.uri` match → put. Optimistic UI. Does NOT delete the underlying award.
  - 5-minute cache preserved.

- `src/hooks/use-endorsements.ts` — Given panel:
  - Drop the per-award `listTitle` POPULATION (awards no longer belong to one list). The `listTitle?: string` field on `GivenEndorsement` stays for prop-shape continuity with `PersonCard.listTitle?` (avoids touching `profile-endorsements.tsx`), but is always `undefined` after this PR.
  - Multi-list chip rendering on Given panel is deliberately deferred — see "Out of scope." `profile-endorsements.tsx` is NOT touched.

- `src/hooks/use-received-endorsements.ts` — Received panel:
  - Unchanged in scope. The indexer query for awards targeting `profileDid` doesn't need the def-title join anymore — every award is the canonical endorsement def. The `EndorsementDefs` join can become a no-op (drop in a follow-up; for v1 keep the join but treat the def as decorative).

### UI

- `src/components/profile/endorsement-lists.tsx` — minimal change:
  - Field names and the renderer largely unchanged (still `lists[i].title`, `description`, `items`).
  - "Add people" still routes through `endorse-people-modal`, but on `onEndorse(subjectDid)` calls `addSubjectToList(rkey, subjectDid)` instead of `createListAward(subjectDid, badgeRef)`.
  - **Copy fix — list delete confirm:** "Delete this list? Your endorsements are not removed." (today the copy implies awards get removed too).
  - **Copy fix — `RevokeListItemButton` (lines 822-823 today):** today asserts award deletion. Replace with "Remove from list? Their endorsement from you stays — only the list membership is removed."
  - Empty-state copy unchanged.
- `src/components/profile/endorse-people-modal.tsx` — minimal change:
  - The shared modal already takes an `onEndorse` callback; lists pass `addSubjectToList`. No structural change.
  - Add an optional `subtitle` prop (or context-aware copy) so that when the modal is opened from a list it reads "They'll be endorsed (if not already) and added to '<list-title>'." Default flow (not from a list) keeps existing copy.
- `src/components/profile/profile-endorsements.tsx` — no change.
- `src/components/profile/profile-overview.tsx`, `profile-sidebar.tsx` — no change.

### Indexer / API routes

- `src/app/api/indexer/route.ts` — `EndorsementDefs` query stays for the Received panel decoration (or, optionally, drop it as a follow-up — out of scope here). No new server-held query in v1; lists are read from PDS only.

### Tests

- `tests/atproto/collection.test.ts` (new) — unit-test the collection helpers (build the record, append item, remove item).
- `tests/atproto/badges.test.ts` (if a useful seam) — touch only the removed-function call sites to confirm imports compile.
- No e2e tests are added in v1.

## Acceptance criteria

1. **Owner can create a list.** Title + optional description → record appears on PDS as `org.hypercerts.collection` with `type: "endorsement-list"` and empty `items`. Lists tab shows the new list immediately.
2. **Owner can add a subject to a list.** The subject receives an award (if not already endorsed) AND the collection's items grows by 1. Refresh shows persisted state. Re-adding the same subject is a no-op (no double-award, no double-item).
3. **Owner can remove a subject from a list.** Items shrinks by 1; the award is NOT deleted (verified by reloading the Given panel).
4. **Owner can edit a list's title / description.** Round-trip persists.
5. **Owner can delete a list.** Collection record gone; awards survive.
6. **Visitor can view someone's lists.** Public read works without auth (PDS `listRecords` is public).
7. **`type: "project"` collections are not surfaced in the Lists tab.** And `type: "endorsement-list"` collections are not surfaced in the Projects tab.
8. **No regression** on default endorsements (Received / Given panels still work, Endorse button on profile-sidebar still issues an award against the default def).
9. **Type-check** clean (no new tsc errors above baseline). **Lint** clean. **Build** succeeds.

## Migration / backward compat

V1 stance: **no backfill, no legacy reads.**

Existing test/staging PDSes may have old per-list `badge.definition` records. After this PR ships:

- The Lists tab will not surface them (the read path queries `org.hypercerts.collection` only).
- They become invisible orphans on the PDS. Awards that referenced them stay valid as awards (subject + note + createdAt all intact), and the Given panel still renders them as "endorsement of <subject>" without a list label.
- A follow-up PR can run a one-shot migration if real users have non-trivial list data. Out of scope for this PR.

Documented in PR body and DESIGN.md (one-paragraph note).

## Out of scope

- Indexer schema changes — no new GraphQL ops in v1. Lists are PDS-read only. The existing `orgHypercertsCollection` GraphQL surface only powers the Projects counts query and is not extended here.
- Group-owned endorsement lists (mirror of the project group-write path).
- Backfill of legacy `badge.definition`-shaped lists. After this PR, old lists become invisible on the Lists tab; the underlying awards continue to render in Given/Received unchanged.
- Dropping the `EndorsementDefs` indexer join.
- Changing the `badge.response` accept/reject flow.
- Renaming or restyling list UI past the two confirm-copy fixes and the modal-subtitle hint.
- Multi-list chip rendering on the Given panel. `listTitle` is no longer populated; multi-list display is a follow-up once chip-row UX is designed.
- Additional "to unendorse, use the Given panel" affordance — the corrected `RevokeListItemButton` copy already disambiguates; revisit only if user confusion surfaces.
- Removing the `app.certified.badge.definition` collection from the XRPC allowlist (still needed for the default def).
- Cleaning up the `temp.graph.endorsement` lexicon shell (unrelated).
- Cross-issuer "follow this list" semantics.

## Rollback

- Single PR, reverts cleanly if needed — the new collection-based code path is additive at the service layer; the legacy badge-def list code is removed but recoverable from the diff.
- If a regression ships to staging, revert the PR. Production data: any `org.hypercerts.collection` records written under `type: "endorsement-list"` are orphaned but harmless (the Projects tab filters on `type === "project"`, not `!= "endorsement-list"`).
- Awards written between rollout and rollback survive — they're still default-def endorsements.

## Implementation tracks (disjoint file ownership)

Single-author work (this is a tightly coupled refactor; parallel tracks risk merge conflicts). Sequence:

1. Service layer: extend `collection.ts`; trim `badges.ts`; update `xrpc/[...method]/route.ts` and `rate-limit.ts`.
2. Hook layer: rewrite `use-endorsement-lists.ts`; touch `use-endorsements.ts`.
3. UI layer: rewire `endorsement-lists.tsx`'s create/add/delete callbacks; update delete-confirm copy.
4. Tests: unit tests for `collection.ts` helpers.

## Review plan

**Round 1 (plan review).** Three reviewers:

- Spec/lexicon correctness — does the `org.hypercerts.collection` `items` shape with award strongRefs match the canonical lexicon? Will the magic-indexer parse it?
- Build/typing — is the hook surface (`addSubjectToList`, `removeSubjectFromList`) shaped sensibly given how components consume it today? Any breaking type signatures we missed?
- UX impact — does the new "delete list ≠ delete endorsements" semantics need additional UI signposting beyond a confirm-copy tweak?

Decisions logged in `docs/lists-as-collections/review-round-1.md` before implementing.

**Round 2 (impl review).** Two reviewers on the diff:

- Functional correctness — does add/remove/edit/delete actually round-trip via PDS, no lost-update on items[].
- Code quality + smoke test — type cleanliness, error handling at the optimistic edges, dev-server smoke (create/edit/delete a list end-to-end).
