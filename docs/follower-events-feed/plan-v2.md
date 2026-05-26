# Plan v2 — `followerEvents` home timeline

Supersedes `plan.md`. Integrates `review-decisions.md`. Read
`discovery.md` first if you haven't.

## Material changes from v1

- Hydration uses a single pre-built `HydrateFeedPage` op with four
  aliased connections filtered by `where: { uri: { in: $uris } }` — one
  POST per page, not N. Fallback path documented in track 1 if the
  schema doesn't support `uri.in`.
- Mount point is `/feed`, not `/home`. The legacy redirector
  `HomeClient` is dropped from `src/app/feed/page.tsx`.
- Rendering is one `FeedEventCard` component with internal kind
  dispatch, composing primitives (avatar, byline, image) into a
  consistent feed-card chrome. No direct reuse of `ProjectListRow` or
  `EndorsementRow` — their visual registers don't fit a card feed.
- `useBlueskyFollows` gains a `truncated` field (small in-scope change).
- Proxy enforces `MAX_AUTHORS_FILTER_SIZE = 500` (not 1000) and accepts
  empty `authors: []`.
- `nodeToActivityRecord` / `nodeToCollectionRecord` extracted from
  `indexer.ts` so the new hydration mappers reuse them.

## Implementation tracks (each = one commit)

Run **sequentially** — later tracks depend on earlier ones. No parallel
worktrees: this is a single coherent feature, not a sweep.

### Track 1 — Server proxy ops
**Files:** `src/app/api/indexer/route.ts`,
`src/app/api/indexer/__tests__/route.test.ts`.

Add two operations to `OPERATIONS`:

**`FollowerEvents`:**
```graphql
query FollowerEvents(
  $authors: [String!]!
  $first: Int!
  $after: String
  $kinds: [String!]
) {
  followerEvents(
    authors: $authors
    first: $first
    after: $after
    kinds: $kinds
  ) {
    edges {
      cursor
      node {
        id
        kind
        subjectUri
        sortAt
        actor { did handle displayName avatarCid pds }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

`buildVariables` rules:
- `authors` (required): new reader `readAuthorList(value, max=500)` — accepts
  arrays of 0..500 unique DIDs after dedupe, filters out non-DID entries
  silently (matches the fail-soft policy in `readDidList`). Returns null
  only if not an array or oversized. Empty array passes through.
- `first`: `clampFirst(value, MAX_FEED_PAGE_SIZE = 50, default 20)`.
- `after`: `readString(value, MAX_AFTER_LEN)`.
- `kinds`: defensive validation: array of strings, length ≤ 16, each
  string ≤ 64 chars. Drop entry if non-string. Return null if structure
  invalid.

Add constants near other proxy limits:
```ts
const MAX_FEED_PAGE_SIZE = 50
const MAX_AUTHORS_FILTER_SIZE = 500
const MAX_KIND_LIST = 16
```

**`HydrateFeedPage`:**
```graphql
query HydrateFeedPage(
  $activityUris: [String!]!
  $collectionUris: [String!]!
  $badgeAwardUris: [String!]!
  $legacyEndorsementUris: [String!]!
) {
  activities: orgHypercertsClaimActivity(
    first: 50
    where: { uri: { in: $activityUris } }
  ) {
    edges {
      node {
        uri cid did title shortDescription createdAt startDate endDate labels
        image {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallImage { image { ref mimeType } }
        }
        workScope {
          ... on OrgHypercertsClaimActivityWorkScopeString { scope }
        }
      }
    }
  }
  collections: orgHypercertsCollection(
    first: 50
    where: { uri: { in: $collectionUris } }
  ) {
    edges {
      node {
        uri cid did createdAt title shortDescription type
        items { itemIdentifier { ... on ComAtprotoRepoStrongRef { uri cid } } }
        banner {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsLargeImage { image { ref mimeType } }
        }
      }
    }
  }
  badgeAwards: appCertifiedBadgeAward(
    first: 50
    where: { uri: { in: $badgeAwardUris } }
  ) {
    edges {
      node {
        uri cid did createdAt note
        subject { did }
      }
    }
  }
  legacyEndorsements: appCertifiedTempGraphEndorsement(
    first: 50
    where: { uri: { in: $legacyEndorsementUris } }
  ) {
    edges {
      node {
        uri did createdAt
        subject { did }
      }
    }
  }
}
```

`buildVariables`: each `*Uris` is a string array (use a new
`readUriList(value, max=50)` reader: array, length 0..50, each entry
≤ MAX_AFTER_LEN, non-strings dropped). Empty arrays pass through (the
indexer returns empty connections; that's the desired no-op for kinds
the page didn't include).

**Schema-probe step (mandatory before merging Track 1):** during
implementation, send a manual GraphQL probe against the dev indexer
verifying `where: { uri: { in: [...] } }` is supported on each of the
four connections. If any of them rejects, fall back to a per-collection
op pattern (four separate operations, the client fans out only to those
needed for the current page — still better than per-event aliasing).
Record the probe result in the track log.

Tests added:
- `FollowerEvents`: happy path forwards vars; missing `authors` 400s;
  `authors.length > 500` 400s; `first > 50` clamps to 50; `kinds`
  array of non-strings 400s.
- `HydrateFeedPage`: happy path; non-array `*Uris` 400s; per-list
  cap (51 entries) 400s; empty arrays accepted.

### Track 2 — Client module
**Files:** `src/lib/atproto/follower-events.ts` (new),
`src/lib/atproto/__tests__/follower-events.test.ts` (new),
`src/lib/atproto/indexer.ts` (small refactor — extract mappers).

Refactor: extract `nodeToActivityRecord` (currently inline at
`indexer.ts:60-86`) and `nodeToCollectionRecord` (currently inline at
`indexer.ts:714-759`) to exported helpers. The hydration mappers in
`follower-events.ts` import them.

New module surface:

```ts
export const MAX_AUTHORS_FILTER_SIZE = 500
export const MAX_FEED_PAGE_SIZE = 50
export const DEFAULT_FEED_PAGE_SIZE = 20
export const FOREGROUND_POLL_MS = 30_000
export const BACKGROUND_POLL_MS = 5 * 60_000

