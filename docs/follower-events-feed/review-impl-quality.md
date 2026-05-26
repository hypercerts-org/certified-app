# Review — implementation code quality & codebase fit

Lens: "is this code we'd be happy maintaining six months from now?"
Scope: the diff `feat/positioning-redesign..HEAD` (issue #88 follower-events feed).

## Issues

### 1. New CSS references undefined design tokens (visual bug)

`src/app/styles/feed.css` introduces six rules under the issue #88 section
that use tokens that **do not exist** in `tokens.css`:

- `var(--fg-default)` at lines 2278, 2293, 2312
- `var(--bg-subtle)` at lines 2289, 2308, 2326

There is already a documented note about this in `src/app/styles/explore.css:433-436`:

> `--bg-subtle` doesn't exist in the token set; fell through to no background.
> Use `--bg-sunken` for a clearly-visible hover wash …

So this is a known footgun in the codebase that this PR repeats. The
`.feed__warning`, `.feed__hint`, `.feed-card__note`, and
`.feed-card__action-subject` rules will render with transparent backgrounds
and inherited text colour in production — `getComputedStyle` on the warning
banner won't pick up the intended muted-grey background; it just gets
`transparent`. Visually the truncation banner will be a borderline-invisible
strip.

Replace with the existing token set (likely `--bg-sunken` /
`--overlay-weak` for backgrounds and `--fg-primary` for default text).

### 2. `HomeFeed` empty-state branching doesn't match the plan

`plan-v2.md` (lines 434-441) specifies three discrete empty states:

1. signed-out
2. signed-in + **0 authors** → "Follow people to see their activity here."
3. signed-in + authors but 0 events → "No activity from your follows yet."

The current `HomeFeed` implementation (`src/components/feed/home-feed.tsx:100-130`)
collapses cases (2) and (3) into one branch: it renders the generic
"No activity yet" `EmptyState` **and** the `NoFollowsHint` block back-to-back
whenever `events.length === 0`. The user gets both messages stacked, which
reads as redundant and contradicts the plan's three-variant design.

Root cause: `UseHomeFeedResult` doesn't expose `authors.length` (or a
derived `hasFollows` boolean). Without that signal `HomeFeed` cannot
distinguish "no follows" from "no activity yet". Either:
- add a `hasFollows: boolean` to `UseHomeFeedResult` and branch on it, or
- expose `authorsCount: number`, or
- pull `useHomeFeedAuthors` directly inside `HomeFeed`.

### 3. `actor.pds` is fetched and propagated but never consumed

`FeedActor.pds` is part of the GraphQL selection (`route.ts:560`), the wire
type (`follower-events.ts:78`), and rides on every event through `useHomeFeed`
to `FeedEventCard`. Nothing reads it — the avatar URL is built via the
same-origin `/api/xrpc/com/atproto/sync/getBlob` route by
`buildAvatarUrlFromCid`, which only needs `did + cid`. Dead field on the
hot path (up to 50 rows/page, polled every 30s).

Either drop `pds` from the query + type, or document why it's preselected
for forward-compat.

### 4. `SubjectActionBody` accepts `event` as a required prop but never reads it

`feed-event-card.tsx:237-249`:

```tsx
function SubjectActionBody({
  event: _event,
  subjectDid,
  …
}: {
  event: FeedEvent
  …
})
```

The `_event` rename signals "intentionally unused" but the prop is still
required by the type and passed by both `badge.award` and
`legacy.endorsement` call sites. Drop `event` from the interface and from
the two callers, or use it (e.g. for an `aria-label` mentioning the
actor).

### 5. `hasMore` toggled off on `loadMore` errors silently kills pagination

`use-home-feed.ts:170-172`:

```ts
} catch (err) {
  console.warn("[useHomeFeed] loadMore failed:", err)
  setHasMore(false)
}
```

Same pattern as `use-global-feed.ts:194` — codebase consistent, so not a
blocker — but `useGlobalFeed` documents the "stop offering pagination on
error" intent in a comment. The home-feed copy of the pattern just has
"Loading-more errors stop pagination but don't replace the existing list"
which doesn't explain *why* (transient cursor errors are unlikely to
recover on retry). Worth one-line follow-up so the next reader doesn't
revert it to a retryable state.

