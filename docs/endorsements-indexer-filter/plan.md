# Replace PDS fan-out with indexer subject filter

## Problem

`useReceivedEndorsements` (profile page + `/endorsements`) takes
several seconds to load on a cold cache. Diagnosis:

1. Indexer GraphQL query: `appCertifiedActorProfile` listing every
   certified user (~14 today, growing linearly).
2. **PDS fan-out**: `listAwards(issuerDid)` for EVERY certified user.
   That's the bulk of the latency.
3. For each issuer with a candidate match: `listDefinitions(issuerDid)`
   to verify the badge is endorsement-typed.
4. PDS listResponses on the profile owner for the response-state
   filter.

Steps 2–3 fan out across the universe of certified users. With the
indexer now exposing `subject: DIDFilterInput` on
`AppCertifiedBadgeAwardWhereInput` (magic-indexer PR #75 + the #78
fix for the `{did}` object shape), the entire scan collapses to a
single GraphQL query that returns only the awards-targeting-me.

## Approach

Replace `scanReceivedEndorsements` with `fetchReceivedAwardsFromIndexer`:

```graphql
query ReceivedEndorsements($did: String!, $first: Int!, $after: String) {
  appCertifiedBadgeAward(
    where: { subject: { eq: $did } }
    first: $first
    after: $after
  ) {
    edges { cursor node { uri cid did createdAt note badge } }
    pageInfo { hasNextPage endCursor }
  }
}
```

This collapses N PDS-listAwards round-trips into one indexer query.
The per-issuer definition lookup (`listDefinitions`) stays — it's
the cheapest path to verify badge type, runs only over K unique
issuers (typically 0–2 for a real profile), and is already cached
within a single scan.

### Why keep PDS for definitions?

The indexer's `badge` field is currently exposed as a stringified Go
`map[cid:... uri:...]` literal, which is awkward to parse client-side.
The cleanest mitigation is to leave definition resolution on the
issuer's PDS for now — a separate indexer fix can come later. K is
small, so the win from eliminating the awards fan-out is the
dominant gain.

## Files

### Modified

- `src/hooks/use-received-endorsements.ts` — replace
  `scanReceivedEndorsements` with `fetchReceivedAwardsFromIndexer`.
  Module cache, stale time, focus-revalidate, response-state filter
  all unchanged.
- `src/lib/atproto/badges.ts` — `BadgeAwardValue.subject` typing
  unchanged (still `string | StrongRef`) since we no longer match on
  it client-side. Remove `awardSubjectMatchesDid` — no remaining
  consumers.

### Out of scope

- Indexer's `badge` field serialization fix (separate concern).
- Server-side response-state join. Today we still fetch the owner's
  responses from their PDS and filter client-side; that's the right
  shape (responses on the owner's repo, only owner is authorised
  to read them efficiently).

## Acceptance criteria

1. Loading endorsements on profile + `/endorsements` finishes in one
   indexer round-trip + K issuer PDS round-trips (K = unique issuers
   among matches).
2. Endorsements written in the `defs#did` `{did: "..."}` subject shape
   appear (previously dropped by both `awardSubjectMatchesDid` AND
   the not-yet-fixed indexer filter).
3. Endorsements written in the strongRef shape continue to appear.
4. Response-state filter (rejected awards hidden) continues to work.
5. Module cache + focus-revalidate behaviour unchanged.

## Gating

Open as Draft. Cannot merge until magic-indexer PR #78 is deployed —
without #78, the indexer's subject filter misses 70% of records (the
`{did}` shape), and this PR would return strictly fewer results than
the current PDS scan.

## Rollback

Single revert restores the PDS fan-out scan. The replaced function is
self-contained; module cache / hook contract are unchanged.