export const KNOWN_FEED_EVENT_KINDS = [
  "cert.create",
  "collection.create",
  "badge.award",
  "legacy.endorsement",
] as const
export type KnownFeedEventKind = (typeof KNOWN_FEED_EVENT_KINDS)[number]

export interface FeedActor {
  did: string
  handle: string | null
  displayName: string | null
  avatarCid: string | null
  pds: string | null
}

export interface FeedEvent {
  id: string             // at:// URI; stable React key
  kind: string           // wire shape — narrow at dispatch site
  subjectUri: string
  sortAt: string         // RFC3339Nano
  actor: FeedActor
}

export interface FeedEventPage {
  events: FeedEvent[]
  endCursor: string | null
  hasNextPage: boolean
}

export class FollowerEventsError extends Error {
  readonly code:
    | "AUTHORS_REQUIRED"      // defensive — proxy rejects first
    | "AUTHORS_FILTER_TOO_LARGE"
    | "INVALID_CURSOR"
    | null
  constructor(message: string, code: FollowerEventsError["code"])
}

export interface FetchFollowerEventsOptions {
  authors: string[]       // already deduped + truncated to ≤ 500
  first?: number
  after?: string
  kinds?: string[]
  signal?: AbortSignal
}

export async function fetchFollowerEvents(
  options: FetchFollowerEventsOptions,
): Promise<FeedEventPage>

export interface HydratedPayloadActivity {
  kind: "cert.create"
  record: ActivityRecord
}
export interface HydratedPayloadCollection {
  kind: "collection.create"
  record: CollectionRecord
}
export interface HydratedPayloadBadgeAward {
  kind: "badge.award"
  subjectDid: string
  note: string | null
  createdAt: string
}
export interface HydratedPayloadLegacyEndorsement {
  kind: "legacy.endorsement"
  subjectDid: string
  createdAt: string
}

export type HydratedPayload =
  | HydratedPayloadActivity
  | HydratedPayloadCollection
  | HydratedPayloadBadgeAward
  | HydratedPayloadLegacyEndorsement

export interface HydratedFeedEvent {
  event: FeedEvent
  payload: HydratedPayload | null  // null = 404 OR unknown kind
}

