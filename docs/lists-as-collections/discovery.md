# Lists-as-collections — discovery

Snapshot of how endorsement lists are implemented today, what `org.hypercerts.collection` already does in this repo, and what the migration touches. Speculative architecture lives in `plan.md`; this file is just observations.

## Current model (Option A)

A "list" is an `app.certified.badge.definition` record on the owner's PDS with:

- `badgeType === "endorsement"`
- `title !== "Endorsement"` (the reserved default — that's the auto-created shell behind the Received/Given panels)
- optional `description`

An "endorsement in list X" is an `app.certified.badge.award` record on the same PDS whose `badge` strongRef points at list X's definition URI.

Three coupled lexicons:

| Collection | Role |
| --- | --- |
| `app.certified.badge.definition` | Defines a badge type. One per user is the default endorsement def; additional ones are lists. |
| `app.certified.badge.award` | An award from issuer → subject, referencing a definition via `badge.{uri, cid}`. |
| `app.certified.badge.response` | Recipient accept/reject lever, references the award via `badgeAward.{uri, cid}`. Unchanged in scope of this migration. |

### Code map

**Service layer** (`src/lib/atproto/badges.ts`, 940 lines)

- Constants: `BADGE_DEFINITION_COLLECTION`, `BADGE_AWARD_COLLECTION`, `BADGE_RESPONSE_COLLECTION`, `ENDORSEMENT_BADGE_TYPE = "endorsement"`, `ENDORSEMENT_BADGE_TITLE = "Endorsement"`.
- `listDefinitions(did)` — PDS `listRecords` over `badge.definition`.
- `ensureEndorsementDefinition(did)` — idempotent find-or-create of the default endorsement def. Web-Lock + dedupe-on-read against same-account double-create.
- `createListDefinition(title, description)` — write a custom def with `badgeType: "endorsement"` and the given title; rejects the reserved `"Endorsement"` title.
- `updateListDefinition(rkey, createdAt, title, description)` — round-trip overwrite preserving rkey + createdAt.
- `deleteListAndAwards(listRkey, awardRkeys[])` — sequential delete of awards then the def. Awards first so an interrupted run never orphans them under a missing def.
- `createEndorsementAward(subjectDid, note)` — default-def award.
- `createListAward(subjectDid, badgeRef)` — list-def award. No `note` accepted (the list itself is the reason).
- `listAwards(did)`, `listResponses(did)`, `resolveResponseState(...)` — read paths.

**Hooks**

- `src/hooks/use-endorsement-lists.ts` — owner/visitor view of every list on a DID. Fetches `listDefinitions` + `listAwards` in parallel, filters defs to the `endorsement` badgeType & non-reserved title, groups awards by `badge.uri`. Exposes `createList`, `updateList`, `deleteList` (owner-only). 5-minute in-memory cache keyed by DID.
- `src/hooks/use-endorsements.ts` (Given panel) — fetches the viewer's awards, joins each award's `badge.uri` to a definition title, decorates with `listTitle` when the def is a non-default list.
- `src/hooks/use-received-endorsements.ts` — magic-indexer GraphQL backed; pulls `appCertifiedBadgeAward` rows targeting `profileDid` and resolves definitions via `appCertifiedBadgeDefinition` to filter on `badgeType === "endorsement"`.

**UI**

- `src/components/profile/endorsement-lists.tsx` — master/detail UI for owner lists; create/edit/delete modals; "Add people" entry to the modal below.
- `src/components/profile/endorse-people-modal.tsx` — reused for default endorsements (`createEndorsementAward`) and per-list adds (`createListAward`).
- `src/components/profile/profile-endorsements.tsx` — tab orchestrator. Lists section is owner-only.
- `src/components/profile/profile-overview.tsx`, `profile-sidebar.tsx` — touch the Given/Received hooks but don't see list metadata directly.

**Server**

- `src/app/api/xrpc/[...method]/route.ts` — `ALLOWED_WRITE_COLLECTIONS` includes `badge.definition`, `badge.award`, `badge.response`. Rate-limit scope `endorsement-issue` maps to `badge.award`.
- `src/app/api/indexer/route.ts` — server-held GraphQL queries:
  - `ReceivedEndorsements` — `appCertifiedBadgeAward` filtered by `subject == profileDid`.
  - `EndorsementDefs` — `appCertifiedBadgeDefinition` batched by issuer DID, filtered to `badgeType == "endorsement"`. Used to resolve award → list title.
  - Variants for counts.
- `src/lib/auth/rate-limit.ts` — `RATE_LIMITED_WRITE_COLLECTIONS: { "app.certified.badge.award": "endorsement-issue" }`.

## What `org.hypercerts.collection` already does

Used in production today for **projects**.

- `src/lib/atproto/collection.ts` exposes a loose `CollectionValue` and `fetchCollections(did)` (PDS-side `listRecords`).
- `src/lib/atproto/project.ts` writes/updates a project record (dual-path: own-DID via XRPC, group-owned via BFF).
- The BFF route `src/app/api/groups/[groupDid]/project/route.ts` defines the field allowlist, server-pins `createdAt` and `type`, and validates `items` as `{itemIdentifier: {uri, cid}, ...}[]`.
- Discriminator: project records have `type === "project"`. The Projects tab filters on that.
- `items[i].itemIdentifier` is a strongRef. Other fields per item are allowed and passed through.
- `org.hypercerts.collection` is already in `ALLOWED_WRITE_COLLECTIONS` (implicitly — actually the proxy currently does NOT list it; see "Open questions").

## Open questions

1. **Is `org.hypercerts.collection` in `ALLOWED_WRITE_COLLECTIONS`?** A grep on the route file shows badge collections but not the hypercerts one. The project flow uses a separate BFF route for group-owned writes; for own-DID project writes the proxy must allowlist it. Verify or add in implementation.
2. **`items` shape for lists.** Projects use `{itemIdentifier: {uri, cid}}`. Awards live on the issuer's own PDS, so all award URIs are well-formed strongRefs — the same shape fits. Need to confirm with the canonical lexicon whether `org.hypercerts.collection` accepts a heterogeneous mix of items or imposes an item-type constraint.
3. **`type` value for lists.** Has to disambiguate from `"project"`. Candidate: `"endorsement-list"`. Confirm in plan review.
4. **Migration of existing data.** No backfill is the simplest stance; the magic-indexer + UI need to keep reading the old shape during a transition window, OR we drop legacy lists on the floor. Decided in plan, not here.
5. **`items` ordering.** PDS preserves array order on round-trip; that gives us "newest at the top" semantics by client convention. Same as projects.

## Out of scope (this discovery only)

- `badge.response` flow.
- `temp.graph.endorsement` lexicon (placeholder, not in the write path).
- Indexer schema changes — the indexer already speaks `orgHypercertsCollection` (it's the source of the `projects` tab), so list reads can land without a coordinated indexer ship.
