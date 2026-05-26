# Discovery — adopting `followerEvents` for the home timeline

Tracks issue [#88](https://github.com/hypercerts-org/certified-app/issues/88). Magic-indexer
shipped a single GraphQL field `followerEvents` that returns the home-timeline
events in one round-trip; this document catalogues the existing certified-app
surface so the implementation plan can plug in without rebuilding pieces that
already exist.

## GraphQL plumbing

- **Same-origin proxy.** `src/app/api/indexer/route.ts:705` (`POST /api/indexer`)
  is the only path that talks to magic-indexer from the browser. The client
  sends `{operationName, variables}` only; the proxy holds the query strings,
  validates variables per-op, and forwards to `INDEXER_URL`
  (`magic-indexer-dev.up.railway.app/graphql` in dev). CSRF is automatic via
  the `Origin` header (`src/lib/auth/csrf.ts`).
- **Adding an op is a two-touch change** in that file: append the query to the
  `OPERATIONS` table and add a `buildVariables` case. Unknown ops 400 at the
  proxy; unknown variables 400 at `buildVariables`. Existing examples to mirror:
  `Activities` (paginated connection with optional filters) and
  `EndorsementClosure` (returns coded errors via `extensions.code`).
- **All client GraphQL fetchers live in `src/lib/atproto/indexer.ts`.** Each
  fetcher POSTs to `/api/indexer`, parses a typed response, and returns a
  domain-shaped result. `EndorsementClosureError` (line 430) is the existing
  pattern for surfacing `extensions.code` to callers — `followerEvents` errors
  (`AUTHORS_REQUIRED`, `AUTHORS_FILTER_TOO_LARGE`, `INVALID_CURSOR`) should
  follow the same shape.

## Where the feed lives in the app

- **`/home` route (`src/app/home/page.tsx`)** is currently an empty
  placeholder — `<div className="home-page" />` with `usePageTitle("Home")`.
  The redesign reserved this surface for the home-timeline feed, so the new
  hook + components wire in here.
- **`/feed` route (`src/app/feed/page.tsx`)** wraps `HomeClient`, which is the
  legacy redirector (`src/components/landing/home-client.tsx:13`) — sends
  authenticated users to `/profile/{did}` and unauthenticated to `/welcome`.
  Vestigial after the redesign; do not touch.
- **`ActivityFeed` (`src/components/feed/activity-feed.tsx`)** has two modes:
  `for-you` (global activity + trusted-evaluator filter) and `following`
  (Bluesky-follows-only via `useFollowedDids` which currently wraps
  `useBlueskyFollows`). The new feed supersedes the `following` mode in
  spirit but lives at a different mount point — defer the migration of
  `ActivityFeed.following`.

## Follow-set source of truth

The viewer's `authors` argument to `followerEvents` is the union of:

- **Bluesky follows** — `useBlueskyFollows(did)` →
  `{ followedDids: Set<string>, isLoading, error, truncated? }`
  (`src/hooks/use-bluesky-follows.ts`). Reads `app.bsky.graph.follow` via
  `/api/xrpc/com/atproto/repo/listRecords`. Module-level cache, 5-min TTL,
  10k page-walk cap with `truncated` flag.
- **Certified follows** — `useFollowing(did)` →
  `{ subjects: Set<string>, truncated, isLoading, ... }`
  (`src/hooks/use-following.ts:59`). Reads `app.certified.graph.follow` from
  the viewer's PDS. Same cache + truncation pattern.
- Both expose `truncated: boolean` for the 10k-record cap. Set arithmetic
  must refuse to act on truncated data — see `useSocialGraphSync` for the
  reference handling (AGENTS.md §15a).

The viewer DID comes from `useAuth().did` (`src/lib/auth/auth-context.tsx`).
No DID → no fetch (empty feed with a "sign in" empty state).

## Server-side limits (issue #88)

- `MaxAuthorsFilterSize = 500` (after server-side dedupe). Server returns
  `extensions.code = "AUTHORS_FILTER_TOO_LARGE"` if oversized. Real Bluesky
  users may exceed this — client must dedupe + rank + truncate before
  sending.
- `MaxFeedPageSize = 50` on `first:`. Tighter than the standard 100.
- Polling cadence assumed by load planning: 30s foreground, 5min background.
  No subscription/live updates in v1.

## Event kinds → existing renderers

| Kind | Source collection | Existing render component | Hydration needs |
|---|---|---|---|
| `cert.create` | `org.hypercerts.claim.activity` | `ActivityCard` (`src/components/feed/activity-card.tsx:21`) — props: `record: ActivityRecord, did: string, label?: LabelValue`. Skeleton variant exists. | Title, shortDescription, createdAt, image, workScope, startDate/endDate. Title/image are the headline. |
| `collection.create` | `org.hypercerts.collection` | `ProjectListRow` (`src/components/explore-page/project-list-row.tsx:21`) — props: `project: CollectionRecord, endorsementMeta?`. Renders different chrome by `collection.value.type` (`project`/`endorsement-list`). | Title, banner, type discriminator, items[]. |
| `badge.award` | `app.certified.badge.award` | `EndorsementRow` (`src/components/endorsements/endorsement-row.tsx:33`) — props: `subjectDid, createdAt, note?, onRevoke?, isRevoking?`. Fetches author info itself via `useAuthorInfo`. | Subject DID, note, createdAt. To distinguish endorsement-typed awards from other badge types, fetch the linked `badge.definition.badgeType` — only needed if we want to gate the renderer. |
| `legacy.endorsement` | `app.certified.temp.graph.endorsement` | Reuses `EndorsementRow`. | Same as `badge.award`. |
| _unknown_ | — | _new_ — generic actor + subjectUri card. Issue recommends shipping this in v1 to future-proof against new server-side kinds. | None — just actor + subjectUri. |

The actor profile (`did, handle, displayName, avatarCid, pds`) is denormalised
onto every `FeedEvent` by the indexer — no per-row actor lookup needed.

## Hydration path

The issue's recommended pattern:

```graphql
query Hydrate {
  a: orgHypercertsClaimActivityByUri(uri: "at://...") { title shortDescription image { ... } }
  b: orgHypercertsCollectionByUri(uri: "at://...") { title banner type ... }
  # one alias per visible event whose kind matches that collection
}
```

The existing certified-app codebase hydrates by-URI via `fetchActivitiesByUris`
(`src/lib/atproto/records-by-uri.ts:67`), which fans out parallel XRPC
`com.atproto.repo.getRecord` calls. **The new feed uses the GraphQL-aliased
path instead** for three reasons:

1. Single HTTP request per page (vs N PDS round-trips).
2. The indexer already has the records — avoids hitting foreign PDSes on every
   page render.
3. Consistent with the issue's recommended client shape.

This adds 4 new server-side ops (`*ByUri` per lexicon) to
`src/app/api/indexer/route.ts`. The `appCertifiedTempGraphEndorsement` lexicon
already has a `LegacyEndorsements` op but no by-URI variant; we add one.

## State management & polling

- **No TanStack Query / SWR.** Standard pattern: `useState` + `useEffect` +
  `useCallback` + module-level `Map<key, CacheEntry>` with TTL +
  `AbortController` per fetch. Reference: `useGlobalFeed`, `useFollowing`,
  `useReceivedEndorsements`.
- **Standard return shape:** `{ data, isLoading, isLoadingMore, error,
  hasMore, loadMore, refetch | refresh }`.
- **Polling with visibility:** the canonical pattern is
  `src/lib/notifications-context.tsx:75-107` — interval-based with
  `document.addEventListener("visibilitychange", ...)`. Notifications use 60s.
  The new feed needs 30s/5min per the issue spec: same shape with two
  intervals selected by `document.visibilityState`.

## Constants & exports

A small module `src/lib/atproto/follower-events.ts` is a cleaner home for the
new types (`FeedEvent`, `FeedEventKind`, `FollowerEventsError`,
`FollowerEventsPage`) and constants (`MAX_AUTHORS_FILTER_SIZE`,
`MAX_FEED_PAGE_SIZE`, polling cadences) than appending another 200 lines to
the already-900-line `indexer.ts`. Same proxy URL though — re-export
`INDEXER_PROXY_URL` from `indexer.ts` or duplicate the literal. Module sits
alongside `indexer.ts`.

## Decisions on open questions in the issue

1. **Follow-set source of truth + caching.** New hook
   `src/hooks/use-home-feed-authors.ts`. Composes `useFollowing` +
   `useBlueskyFollows` (both already cached at module level), dedupes,
   memoises the resulting array. No new caching layer.
2. **Ranking for over-cap follow sets.** v1 ships alphabetical-by-DID
   truncation. Cheap, deterministic, no schema dependency. Most-recent-
   interaction ranking goes in `06-deferred.md` as a follow-up — needs a
   "last interacted" signal we don't have client-side today.
3. **Generic-kind fallback render.** Ship in v1. Cost is one branch in the
   dispatch component plus a small fallback card. Future-proofs the client.

## Out of scope (write into plan; do not implement)

- Migrating `ActivityFeed.following` to the new feed.
- Subscription / live updates (server doesn't support yet).
- Most-recent-interaction author ranking.
- Replacing the existing `fetchActivitiesByUris` XRPC fanout used by
  `/explore` "Recently viewed" — different surface, different needs.
- Server-side payload field for `cert.update` events (issue explicitly
  excludes v1).