export async function hydrateFeedEvents(
  events: FeedEvent[],
  signal?: AbortSignal,
): Promise<HydratedFeedEvent[]>
```

Implementation notes:
- `fetchFollowerEvents`: POST to `/api/indexer`, map `extensions.code` to
  `FollowerEventsError`. Empty `events: []` for empty authors. Returns
  fresh `Error` for non-GraphQL failures.
- `hydrateFeedEvents`: bucket events by kind into four URI arrays
  (unknown kinds skipped), one POST to `HydrateFeedPage`, build a
  `Map<uri, HydratedPayload>` keyed by event id, walk the input events,
  emit `{event, payload}` for each. Order preserved.

Tests:
- Happy path: parses connection, returns FeedEventPage.
- Each `extensions.code` maps to a `FollowerEventsError.code`.
- Empty `authors: []` returns empty page.
- `hydrateFeedEvents` correctly buckets by kind, handles unknown kinds
  (payload null), preserves input order.

### Track 3 — `useBlueskyFollows` truncation
**Files:** `src/hooks/use-bluesky-follows.ts`,
`src/hooks/__tests__/use-bluesky-follows.test.ts` (add cases or new file).

Tiny change: track whether the page-walk hit `MAX_FOLLOWS`. Return
shape becomes `{ followedDids, truncated, isLoading, error }`. Update
the existing callers if they destructure — verify none break.

Cache entry shape updates to include the boolean.

### Track 4 — `useHomeFeedAuthors`
**Files:** `src/hooks/use-home-feed-authors.ts` (new),
`src/hooks/__tests__/use-home-feed-authors.test.ts` (new).

```ts
export interface UseHomeFeedAuthorsResult {
  authors: string[]            // deduped, ranked, ≤ 500
  isOversized: boolean         // union size > 500
  truncatedBySource: boolean   // either upstream hit 10k cap
  isLoading: boolean
  error: string | null
}

export function useHomeFeedAuthors(did: string | null): UseHomeFeedAuthorsResult
```

Implementation:
- Pulls `useBlueskyFollows(did)` and `useFollowing(did)` in parallel.
- Memoise union → `Set<string>` → sorted array (ascending DID string).
- If size > 500: slice to first 500 entries (alphabetical), mark
  `isOversized: true`.
- `truncatedBySource = blueskyTruncated || certifiedTruncated`.
- Loading is OR of upstream hooks. Error is first non-null.

### Track 5 — `useHomeFeed`
**Files:** `src/hooks/use-home-feed.ts` (new),
`src/hooks/__tests__/use-home-feed.test.ts` (new).

```ts
export interface UseHomeFeedOptions {
  kinds?: string[]
}

