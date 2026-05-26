# Review — implementation correctness (does it actually work?)

Scope: branch `feat/88-follower-events-feed` vs. `feat/positioning-redesign`.
Lens: functional correctness against issue #88 and `plan-v2.md`. Not
visual design, not style, not test hygiene beyond "would these catch a
regression".

Methodology: read the seven impl commits end-to-end, walked the issue's
operational constraints, coded errors, and deliberate-v1 limitations
against the code, ran `tsc --noEmit` (clean), traced race conditions
between `loadInitial` / `loadMore` / `refresh` / polling.

## Issues

### Blockers
None — the feed will load, paginate, and poll for real users.

### High — likely visible to users / will produce wrong state under load

1. **`HomeFeed` renders two empty-state UIs at once when authors are
   loaded but produced no events.** `src/components/feed/home-feed.tsx:101-130`.
   Conditions for the primary `EmptyState` (lines 101-107) and the
   secondary `NoFollowsHint` (lines 128-130) both reduce to
   `!isLoading && !error && events.length === 0 && !isOversized &&
   !truncatedBySource`. There's no `else` between them, so a signed-in
   viewer with follows but zero events sees BOTH "No activity yet" and
   the "Not following anyone yet?" hint stacked. The plan called for
   three distinct empty states (signed-out / signed-in + 0 authors /
   signed-in + authors + 0 events); the implementation collapsed this
   into one fork. The `authors.length`-based discrimination is missing
   because `UseHomeFeedResult` doesn't surface authors-count; the
   NoFollowsHint contradictory render is the visible symptom.

2. **In-flight `loadMore` / `refresh` are not torn down when
   `filterKey` changes.** `src/hooks/use-home-feed.ts:144-204`. Only
   `loadInitial` threads an `AbortSignal` (line 113, 116) and only the
   `useEffect` at line 138 aborts it. `loadMore` (line 144) and
   `refresh` (line 179) pass no signal to `fetchFollowerEvents` /
   `hydrateFeedEvents`. Concrete failure mode: viewer's follow set
   updates (Bluesky add/remove, Certified follow), `authorsKey`
   changes, `loadInitial` reloads — but a `loadMore` or polling
   `refresh` that started before the change finishes with the old
   authors and calls `setEvents((prev) => [...incoming, ...prev])`,
   silently splicing stale-author events into the new feed. The dedupe
   doesn't help because the stale events are new to the new feed's
   prev. Probability is high under polling: the foreground poll runs
   every 30 s; the user only needs to follow / unfollow during a poll
   round-trip to land in this state.

3. **`endCursorRef` survives `filterKey` changes.** Same file. When
   `loadInitial` is aborted mid-flight on a key change,
   `endCursorRef.current = page.endCursor` (line 119) is skipped, but
   the *previous* successful initial-load's cursor stays in the ref.
   The new `loadInitial` will overwrite it once its fetch completes,
   but in the window between key-change and new initial-load
   completing, a sentinel-triggered `loadMore` (the IntersectionObserver
   in `home-feed.tsx:39-49` ignores the key change) uses
   `authorsRef.current` (new) with `endCursorRef.current` (old) — the
   server will either return `INVALID_CURSOR` or, worse, decode the
   cursor against the new feed and return semantically-stale rows.
   Reset `endCursorRef.current = null` and `setHasMore(false)` at the
   top of `loadInitial` before the await.

