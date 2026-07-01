# Feature requests: serve the certified-app surface natively

These requests come from [certified-app](https://github.com/) (the Certified frontend), which today runs against the `hb-agent/magic-indexer` fork. We'd like to drop the fork and point `INDEXER_URL` at `api.indexer.hypercerts.dev` directly. This issue lists the schema gaps that currently stop us, each being a capability the fork added.

The list was produced by mapping every GraphQL call certified-app makes and checking it against the **live deployed schema** (introspected `https://api.indexer.hypercerts.dev/graphql` — `Query` root fields, every relevant `*WhereInput`, and the filter-operator types). The good news first: the deployed Hyperindex already covers most of what we need — native label filtering via `where:{ externalLabels:{ has, none } }`, DID filtering via `did:{ eq, in }`, `sortBy/sortDirection`, per-collection `…ByUri(uri)` resolvers, and a top-level `search()`. The items below are the remaining gaps.

> [!IMPORTANT]
> **Each item should first be checked to confirm a change is actually necessary.** This was introspected at one point in time against the deployed schema; the schema may have moved on, a gap may already be partially served by an existing field we missed, or there may be a simpler resolution than the change proposed here. Please validate each request against the current schema before implementing — treat the "concrete schema change" as a suggestion, not a spec.

Priorities are from certified-app's perspective: **P0** = hard blockers with no scalable client-side workaround; **P1** = reconstructable on the client but costly; **P2** = quality-of-life / latency.

(Note: a personalized notifications service that certified-app also uses is intentionally excluded from this issue — it's a separate component, not a schema gap.)

---

## P0 — hard blockers

### 1. Filter badge awards by recipient
**Change:** make `AppCertifiedBadgeAwardWhereInput.subject` a value filter (`DIDFilterInput` / `StringFilterInput`) instead of the current `PresenceFilterInput`; ideally also expose a denormalized `subjectDid` field.

**Why:** This is the single biggest gap. Today the award `subject` is presence-only (`isNull`), so there is no way to ask "awards received by DID X" — you can only filter awards by *issuer* (`did`). This blocks the profile endorsements panel, the per-actor endorsements-received count, and any "endorsement received" event. No client-side workaround scales, since it would mean scanning every award in the network.

*Check first:* confirm `subject` is still presence-only and that no companion field (e.g. a derived recipient DID) already exists.

### 2. Contributor-DID filter on activities
**Change:** add a value-matchable contributor filter to `OrgHypercertsClaimActivityWhereInput` — e.g. `contributors:{ has: $did }` or a `contributor: DIDFilterInput` (handling the bare-DID, strongRef, and `{ identity: did }` variants).

**Why:** Unblocks the profile "Contributed" activities bucket (activities a user contributed to but didn't author). The activity `contributors` field is presence-only today, and the separate `orgHypercertsClaimContribution` / `orgHypercertsClaimContributorInformation` connections only expose their own author `did` with no filterable link back to the parent activity — so there's no reverse path from a contributor to the activities they're on.

*Check first:* verify there isn't already a contribution → activity join we can use, and decide which contributor encodings should match.

### 3. Reverse activity → collection containment
**Change:** add an `itemUri` filter to `OrgHypercertsCollectionWhereInput` — e.g. `items:{ has:{ uri: $certUri } }`, promoting the contained strongRef URI to an indexed, filterable field.

**Why:** Unblocks the activity-detail "Projects containing this activity" section (find every collection/project that lists a given activity). The collection `items` field is presence-only today, so cross-DID containment can't be queried.

*Check first:* confirm `items` is still presence-only and that there's no existing reverse index for collection membership.

---

## P1 — reconstructable on the client, but costly

### 4. `uri` filter on every connection
**Change:** add `uri: StringFilterInput` (supporting `in`) to all `*WhereInput` types, so `where:{ uri:{ in:[…] } }` works.

**Why:** certified-app hydrates a feed page by fetching up to 7 record kinds by URI in one round-trip. Without a `uri` filter we have to fan out via aliased `…ByUri(uri)` resolvers; a real `uri:{ in }` filter collapses that back to one clean batched query per kind and lets label filters apply on the same call.

*Check first:* some connections may already accept a uri filter under a different name; verify per type.

### 5. Home-timeline `followerEvents` union resolver
**Change:** add `followerEvents(authors, kinds, sortBy, first, after)` — a cross-lexicon "create events authored by a set of DIDs" stream, with a **single stable cursor** and a denormalized `actor{ handle, displayName, avatarCid }` on each event.

**Why:** Powers the home feed. We can reconstruct page 1 by querying each lexicon connection with `did:{ in: followSet }` and merging client-side, but reproducing one stable pagination cursor across N merged streams for infinite scroll is the hard part.

*Check first:* see whether a comparable aggregated feed resolver already exists.

### 6. `badgeType` filter on awards
**Change:** add `badgeType: StringFilterInput` to `AppCertifiedBadgeAwardWhereInput`. (It already exists on `AppCertifiedBadgeDefinitionWhereInput` — just not on awards.)

**Why:** Lets us filter to endorsement-typed awards server-side (e.g. for the trusted-evaluator expansion and received endorsements) instead of joining `appCertifiedBadgeDefinition` client-side to discover each award's type. Pairs naturally with request #1.

*Check first:* confirm awards still lack `badgeType` and that it's derivable at index time.

### 7. Endorsement-graph closure resolver
**Change:** add `endorsementClosure(viewer, degree){ accounts{ did, degree, via, issuer{ … } }, truncated }` — a viewer-centric BFS over active (non-rejected, endorsement-typed) badge awards, with a server-side cap.

**Why:** Powers the explore "Endorsed users" filter (everyone reachable within N hops of the viewer through endorsements). The forward direction (`awards where did = issuer` → `subject.did`) is already queryable, so we *can* do client-side BFS — but a server resolver is far cheaper and gives per-account provenance (`via`) and truncation semantics for free.

*Check first:* lower priority if client BFS performs acceptably; validate the degree cap and "active award" definition.

---

## P2 — quality-of-life / latency

### 8. Denormalize issuer + response onto award nodes
**Change:** on the award node, inline `issuer{ handle, displayName, avatarCid, pds }` and the recipient's latest `response{ state, weight, createdAt }`.

**Why:** Removes the N+1 profile/response fan-out on the endorsements panel's first paint. Quality-of-life once request #1 lands.

*Check first:* only worth it if #1 is implemented; confirm the response join is well-defined (latest response wins).

### 9. `isOrganization` flag on actor profile
**Change:** add a derived `isOrganization: BooleanFilterInput` to `AppCertifiedActorProfileWhereInput`.

**Why:** Lets the explore People/Organizations toggle filter in a single query instead of client-side intersecting the profile list with `appCertifiedActorOrganization`. A workaround exists, so this is lower priority.

*Check first:* the client intersect already works; only add if it simplifies enough to justify a derived field.

### 10. Case-insensitive matching (or normalized `type`)
**Change:** add `eqi` to `StringFilterInput`, **or** normalize the collection `type` discriminator at ingest (`"project"`, `"list:endorsements"`).

**Why:** `type:{ eq:"project" }` misses mixed-case records (`"Project"` / `"PROJECT"`), which affects project listings and counts. Normalizing the discriminator upstream is the cleanest fix and helps everyone.

*Check first:* measure how many records actually use non-canonical casing — normalization may be a no-op in practice.

### 11. Denormalized `actorProfile(did)` with handle + typed search
**Change:** add `actorProfile(did){ handle, displayName, description, avatarCid, bannerCid }` (including a resolved handle); and let the top-level `search()` return typed nodes (or expose a `search` arg per connection) instead of the generic record connection.

**Why:** A one-call DID-resolution fast-path (we currently fall back to `resolveHandle` + `app.bsky.actor.getProfile`), and typed full-text search without re-fetching from the generic record connection. Both are pure latency/ergonomics wins.

*Check first:* lowest priority — the legacy resolution path works; only worth it as an optimization.

---

**Summary.** If just the three **P0** items shipped, certified-app could run on stock Hyperindex with every (non-notification) feature present — degraded only in latency on the P1–P2 items, not in capability.

*Compiled from a live introspection of `api.indexer.hypercerts.dev/graphql`. Please re-check each item against the current schema before implementing.*