export interface UseHomeFeedResult {
  events: HydratedFeedEvent[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  errorCode: FollowerEventsError["code"] | null
  hasMore: boolean
  isOversized: boolean
  truncatedBySource: boolean
  loadMore: () => void
  refresh: () => Promise<void>
}

export function useHomeFeed(options?: UseHomeFeedOptions): UseHomeFeedResult
```

Implementation:
- `did` from `useAuth()`.
- Authors from `useHomeFeedAuthors(did)`.
- Stable string key `authors.join(",")|kinds.join(",")` drives the
  initial fetch effect. Same primitive-key pattern as `useGlobalFeed`.
- `loadMore` paginates using saved `endCursor`. Returns silently if no
  cursor or already loading.
- `refresh` fetches a fresh page-1 and merges into state by `event.id`:
  any new events are prepended; existing events remain at their
  positions; cursors for already-loaded pages stay untouched. Polling
  uses this — so the user's `loadMore` history is preserved across
  polls.
- Polling: `useEffect` with `setInterval`. Cadence is
  `FOREGROUND_POLL_MS` when `document.visibilityState === "visible"`,
  `BACKGROUND_POLL_MS` otherwise. Switch via `visibilitychange`
  listener. Paused entirely when `authors.length === 0` (signed out or
  no follows). The `refresh` callback is snapshotted via `useRef` (per
  `use-global-feed.ts:56-57`) so the polling effect doesn't tear down
  per render.
- `errorCode` carries the `FollowerEventsError.code` when applicable;
  hydration errors set `error` but leave `errorCode = null`.

Tests:
- Initial load + hydrate populates `events` in sort order.
- `loadMore` paginates.
- `refresh` merges by id, preserves loaded pages.
- Polling: foreground interval triggers refresh; visibility-change
  toggles cadence; paused when authors empty.
- `AUTHORS_FILTER_TOO_LARGE` sets `errorCode` (defensive — shouldn't
  happen because we pre-truncate, but the test pins the contract).

### Track 6 — `FeedEventCard`
**Files:**
- `src/components/feed/feed-event-card.tsx` (new) — the dispatch +
  consistent card chrome.
- `src/components/feed/__tests__/feed-event-card.test.tsx` (new).
- `src/app/styles/feed.css` (extend with new card classes if needed).

Layout: one shared outer card (avatar + byline header → kind-specific
body → optional footer). Internal switch on `event.kind`:

- `cert.create`: body = title + shortDescription + image (resolved via
  existing `resolveActivityImageUrl`). Compose an `ActivityRecord`
  inline from the payload + event metadata; `did = event.actor.did`.
- `collection.create`: body = title + type pill ("project" /
  "endorsement-list") + banner image.
- `badge.award`: body = "{actor.displayName} awarded a badge to" +
  subject byline (subject DID from payload; resolve via `useAuthorInfo`
  or equivalent). Optional `note`.
- `legacy.endorsement`: same shape as `badge.award` but copy is
  "{actor.displayName} endorsed" (legacy lexicon).
- _unknown kind_: body = "{actor.displayName} did something" + linked
  `subjectUri` (anchor to an at://-URI route or degraded display).

Avatar source: `event.actor.avatarCid` → reuse the existing avatar URL
helper (find during implementation; do not reimplement).

The card chrome (outer container, header positioning, padding,
typography) is added to `feed.css` or a new `feed-event-card.css`
imported by the component. Visual reference: align with the existing
`.feed` rhythm (one card per event, generous whitespace, image-heavy).

### Track 7 — Wire into `/feed`
**Files:** `src/app/feed/page.tsx`.

Replace `HomeClient` with the new feed:

```tsx
"use client"
import HomeFeed from "@/components/feed/home-feed"
import { useHomeFeed } from "@/hooks/use-home-feed"
import { usePageTitle } from "@/lib/navbar-context"

export default function FeedPage() {
  usePageTitle("Feed")
  const feed = useHomeFeed()
  return <HomeFeed {...feed} />
}
```

Add `src/components/feed/home-feed.tsx` (the feed shell) — accepts
`UseHomeFeedResult` props, renders:
- Three-variant empty state:
  - signed-out (auth.did null) → "Sign in to see your feed."
  - signed-in + 0 authors → "Follow people to see their activity here."
  - signed-in + authors but 0 events → "No activity from your follows yet."
- Warning banner when `isOversized` or `truncatedBySource`.
- Loading: 3× `ActivityCardSkeleton` (existing component).
- Error: `EmptyState icon={AlertCircle}` with the error message; if
  `errorCode === "AUTHORS_FILTER_TOO_LARGE"` show a more specific copy.
- Per event: `<FeedEventCard event={hydrated.event} payload={hydrated.payload} />`.
- Sentinel-based infinite scroll, calls `loadMore`.

Note: `/feed/page.tsx` had `export const metadata` for SEO. Keep it
even though the page is now interactive — the metadata is harmless and
the route is still server-rendered. The `"use client"` directive applies
to the default export; metadata exports remain server-side per Next.js
rules.

### Track 8 — Methodology + commit
**Files:** none beyond docs already in `docs/follower-events-feed/`.

Final track captures: what landed, what was deferred, what to watch
in CI.

## Acceptance criteria

Same as v1, plus:
- `/feed` route renders the new feed instead of the legacy redirector.
- `FeedEventCard` renders each of the four kinds consistently and the
  fallback for an unknown kind.
- Truncation banner displays when `isOversized` or `truncatedBySource`.
- Schema probe for `where: { uri: { in: ... } }` documented in
  Track 1's commit body — or, if the fallback path was needed, the
  fallback design noted in `docs/follower-events-feed/03-track-logs/`.

## Deferred (out of scope for this PR)

- Recent-interaction author ranking.
- Endorsement-vs-other-badge-type distinction.
- Migrating `ActivityFeed.following` to the new feed.
- Batched `resolve-did` for actor lookups in endorsement cards.
- Per-kind skeleton variants.
- Subscription / live updates.
- Background polling stop-after-N-minutes.