4. **`useSocialGraphSync` still doesn't read `truncated` from
   `useBlueskyFollows`.** `src/hooks/use-social-graph-sync.ts:80-81`.
   The track-3 doc says "Consumers that derive set arithmetic from
   `data` (e.g. `useSocialGraphSync`) must refuse to act on the result
   when this is true — the 'do I already follow X?' check would return
   false-negatives." The new docstring on `use-bluesky-follows.ts:14-19`
   makes that promise but the consumer ignores `truncated`. The hook
   computes `inBoth` / `onlyCertified` / `onlyBluesky` set-arithmetic
   over `blueskyDids` regardless of truncation — exactly the
   false-negative class the docstring warns against. (Pre-existing for
   `useFollowing.truncated`; the new field on `useBlueskyFollows` lands
   without closing the consumer-side hole even though plan-v2's
   "Update the existing callers if they destructure — verify none
   break" check listed this as the unblocking work.)

### Medium — wrong-state but recoverable / unlikely under normal load

5. **`refresh` racing initial load can lose new events.**
   `src/hooks/use-home-feed.ts:118` vs `:188-195`. `loadInitial` does
   imperative `setEvents(hydrated)` (replaces), while `refresh` does
   functional `setEvents((prev) => [...incoming, ...prev])`. If
   `refresh` (from the polling effect's `refreshRef.current()` on
   visibility-change, line 240) commits BEFORE `loadInitial` commits,
   the refresh prepends to `[]` and then `loadInitial` overwrites with
   its own page-1 — silently discarding the refresh result.
   Probability is low (refresh requires `authorsRef.current.length > 0`
   AND a visibility change AND races with a mount), but plausible on
   slow networks. Fix: have `refresh` no-op while `isLoading` is true,
   or merge refresh's incoming events into `loadInitial`'s hydrated
   page using the same id-dedupe.

6. **`FeedActor` typed as required but wire shape isn't validated.**
   `src/lib/atproto/follower-events.ts:153, 209-216`. The
   `FollowerEventsResponse.node.actor` field is declared `FeedActor`
   (non-null) and the loop at 208-217 pushes `edge.node.actor`
   directly into the result without a null-check. The spec defines
   `Issuer!` (non-null), so this matches the contract — but every
   other reader in this PR is defensive ("indexer may return partial
   data, so we guard each branch carefully" — `indexer.ts:62-71`).
   Inconsistent with the codebase's defensive-by-default boundary
   posture; a malformed `followerEvents` response with `actor: null`
   would push `actor: null` and crash `FeedEventCard` at
   `event.actor.did`.

7. **Polling effect re-keys on `hasAuthors` (boolean) but uses
   `authorsRef.current` for the actual refresh.** Same file, line
   213-250. When the authors LIST changes but the count stays > 0,
   the polling effect doesn't tear down — the interval keeps firing
   refreshes against the latest `authorsRef`. That's intended. But
   combined with issue #2 above (no signal threading), an in-flight
   refresh from BEFORE the authors change will commit after the new
   authors take effect, polluting state. The polling effect's stability
   makes this race more likely than for `loadMore`.

8. **`HydrateFeedPage` schema-probe was not run.**
   `docs/follower-events-feed/implementation.md:38-50`. The plan
   (`plan-v2.md:158-162`) called this out as mandatory before merging
   track 1. Implementation log acknowledges the skip and proposes
   downgrading to a per-collection fan-out if any of the four
   connections rejects `where: { uri: { in: [...] } }`. Without the
   probe, a green CI doesn't mean the feed renders correctly in
   prod — first user hits the indexer's "unknown argument 'uri'"
   error and gets fallback "did something" cards for every event of
   that kind. Per implementation.md the mitigation is "someone with
   credentials runs the probe via the dev console" pre-merge; this
   should be treated as a blocker for the staging → main PR, not for
   the feature branch → staging PR.

### Low — defensive / nice-to-have

9. **`collection.create` body's `value.type` defaulting silently
   mislabels untyped collections as "project".**
   `src/components/feed/feed-event-card.tsx:193-199` and
   `src/lib/atproto/indexer.ts:747-748`. `nodeToCollectionRecord`
   hard-codes `type: "project"` into the synthesised value; the
   hydrator overrides only if `edge.node.type` is truthy. A collection
   record that didn't ship a type field (legacy or buggy) will appear
   in the feed as "created a project" even when it's actually a list
   or portfolio. Not introduced by this PR but newly visible because
   the home feed surfaces these.

10. **`hydrateFeedEvents` doesn't pass through the `signal` to the
    bucketing short-circuit.** `src/lib/atproto/follower-events.ts:339-343`.
    The "every event is unknown" early-return path is synchronous, so
    the signal can't have aborted yet. Fine. The actual fetch (line
    345-358) does pass `signal`. OK.

11. **`fetchFollowerEvents` on `authors: []` hits the network with
    `authors: []` rather than short-circuiting.**
    `src/lib/atproto/follower-events.ts:162-180`. The spec is clear
    that empty authors returns an empty connection, but signed-out
    viewers (handled by `HomeFeed` chrome anyway) and "no follows"
    viewers will pay one round-trip per (re)render of the initial-load
    effect. `loadMore` and `refresh` short-circuit at
    `authors.length === 0`; `loadInitial` doesn't. Cheap to add.

12. **`isLoading: true` initial state can flash skeletons even when
    `authors` resolves to `[]` immediately.**
    `src/hooks/use-home-feed.ts:79`. `useState(true)` for `isLoading`
    plus the initial-load effect firing always means the
    "signed-in + 0 authors" state briefly shows the loading skeleton
    before resolving. The mod-flicker isn't broken behaviour but
    interacts badly with issue #1 above.

## Confirmations

- **Operational constraint `MaxAuthorsFilterSize = 500` enforced both
  client-side (computeHomeFeedAuthors slices at 500) and server-side
  (readAuthorList returns null on length > 500). Defence-in-depth as
  the plan called for.**
- **Operational constraint `MaxFeedPageSize = 50` enforced via
  `clampFirst(value, MAX_FEED_PAGE_SIZE = 50, 20)` in
  route.ts:927. Test pins clamp behaviour at first=999 → 50.**
- **Operational constraint "polling cadence 30 s foreground / 5 min
  background" matches `FOREGROUND_POLL_MS = 30_000` /
  `BACKGROUND_POLL_MS = 5 * 60_000` in follower-events.ts:50-52, used
  via `document.visibilityState` switching in use-home-feed.ts:220-242.**
- **Operational constraint "no parallel `followerEvents` requests":
  `loadMore` guards via `isLoadingMoreRef` (use-home-feed.ts:145);
  initial-load and refresh aren't strictly serialised but the dedupe
  by event.id prevents user-visible duplication.**
- **Coded error `AUTHORS_REQUIRED` mapped to `FollowerEventsError.code`
  via `parseErrorCode` in follower-events.ts:121-124. Defensive — the
  proxy rejects first.**
- **Coded error `AUTHORS_FILTER_TOO_LARGE` mapped + surfaced via
  `errorCode` from `useHomeFeed` for HomeFeed's specific copy at
  home-feed.tsx:88-93. Test pins this at use-home-feed.test.ts:158-171.**
- **Coded error `INVALID_CURSOR` mapped via the same path. Test pins
  it in follower-events.test.ts:104-113.**
- **Deliberate v1 limitation "every `badge.award` produces `kind =
  badge.award`": confirmed — the dispatch in feed-event-card.tsx:98-108
  doesn't branch on definition type, just renders "awarded a badge to
  subject" uniformly. Matches review-decisions S7 rejection.**
- **Deliberate v1 limitation "no `payload` field on wire": confirmed —
  `FeedEvent` carries only id/kind/subjectUri/sortAt/actor; the client
  builds its own `HydratedPayload` synthetically via the second-pass
  hydration query.**
- **Deliberate v1 limitation "no subscription, polled": confirmed —
  no WebSocket / EventSource in the implementation; polling effect at
  use-home-feed.ts:214-250.**
- **Empty `authors: []` semantic preserved end-to-end: route
  `readAuthorList` returns `[]` for length 0 (not null/error), proxy
  forwards `authors: []` to upstream, `fetchFollowerEvents` sends
  `authors: []` and parses the empty connection back as an empty page.
  Test pins each step at route.test.ts:414-422 and
  follower-events.test.ts:83-90.**
- **Unknown-kind dispatch falls through to `UnknownKindBody`: confirmed
  at feed-event-card.tsx:91-121 — the `if/if/if/if` chain returns
  `UnknownKindBody` on any non-payload-matching kind. Test at
  feed-event-card.test.tsx:131-141 pins it.**
- **Hydration nil handling (`payload: null` → UnknownKindBody fallback):
  confirmed at feed-event-card.tsx:91-121 — same dispatch chain; null
  payload means none of the `payload?.kind === "..."` branches match,
  falls through to UnknownKindBody. Test at feed-event-card.test.tsx:143-150.**
- **Author-union dedupe-before-cap: `computeHomeFeedAuthors` builds the
  union Set first (use-home-feed-authors.ts:19-22) and slices to 500
  after. Test at use-home-feed-authors.test.ts:78-89 pins this with
  the 300+300/50-overlap=550-cap=500 case.**
- **`AbortController` plumbing for initial load: the effect at
  use-home-feed.ts:138-142 creates a fresh controller per filterKey
  change, calls `controller.abort()` on cleanup. `loadInitial` checks
  `signal?.aborted` between the two awaits at lines 115 and 117 and in
  the catch and finally. Correctly tears down in-flight fetches /
  hydrations on key change.**
- **`loadMore` dedupe by event.id: confirmed at use-home-feed.ts:158-164.
  Reads `prev` via setEvents-callback (race-safe), filters incoming
  by `!seen.has(h.event.id)`. Test at use-home-feed.test.ts:94-125
  pins overlap-then-no-duplicate behaviour.**
- **`refresh` merge by event.id: confirmed at use-home-feed.ts:188-196,
  symmetric pattern (filter incoming by existingIds, no-op if nothing
  new). Test at use-home-feed.test.ts:127-156 pins prepend-keeping-position.**
- **`useBlueskyFollows.truncated` cap-detection: confirmed at
  use-bluesky-follows.ts:68-75 — `truncated = true` ONLY when
  `followedDids.size >= MAX_FOLLOWS && cursor`. The cursor check is
  load-bearing as the inline comment notes (a viewer with exactly 10k
  follows wouldn't be falsely flagged).**
- **`HydrateFeedPage` defensive proxy validation: `readUriList` caps at
  50 entries per kind (route.ts:790-800), rejects non-string entries,
  caps per-entry length at MAX_URI_LEN=512. Empty arrays pass through.
  Tests pin all three at route.test.ts:496-553.**
- **Hydration kind-bucketing preserves input order: confirmed at
  follower-events.ts:414-417 — final return is `events.map(...)`,
  iterating the original input, looking up payload by subjectUri.
  Test at follower-events.test.ts:175-258.**
- **Proxy MAX_BODY_SIZE bump from 16KB → 32KB: route.ts:53. Worst-case
  hydration body is ≤ 20KB (4 × 50 × ~100 chars), fits comfortably.**