### 6. Inconsistent error class between `fetchFollowerEvents` and `hydrateFeedEvents`

- `fetchFollowerEvents` non-OK HTTP → throws `FollowerEventsError(msg, null)` (`follower-events.ts:182`).
- `hydrateFeedEvents` non-OK HTTP → throws plain `Error` (`follower-events.ts:361`).

The hook (`use-home-feed.ts:121-128`) only `instanceof`-narrows
`FollowerEventsError` to set `errorCode`, so hydration failures land in the
"generic message" path. That's the documented intent in the plan, but the
plain-`Error` throw means the hook's catch doesn't even know it's a
hydration failure vs a network failure. Consider throwing a tagged
`HydrationError` (or reusing `FollowerEventsError` with `code: null` to
keep both fetchers' surfaces uniform).

### 7. `MAX_BODY_SIZE` bump from 16 KB → 32 KB applies to **all** indexer
operations

`route.ts:51`:

```ts
// 32KB — operationName + variables. The 16KB original was too tight for
// HydrateFeedPage, which sends up to 50 at:// URIs per kind × 4 kinds.
const MAX_BODY_SIZE = 32 * 1024
```

The widened cap loosens the request-size guard on every existing op
(`Activities`, `Projects`, `EndorsementClosure`, …), not just
`HydrateFeedPage`. Acceptable in practice — 32 KB is still a tiny payload
budget — but the comment understates the blast radius. Either tighten the
guard per-op (largest, scariest change) or leave a 1-liner noting that the
bump is intentional cross-op.

### 8. Dead code: `HomeClient` is now orphaned

`src/components/landing/home-client.tsx` was the previous `/feed` body. The
new `feed/page.tsx` imports `feed-page-client` directly; nothing else in
`src/` references `home-client.tsx` or the `HomeClient` symbol. Either
delete it (clean) or note in `06-deferred.md` that the legacy redirector
will be removed in a follow-up.

### 9. `useBlueskyFollows` truncated-flag has no test coverage

Plan v2 (`Track 3`) said: "`src/hooks/__tests__/use-bluesky-follows.test.ts`
(add cases or new file)". No test file for this hook exists before or after
the change. The new field is small and the pure-state path is exercised
indirectly by `use-home-feed-authors.test.ts` via `truncatedBySource`
boolean unions, but the load-bearing detail (`size >= MAX_FOLLOWS && cursor`
check at `use-bluesky-follows.ts:72`) is unverified. Existing codebase has
no test for either follow-list hook, so this is "consistent neglect" rather
than a regression — but the plan committed to it.

### 10. Polling cadence / visibility handling untested

`implementation.md:79-83` explicitly defers this (`fake-timer + React-effect
interaction is brittle`). Fair — but polling is one of the load-bearing
features of the hook and `useEffect` errors here (visibility-change
listeners not torn down, interval drift on cadence flip, double-start when
both `start()` and `handleVisibility()` fire) are exactly the kind of bugs
that pass eye review and break in production. Even one unit test asserting
"interval is cleared when authors becomes empty" would be worth carrying.

### 11. `nodeToCollectionRecord` hardcodes `type: "project"`; hydration
overrides only when truthy

`indexer.ts:748` builds the record with `type: "project"` baked in. The new
follower-events hydration at `follower-events.ts:388` overrides via
`if (edge.node.type) record.value.type = edge.node.type`. If the indexer
ever returns `type: ""` (empty string) or `type: null` for a hydrated
collection, the record silently becomes `"project"` — wrong for
endorsement-lists and portfolios.

Either thread the optional `type` directly into `nodeToCollectionRecord`
(the cleanest path now that it's exported), or change the override to
`if (edge.node.type !== undefined)` to handle the empty-string case
explicitly.

### 12. `feed/page.tsx` metadata copy is stale

```ts
description: "Activity feed on Certified — for-you and following."
```

The new feed doesn't have for-you / following tabs. Trivial copy nit; while
the page is being rewired anyway it's free to update.

### 13. CSS noise: `.feed-card__time--inline` duplicates base rules

`feed.css:2255-2260` redeclares `font-size: 0.75rem` and
`color: var(--fg-muted)` already present on the base `.feed-card__time`
(line 541). The `--inline` modifier should only add `white-space: nowrap`
and `flex-shrink: 0`. Minor — but it gets harder to evolve the base later.

### 14. `parseActivityUri` used where `activityDetailHrefFromUri` exists

`feed-event-card.tsx:138-139`:

```tsx
const parsed = parseActivityUri(record.uri)
const detailHref = parsed ? activityDetailHref(parsed.did, parsed.rkey) : null
```

`activity-uri.ts:35-39` already exports `activityDetailHrefFromUri(uri)`
which does this same two-step *and* validates that the collection is
`org.hypercerts.claim.activity`. The new code skips that validation, which
isn't load-bearing on `cert.create` events but inconsistent with the
codebase's preferred helper.

### 15. CSS rule scoping — generic `.feed__warning` / `.feed__hint`

The new top-level selectors (`.feed__warning`, `.feed__hint`,
`.feed__sentinel`) live under `.feed` so they don't strictly collide with
anything else, but the names are generic enough that another feed surface
adding its own warning would clash. Existing rules in the file are mostly
`.feed-card__*` and `.feed-tabs__*` — i.e. BEM with a block prefix. The
new ones drop the block prefix. Consider `.home-feed__warning` /
`.home-feed__hint` to keep BEM consistent and the surface scoped.

## Confirmations

These were checked against the plan / decisions doc and existing
conventions and look right:

- **Hook return shape** — `useHomeFeed`'s `{ events, isLoading,
  isLoadingMore, error, hasMore, loadMore, … }` mirrors `useGlobalFeed`'s
  surface; primitives like `errorCode` and `truncatedBySource` are added
  cleanly without reshaping existing fields.
- **Primitive-key effect pattern** — `filterKey = authorsKey|kindsKey`
  drives the initial-load effect exactly the way `use-global-feed.ts:108`
  does it.
- **`useRef` snapshot of refresh** — matches the pattern in
  `notifications-context.tsx:75-107` and `use-global-feed.ts:56-57`.
- **Mapper extraction** — `nodeToActivityRecord` and
  `nodeToCollectionRecord` exported with no behavioural change. The new
  hydration code uses them straight; no duplication.
- **`useBlueskyFollows` truncated flag** — backward-compatible change.
  `useSocialGraphSync` (the only other consumer) destructures
  `followedDids, isLoading, error` and is unaffected.
- **Authors validation in the proxy** — `readAuthorList` correctly
  enforces 0..500 inclusive, fail-soft on per-entry non-DIDs to match
  `readDidList`. Tests cover the boundary.
- **`HydrateFeedPage` arg validation** — per-list cap of 50,
  string-only entries, empty arrays pass through. Tests cover each
  failure path.
- **`AbortController` discipline** — `loadInitial` aborts on filter-key
  change; existing patterns in `useGlobalFeed` / `useProfile` use the
  same shape.
- **`KNOWN_FEED_EVENT_KINDS` as const tuple** — matches review-decision
  R11; wire type stays open string for forward-compat.
- **`FollowerEventsError` typed code** — `code: FollowerEventsErrorCode
  | null` matches existing `EndorsementClosureError` shape in
  `indexer.ts:430-438`.
- **No new dependencies** — package.json untouched; all icons reuse
  existing `lucide-react`; only four icons imported in the new
  `feed-event-card.tsx`, all tree-shakable.
- **Comments are mostly "why, not what"** — block headers in
  `follower-events.ts` and `use-home-feed.ts` explain *intent* (why
  refresh doesn't reset the cursor, why polling cadence flips, why
  `pds` was originally selected) rather than restating code. Minor
  exceptions are the `// cert.create` / `// collection.create` section
  dividers in `feed-event-card.tsx`, but those are organisational
  rather than narrative.
- **No `as any` / unsafe casts** — only narrow `as` casts at the
  hydration mapper boundary (`value.banner as
  Parameters<typeof resolveActivityImageUrl>[0]` in
  `feed-event-card.tsx:203`) and inside `parseErrorCode` (`as
  FollowerEventsErrorCode` after `KNOWN_ERROR_CODES.has` check, which is
  a sound narrowing).
- **Hook tests cover the load-bearing surface** — initial load,
  loadMore dedupe, refresh merge-by-id, and `errorCode` mapping all
  have explicit tests; `computeHomeFeedAuthors` has thorough boundary
  coverage; `FeedEventCard` has a render test per kind plus
  unknown-kind fallback.
