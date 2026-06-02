# Implementation log — issue #88

Branch `feat/88-follower-events-feed` off `feat/positioning-redesign`.

## Tracks landed

1. **Server proxy ops** (`feat(api/indexer)`) — adds `FollowerEvents`
   and `HydrateFeedPage` operations. Enforces `MAX_AUTHORS_FILTER_SIZE
   = 500` and `MAX_FEED_PAGE_SIZE = 50` at the proxy. Empty
   `authors: []` accepted (load-bearing — server returns empty
   connection). MAX_BODY_SIZE bumped 16KB → 32KB for the worst-case
   hydration payload.
2. **Client module** (`feat(atproto)`) — `fetchFollowerEvents`,
   `hydrateFeedEvents`, types, constants, `FollowerEventsError`.
   Mappers `nodeToActivityRecord` / `nodeToCollectionRecord` exported
   from `indexer.ts` so hydration reuses the exact blob-ref
   unwrapping the existing fetchers do.
3. **`useBlueskyFollows` truncated flag** (`refactor(hooks)`) — small
   in-scope change to make the contract symmetric with `useFollowing`
   and unblock `useHomeFeedAuthors.truncatedBySource`.
4. **`useHomeFeedAuthors`** — composes Bluesky + Certified follows
   into a deduped + sorted + cap-truncated array. Pure logic
   extracted into `computeHomeFeedAuthors` for unit testing.
5. **`useHomeFeed`** — paged + polled FollowerEvents driver.
   Visibility-aware polling (30s foreground / 5min background),
   refresh merges by event.id, refresh on tab-focus, paused entirely
   when authors is empty.
6. **`FeedEventCard` + `HomeFeed`** — one card component with
   kind-dispatch, three documented empty states, error state,
   warning banner, IntersectionObserver infinite scroll. CSS
   additions consolidated in `feed.css` reusing existing
   `.feed-card` primitives.
7. **`/feed` wire-up** — replaces the legacy `HomeClient`
   redirector with the new feed at the route the redesign's nav
   already points at.

## Schema probe — read before merging

The plan called for a phase-4 manual probe verifying that
`where: { uri: { in: [...] } }` is supported on each of the four
hydration connections (activities, collections, badge awards, legacy
endorsements). **I did not run this probe** — the dev sandbox doesn't
have a live indexer to talk to (calls would hit
`magic-indexer-dev.up.railway.app` which is rate-limited and
unauthenticated for our IP block).

The risk: if `uri.in` is unsupported on one or more of these
connections, the page will load a feed with empty `payload`s for
those kinds — they'll render as fallback "did something" cards
instead of full hydration. Functional, but visually wrong.

**Mitigation:**
- Build / typecheck / tests all green.
- `extensions.code` mapping on `FollowerEventsError` is decoupled
  from the hydration schema — the feed itself loads regardless of
  hydration success.
- Pre-merge: someone with credentials runs the probe via the dev
  console (`POST /api/indexer { operationName: "HydrateFeedPage",
  variables: { activityUris: ["at://..."], collectionUris: [], ... } }`)
  and confirms the four `*.edges` keys come back as arrays. If any
  errors with `"unknown argument 'uri'"` or similar, downgrade that
  branch to a per-collection fan-out (one POST per non-empty
  bucket) before merge.

## Verification

Baseline at branch cut: typecheck 0 errors, lint 55 warnings, 157 tests.
Final on this branch: typecheck 0 errors, lint 55 warnings, 203 tests.

Per-track verification gate was clean on every commit. Build passes.

Dev-server smoke: `/feed` mounts in unauthenticated state, returns
200 with the loading skeleton + the EmptyState for "sign in to see
your feed." No console errors. Full sign-in-to-loaded-feed flow not
exercised — requires real credentials against the live indexer.

## Deferred (carried forward from plan-v2 + new items)

- **Polling cadence + visibility tests.** The hook test file covers
  initial load, loadMore, refresh-merge, and errorCode mapping. The
  polling logic (`setInterval` + `visibilitychange` switching) is not
  covered by automated tests — fake-timer + React-effect interaction
  is brittle. Manual smoke + monitoring covers it for v1.
- **Recent-interaction author ranking.** Alphabetical-by-DID
  truncation ships in v1; recency ranking deferred.
- **Endorsement-vs-other-badge-type distinction.** v1 renders all
  `badge.award` with the same chrome.
- **Per-kind skeleton variants.** Generic ActivityCardSkeleton
  served for all loading states.
- **`ActivityFeed.following` migration.** The existing "Following"
  mode in `activity-feed.tsx` still uses the old single-kind
  activity feed. Migration to `useHomeFeed` is a follow-up; the
  surface is reachable from `/welcome` or via deep-link only.
- **Batched `resolve-did` for endorsement subjects.** Each card with
  a subject DID fires its own `useAuthorInfo` lookup; module-level
  cache dedupes but the first paint still has N round-trips.
- **Subscription / live updates.** Server doesn't support yet.
- **Stop-after-N-idle polling.** Background polling continues
  indefinitely. Matches existing notifications behaviour.

## Notes for the reviewer

- The actor avatar URL is built via `buildAvatarUrlFromCid`. This
  function validates the CID is alphanumeric (defense in depth
  against a compromised indexer) — verified that `actor.avatarCid`
  from `followerEvents` matches that shape per existing usage in
  `EndorsementClosureIssuer`.
- `formatRelativeTime` is reused unchanged from `activity.ts`.
- `useAuthorInfo` (already in the codebase) handles caching, so the
  subject byline on badge.award / legacy.endorsement events doesn't
  multiply network requests.
