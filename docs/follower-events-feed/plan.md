# Plan v1 — `followerEvents` home timeline

Implements issue [#88](https://github.com/hypercerts-org/certified-app/issues/88).
Read `discovery.md` first; this plan assumes it.

## Scope

- Add a new home-timeline feed wired into `/home`, backed by magic-indexer's
  `followerEvents` GraphQL field.
- One `useHomeFeed` hook + one composed `useHomeFeedAuthors` hook for the
  follow-set union.
- Generic-kind fallback renderer (v1 ships it, per issue's recommendation).
- Visibility-aware polling at 30s foreground / 5min background.
- Tests: server proxy variable validation, client error handling, author
  ranking/truncation.

Out of scope: migrating `ActivityFeed.following`, subscriptions,
most-recent-interaction ranking, replacing XRPC by-URI fanout in other
surfaces. See `discovery.md` § "Out of scope".

## File ownership (disjoint)

New files:
- `src/lib/atproto/follower-events.ts` — types, constants, fetcher, hydration.
- `src/hooks/use-home-feed-authors.ts` — union of Bluesky + Certified follows
  with ranking/truncation.
- `src/hooks/use-home-feed.ts` — the feed hook (paging, polling,
  hydration).
- `src/components/feed/home-feed.tsx` — feed shell that dispatches each event
  to its renderer.
- `src/components/feed/feed-event-fallback-card.tsx` — generic unknown-kind
  card.
- `src/components/feed/__tests__/home-feed.test.tsx` — render + dispatch.
- `src/hooks/__tests__/use-home-feed-authors.test.ts` — union + ranking.
- `src/hooks/__tests__/use-home-feed.test.ts` — polling, error coding,
  pagination.
- `src/lib/atproto/__tests__/follower-events.test.ts` — fetcher happy path
  + each coded error.

Modified files:
- `src/app/api/indexer/route.ts` — append 5 ops (`FollowerEvents` +
  4 `*ByUri` hydration) + their `buildVariables` cases. No edits to existing
  ops.
- `src/app/api/indexer/__tests__/route.test.ts` — add cases for the new ops.
- `src/app/home/page.tsx` — render the new feed (replaces the empty div).

Untouched: `src/lib/atproto/indexer.ts`, `src/hooks/use-global-feed.ts`,
`src/components/feed/activity-feed.tsx`, `src/components/feed/feed-layout.tsx`.

## Server proxy ops (added to `src/app/api/indexer/route.ts`)

### `FollowerEvents`
```graphql
query FollowerEvents(
  $authors: [String!]!
  $first: Int
  $after: String
  $kinds: [String!]
) {
  followerEvents(authors: $authors, first: $first, after: $after, kinds: $kinds) {
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
- `authors`: required. Reuse `readDidList(MAX_DID_LIST)` — caps at 1000
  client-side, server's own 500 cap is the load-bearing one (will return
  `AUTHORS_FILTER_TOO_LARGE` if exceeded). Empty array passes through to the
  upstream — server returns an empty connection (NOT an error). The proxy
  treats `[]` as valid (preserves the load-bearing nil/empty semantic from
  the records repo).
- `first`: optional, clamp to `MAX_FEED_PAGE_SIZE = 50`, default 20.
- `after`: optional, `readString(MAX_AFTER_LEN)` — opaque cursor.
- `kinds`: optional inclusion filter, `readLabelList`-style validation
  (string array, ≤ 16 entries, each ≤ 64 chars).

### `*ByUri` hydration ops

One op per lexicon. Each accepts `uri: String!` and selects the minimum
fields for a headline render:

- `OrgHypercertsClaimActivityByUri(uri)` → `{ title, shortDescription, image { __typename, ...OrgHypercertsDefsUri.uri, ...OrgHypercertsDefsSmallImage.image { ref, mimeType } } }`
- `OrgHypercertsCollectionByUri(uri)` → `{ title, type, banner { same as above with LargeImage }, items { itemIdentifier { ...ComAtprotoRepoStrongRef.uri } } }`
- `AppCertifiedBadgeAwardByUri(uri)` → `{ subject { did }, note, createdAt }`
- `AppCertifiedTempGraphEndorsementByUri(uri)` → `{ subject { did }, createdAt }`

`buildVariables` rules: `uri` is required, `readString(MAX_AFTER_LEN)`-style.

**Caveat:** the issue references these field names but the magic-indexer
schema may surface them with slightly different selection sets. The
implementer verifies the actual schema during Phase 4 by running a manual
GraphQL probe against the dev instance and adjusts selections if a field
doesn't resolve. The proxy validates inputs; the indexer's response shape
drives the response-parsing code, not the other way round.

## Client module — `src/lib/atproto/follower-events.ts`

Exported surface:

```ts
export const MAX_AUTHORS_FILTER_SIZE = 500
export const MAX_FEED_PAGE_SIZE = 50
export const DEFAULT_FEED_PAGE_SIZE = 20
export const FOREGROUND_POLL_MS = 30_000
export const BACKGROUND_POLL_MS = 5 * 60_000

export type FeedEventKind =
  | "cert.create"
  | "collection.create"
  | "badge.award"
  | "legacy.endorsement"
  | string // open union — unknown kinds rendered via fallback

export interface FeedActor {
  did: string
  handle: string | null
  displayName: string | null
  avatarCid: string | null
  pds: string | null
}

export interface FeedEvent {
  id: string           // at:// URI; stable React key
  kind: FeedEventKind
  subjectUri: string
  sortAt: string       // RFC3339Nano
  actor: FeedActor
}

export interface FeedEventPage {
  events: FeedEvent[]
  endCursor: string | null
  hasNextPage: boolean
}

export class FollowerEventsError extends Error {
  readonly code: "AUTHORS_REQUIRED" | "AUTHORS_FILTER_TOO_LARGE" | "INVALID_CURSOR" | null
  constructor(message: string, code: FollowerEventsError["code"])
}

export interface FetchFollowerEventsOptions {
  authors: string[]
  first?: number       // default DEFAULT_FEED_PAGE_SIZE; clamped at MAX_FEED_PAGE_SIZE
  after?: string
  kinds?: string[]
  signal?: AbortSignal
}

export async function fetchFollowerEvents(
  options: FetchFollowerEventsOptions,
): Promise<FeedEventPage>
```

Behaviour:
- Empty `authors: []` is forwarded (server returns empty connection — not an
  error). Documented at the top of the function.
- `extensions.code` mapped to `FollowerEventsError`; consumers branch on it.
- Network/timeout/non-GraphQL errors throw plain `Error`.

Hydration:

```ts
export interface HydratedFeedEvent {
  event: FeedEvent
  /** Per-kind hydrated payload; null when the by-URI lookup 404'd. */
  payload: HydratedActivity | HydratedCollection | HydratedBadgeAward | HydratedLegacyEndorsement | null
}

export async function hydrateFeedEvents(
  events: FeedEvent[],
  signal?: AbortSignal,
): Promise<HydratedFeedEvent[]>
```

Implementation: single GraphQL request with one aliased query per event,
each branching by `event.kind` to the matching `*ByUri` op. Unknown kinds
skip hydration (`payload: null`). 404 results also become `payload: null` —
the dispatch component falls through to the actor + subjectUri fallback
card, exactly like the unknown-kind path.

## Author-union hook — `src/hooks/use-home-feed-authors.ts`

```ts
export interface UseHomeFeedAuthorsResult {
  authors: string[]          // deduped, ranked, truncated to MAX_AUTHORS_FILTER_SIZE
  truncatedByCap: boolean    // union exceeded 500 and was alphabetically truncated
  truncatedBySource: boolean // either upstream hook hit its 10k page-walk cap
  isLoading: boolean
  error: string | null
}

export function useHomeFeedAuthors(did: string | null): UseHomeFeedAuthorsResult
```

Implementation:
- `useBlueskyFollows(did)` and `useFollowing(did)` in parallel.
- Memoise: union = new Set([...blueskyDids, ...certifiedSubjects]).
- If `union.size > MAX_AUTHORS_FILTER_SIZE`: sort ascending by DID string,
  slice to 500, return `truncatedByCap: true`. v1 ranking decision —
  rationale in plan.
- `truncatedBySource = blueskyTruncated || certifiedTruncated`. UI shows
  a warning when true (set arithmetic in `useSocialGraphSync` refuses to
  act under this condition; for a feed query it's a soft warning).
- `isLoading = blueskyLoading || certifiedLoading`. `error` is the first
  non-null error encountered.

## Feed hook — `src/hooks/use-home-feed.ts`

```ts
export interface UseHomeFeedOptions {
  kinds?: string[]   // inclusion filter passed to followerEvents
}

export interface UseHomeFeedResult {
  events: HydratedFeedEvent[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  errorCode: FollowerEventsError["code"] | null
  hasMore: boolean
  truncatedByCap: boolean
  truncatedBySource: boolean
  loadMore: () => void
  refresh: () => Promise<void>
}

export function useHomeFeed(options?: UseHomeFeedOptions): UseHomeFeedResult
```

Implementation details:
- Pulls viewer DID from `useAuth()`.
- Pulls `authors` from `useHomeFeedAuthors(did)`.
- Stable string key on `authors.join(",")` + `kinds.join(",")` drives the
  initial fetch effect (same primitive-key pattern as `useGlobalFeed`).
- Fetches page 1, then `hydrateFeedEvents`. Errors from `fetchFollowerEvents`
  set `error` + `errorCode`; errors from hydration set `error` but leave
  `errorCode = null` (consumers branch on `errorCode` for retry behaviour).
- `loadMore` paginates with the saved `endCursor`. Returns silently if no
  cursor or already loading.
- `refresh` re-fetches page 1, replacing the current list (does NOT reset
  pagination cursors; callers needing a full reset reload from the top).
- **Polling.** Visibility-aware interval, modelled after
  `notifications-context.tsx:75-107`. `document.hidden` switches the
  cadence between FOREGROUND_POLL_MS and BACKGROUND_POLL_MS. Poll calls
  `refresh()` for the latest page (cursor reset). Polling pauses entirely
  when `authors` is empty (no signed-in user / no follows).

Returned `truncatedByCap` / `truncatedBySource` mirror the author-hook
fields so the feed UI can show a once-per-session warning banner.

## Render — `src/components/feed/home-feed.tsx`

Props: `UseHomeFeedResult` plus an optional kinds filter from the parent.
Internally:
- Empty `authors` → `EmptyState` (icon=`Users`, "Follow people to see their
  activity here.").
- `errorCode === "AUTHORS_FILTER_TOO_LARGE"` → shouldn't happen because we
  pre-truncate, but fall back to the same "show all" warning the feed
  already uses (`feed__warning` class).
- Loading + empty → 3× `ActivityCardSkeleton` (existing pattern).
- For each `HydratedFeedEvent`, dispatch on `event.kind`:
  - `cert.create` + hydrated payload → `ActivityCard` (compose an
    `ActivityRecord` shape from the payload + event metadata).
  - `collection.create` + hydrated payload → `ProjectListRow` (compose a
    `CollectionRecord`).
  - `badge.award` / `legacy.endorsement` + hydrated payload →
    `EndorsementRow` (subjectDid from payload, createdAt from event.sortAt
    or payload, note from payload).
  - Else → `FeedEventFallbackCard event={event}` — generic actor + subjectUri
    + opaque-kind label.
- Sentinel-based infinite scroll (mirror `feed-layout.tsx`).

## Generic fallback — `src/components/feed/feed-event-fallback-card.tsx`

Minimal card: actor avatar + handle/displayName + "did something" + linked
subjectUri (rendered as a short anchor to its at:// URI route or a degraded
display when no route matches). One self-contained component, no external
deps beyond what existing rows use.

## `/home` page wiring

Replace the empty placeholder in `src/app/home/page.tsx`:

```tsx
"use client"
import { useHomeFeed } from "@/hooks/use-home-feed"
import HomeFeed from "@/components/feed/home-feed"
import { usePageTitle } from "@/lib/navbar-context"

export default function HomePage() {
  usePageTitle("Home")
  const feed = useHomeFeed()
  return <div className="home-page"><HomeFeed {...feed} /></div>
}
```

CSS lives wherever it fits the existing redesign — `src/app/styles/feed.css`
already exists and is a reasonable home. The home-page wrapper already has
a `.home-page` class with no rules yet; add minimal layout there if needed.

## Tests

### `src/app/api/indexer/__tests__/route.test.ts` (extend)
- `FollowerEvents` happy path: variables forwarded.
- `FollowerEvents` rejects missing `authors`.
- `FollowerEvents` clamps `first` > 50.
- `FollowerEvents` accepts `kinds` array; rejects non-string entries.
- `*ByUri` ops: each rejects missing `uri`, accepts valid `at://` URI.

### `src/lib/atproto/__tests__/follower-events.test.ts` (new)
- `fetchFollowerEvents` happy path: parses edges, returns FeedEventPage.
- Each coded error: maps `extensions.code` to `FollowerEventsError.code`.
- Empty `authors: []` returns empty page without throwing.
- Network failure throws plain `Error`.

### `src/hooks/__tests__/use-home-feed-authors.test.ts` (new)
- Union of two non-overlapping sets.
- Dedupe overlap.
- Truncation at 500 (set size 501 → 500, `truncatedByCap: true`).
- `truncatedBySource` propagates from either upstream hook.

### `src/hooks/__tests__/use-home-feed.test.ts` (new)
- Initial load + hydrate populates `events`.
- `loadMore` paginates with `endCursor`.
- Polling: foreground interval triggers refresh on tick.
- Polling: visibility change to hidden switches to background cadence.
- Polling: pauses when `authors` is empty.
- `AUTHORS_FILTER_TOO_LARGE` from server sets `errorCode`.

### `src/components/feed/__tests__/home-feed.test.tsx` (new)
- Renders one of each kind via the dispatch.
- Renders the fallback for an unknown kind.
- Empty state when `authors.length === 0`.

Existing tests must continue to pass — `npm test` baseline is 157.

## Risks + mitigations

- **Schema drift.** The issue cites `followerEvents` and the four `*ByUri`
  fields; verify against the live dev indexer during Phase 4 by sending a
  manual GraphQL probe (`curl` from the host). If a `*ByUri` op doesn't
  exist on the schema, fall back to `fetchActivitiesByUris` /
  `fetchProjectsByUris` (XRPC fanout) for that kind — single-line dispatch
  change. Note the fallback in the track log.
- **Actor avatar URL construction.** `actor.avatarCid` is content-addressed;
  the URL is built via `/api/xrpc/com/atproto/sync/getBlob`. Reuse the
  existing avatar helper used by `EndorsementRow`'s `useAuthorInfo` — find
  it during implementation, don't reimplement. If not found in 10 minutes,
  inline the URL with a clear comment + add to deferred.
- **Polling cost.** 30s foreground × 50-event payload × N concurrent users
  is non-trivial on the indexer. Match the issue's stated cadence exactly
  (don't tighten); document the choice in the hook's docblock.
- **Cursor stability across polls.** `refresh()` re-fetches page 1, so a
  paginated user's `loadMore` history is reset on every poll. Acceptable
  for v1 (load-bearing on cursor opacity guarantees the same first page
  during refresh); revisit if the UX is jarring.
- **`useFollowing`/`useBlueskyFollows` 5-min cache** means a user who just
  followed someone won't see them in `authors` until cache expiry. Both
  hooks expose `refetch`; for v1 we don't wire follow-button writes to
  refresh the feed authors — note in deferred.

## Acceptance criteria

1. `/home` renders a paginated, polled feed of events from the union of
   the viewer's Bluesky + Certified follows.
2. Each of the four documented kinds renders via its existing dedicated
   component; unknown kinds render the fallback card.
3. `authors` > 500 are truncated client-side; UI shows a non-blocking
   warning.
4. Server coded errors (`AUTHORS_REQUIRED`, `AUTHORS_FILTER_TOO_LARGE`,
   `INVALID_CURSOR`) surface as typed errors on the hook return value.
5. Polling: 30s when tab visible, 5min when hidden; paused entirely when
   `authors.length === 0` or viewer signed out.
6. Typecheck error count ≤ baseline. Lint warning count ≤ baseline. All
   tests pass. Build passes.

## Rollback

Single commit per logical track (constants → server proxy → fetcher →
hydration → author-union hook → feed hook → renderer + fallback → page
wire-in → tests). `/home` reverts cleanly to the empty placeholder by
reverting the page-wire-in commit alone — earlier commits are dormant
without it.
