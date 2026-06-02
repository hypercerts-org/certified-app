# Build review — plan v1, types/data-flow/runtime

Lens: TypeScript build, module-boundary types, hook data-flow,
runtime issues that surface during Phase 4 implementation. Read
`plan.md` and `discovery.md` first; this review only flags items
that would break a build or fire at runtime.

The single biggest risk is **#R1 (hydration architecture)** — the
plan's GraphQL hydration via aliases is incompatible with the
proxy as it stands today. Everything else is a smaller fix.

---

## Risks / corrections

### R1. Multi-aliased `*ByUri` hydration is incompatible with the proxy as designed [BLOCKING]

The proxy at `src/app/api/indexer/route.ts:99-504` holds query
strings server-side; the client only sends `operationName` +
`variables`. The route looks the query up by name
(`route.ts:739`) and forwards `{query, variables, operationName}`
to upstream (`route.ts:767`). The client cannot push its own
query string through.

Plan §"Hydration" (`plan.md:186-189`) calls for a single GraphQL
request with **one aliased query per event**:

> Implementation: single GraphQL request with one aliased query
> per event, each branching by `event.kind` to the matching
> `*ByUri` op.

For a 20-event page that means a query like:
```graphql
query Hydrate($u0: String!, $u1: String!, ..., $u19: String!) {
  a0: orgHypercertsClaimActivityByUri(uri: $u0) { ... }
  a1: orgHypercertsCollectionByUri(uri: $u1) { ... }
  ...
}
```
Per-event alias name + per-event field selection (the `*ByUri`
operation varies by `event.kind`) → the query string is
dynamic in both *shape* and *variable count*. The proxy holds
fixed query strings; you cannot register one entry in
`OPERATIONS` that covers every combination of (page size, kinds
distribution) the client might encounter on a given page.

The plan's `## Server proxy ops` section (`plan.md:50-105`)
registers four separate `*ByUri` ops (`OrgHypercertsClaimActivityByUri`
etc.), each taking a single `uri: String!`. That shape forces one
HTTP request per event, which contradicts the plan's own claim
in `discovery.md:106` that this approach delivers "Single HTTP
request per page (vs N PDS round-trips)."

Three viable resolutions, pick one before Phase 4 starts:

1. **Drop the aliasing aspiration.** Issue one
   `operationName: "<KindByUri>"` request per visible event,
   `Promise.all` them. ~20 small same-origin POSTs per page. Fine
   for v1; loses the "single round-trip" claim but the proxy
   doesn't change.
2. **Server-side batching op.** Add a single `HydrateFeedPage`
   op whose query accepts `$activityUris: [String!]`,
   `$collectionUris: [String!]`, `$awardUris: [String!]`,
   `$legacyUris: [String!]` and returns four parallel
   `*ByUris(uris: [String!])` connections. Requires the
   indexer to expose a `*ByUris` plural form — verify against
   schema, document the dependency. This is the architecturally
   clean answer.
3. **Loosen the proxy's "queries are server-only" invariant** —
   accept a client-supplied query for a narrow allowlist of
   operations. This breaks the load-bearing security comment at
   `route.ts:9-29` ("client sends `operationName` only") and
   should not happen without an explicit security review. Do not
   pick this without a separate discussion.

Until this is resolved, the "single batched GraphQL request" line
in `plan.md:106` and `discovery.md:106` is aspirational rather
than implementable.

### R2. `truncatedBySource` references a field that doesn't exist on `useBlueskyFollows`

`discovery.md:53-54` claims `useBlueskyFollows(did)` returns:
> `{ followedDids: Set<string>, isLoading, error, truncated? }`

The actual return at `src/hooks/use-bluesky-follows.ts:119` is:
```ts
return { followedDids, isLoading, error }
```
No `truncated` field. The hook does have an internal `MAX_FOLLOWS = 10_000`
guard (`use-bluesky-follows.ts:8, 26`) but it never surfaces
"hit the cap" upward.

Plan §"Author-union hook" (`plan.md:213`) wires:
```
truncatedBySource = blueskyTruncated || certifiedTruncated
```
That won't compile — `blueskyTruncated` doesn't exist on the
hook's return. Either:

- Add `truncated: boolean` to `useBlueskyFollows`'s return (the
  internal `fetchAllFollows` loop already has the signal at
  `use-bluesky-follows.ts:26` — set a `truncated` flag when the
  loop exits because `followedDids.size >= MAX_FOLLOWS`), or
- Drop the `truncatedBySource` field from
  `UseHomeFeedAuthorsResult` for v1 and only propagate the
  Certified hook's flag.

The first is the right move (set parity with `useFollowing`)
and is a 5-line change. The plan must say so explicitly,
otherwise the implementer hits the type error mid-track and
makes the choice ad-hoc.

### R3. Author array stability — passing `string[]` through `useEffect` deps

Plan §"Feed hook" (`plan.md:244-245`):
> Stable string key on `authors.join(",")` + `kinds.join(",")`
> drives the initial fetch effect (same primitive-key pattern as
> `useGlobalFeed`).

The primitive-key pattern works (precedent at
`use-global-feed.ts:102-108`), but the plan omits the **`useRef`
snapshot of the live array** that `useGlobalFeed` uses to
actually issue the fetch (`use-global-feed.ts:56-57, 150, 188`):

```ts
const endorsedDidsRef = useRef(endorsedDids)
endorsedDidsRef.current = endorsedDids
// ... and inside the fetch:
authors: endorsedDidsRef.current ? Array.from(...) : undefined,
```

Without that, the only options inside `loadInitial` are:

1. Pass `authors` directly → React lint demands `authors` in the
   dependency array → infinite-loop on every render (new array
   identity every render).
2. Re-derive `authors` from the string key by `key.split(",")`
   → loses ordering / identity invariants.

The implementer will trip on the ESLint `exhaustive-deps` rule
the way `useGlobalFeed` did (note the
`// eslint-disable-next-line` at `use-global-feed.ts:163, 199`).
Plan should explicitly say "mirror the
`endorsedDidsRef`/`combinedServerFilterKey` pattern from
`use-global-feed.ts:56-108`" and call out the eslint-disable as
load-bearing.

### R4. `refresh()` + `loadMore()` race — pagination state isn't protected

Plan §"Feed hook" (`plan.md:250-252`):
> `refresh` re-fetches page 1, replacing the current list (does
> NOT reset pagination cursors; callers needing a full reset
> reload from the top).

Scenario: user has paged to page 3 (cursor C2 → C3 in-flight),
polling tick fires and `refresh()` re-fetches page 1 (cursor
null). Both in flight. Outcomes:

- **Both resolve.** Plan says `refresh` "replac(es) the current
  list" and "does NOT reset pagination cursors". So `refresh`
  overwrites `events` to be page 1 of 20 results, then
  `loadMore` arrives with page 3 of 20 and appends → final
  state is `[page1, page3]` with page 2 missing. Cursor state
  is whatever the last write was, likely the page 3 cursor,
  meaning the next `loadMore` skips to page 4.

- **`refresh` cancels `loadMore`.** Cleaner, but plan doesn't
  say `refresh` aborts in-flight `loadMore`. The
  notifications-context precedent at
  `notifications-context.tsx:31-32` only has one abort ref —
  fine because notifications doesn't paginate.

The plan needs two abort controllers (one for the page-1 / poll
fetch, one for `loadMore`), AND a rule that `refresh` aborts the
loadMore (the user-visible page-3 state is lost on poll, but
that's the lesser evil — keeping it produces the missing-page-2
bug above). Mention the contract in the hook docblock and back
it with a test in `use-home-feed.test.ts`.

A simpler alternative: pause polling while `isLoadingMore` is
true. Cheaper to implement, no race. Pick one and write it down.

### R5. `ActivityRecord` synthesis from hydration payload — `did` must be on the wire

`ActivityCard` (`src/components/feed/activity-card.tsx:21`) takes:
```ts
{ record: ActivityRecord; did: string; label?: LabelValue }
```
The `did` is used at `activity-card.tsx:25` to resolve the
blob-ref image URL through the XRPC sync/getBlob proxy:
```ts
resolveActivityImageUrl(value.image, did)
```
For non-blob image variants (string or `{uri}`) `did` is
unused, but for blob-ref images on a foreign PDS the helper
builds `/api/xrpc/com/atproto/sync/getBlob?did=...&cid=...`
(`activity.ts:80-82`) and `did` is load-bearing — the proxy
needs it to find the right PDS via `resolvePdsUrl`.

Plan §"Render" (`plan.md:273-275`):
> `cert.create` + hydrated payload → `ActivityCard` (compose an
> `ActivityRecord` shape from the payload + event metadata).

The `FeedEvent.actor.did` (`plan.md:127`) is the *event actor*
(the follower whose activity this is). For `cert.create`, the
actor authored the cert, so `actor.did === record.did`. But the
plan's `*ByUri` selection
(`plan.md:93`) does NOT include `did` on the activity payload:
```
OrgHypercertsClaimActivityByUri(uri) → { title, shortDescription, image { ... } }
```
Two options:

- Trust `actor.did` and pass it as the `did` prop. Works when the
  actor === the cert author. Verify this invariant holds for
  every kind. For `badge.award` and `legacy.endorsement` the
  "did to use for the image proxy" is the badge issuer, not the
  endorsement subject, so the actor↔record-author identity
  needs to be confirmed per-kind.
- Add `did` to each `*ByUri` selection (mirror `Activities`
  query at `route.ts:69`, `Projects` at `route.ts:385`). Safer.

Pick option 2 — add `did` to every `*ByUri` selection — and
make it explicit in the plan. Cost is one extra string per row;
removes a class of subtle "broken avatar on foreign PDS" bugs.

Same concern applies to `ProjectListRow`: it derives `did` from
the URI at `project-list-row.tsx:31-32` (`parseAtUri(uri)`),
which is safe because every at:// URI carries the did. But
`ActivityCard` does NOT parse from URI — it takes `did` as a
separate prop. Composing the synthetic record at the dispatch
site is the right place; document which `did` to pass.

### R6. `ActivityRecord.value.image` shape mismatch

Existing client-side mapping `nodeToActivityRecord`
(`src/lib/atproto/indexer.ts:60-86`) reduces the indexer's typed
image union to one of two shapes:
```ts
{ uri: <string> } | { image: { ref: <cid-string> } }
```
i.e. the blob ref is **already extracted via `getBlobRefLink`**
when the path is the inner `image.ref` variant (see
`nodeToCollectionRecord` at `indexer.ts:720-736` which explicitly
calls `getBlobRefLink(node.banner.image.ref)`).

Plan §"`*ByUri` hydration ops" (`plan.md:93-94`) selects the
image as:
```
image { __typename, ...OrgHypercertsDefsUri.uri,
        ...OrgHypercertsDefsSmallImage.image { ref, mimeType } }
```
i.e. raw indexer typename + nested `image.ref` blob CID, which
arrives wrapped as `map[$link:<cid>]` (`indexer.ts:719`).

Whoever writes `hydrateFeedEvents` (`plan.md:181`) must
reproduce the same blob-ref unwrap as `nodeToActivityRecord` /
`nodeToCollectionRecord`. Plan doesn't say this explicitly. Add
to plan: "synthesised `ActivityRecord`/`CollectionRecord` shapes
must match `nodeToActivityRecord` / `nodeToCollectionRecord` in
`src/lib/atproto/indexer.ts` — extract the helper, do not
inline a new mapping." Extracting and reusing is the right
move; inlining will silently produce wrong image URLs for the
blob-ref path.

### R7. `EndorsementRow` doesn't accept `createdAt` from a hydrated subject — it'll re-fetch the actor

`EndorsementRow` (`src/components/endorsements/endorsement-row.tsx:33-40`)
internally calls `useAuthorInfo(subjectDid)` which hits
`/api/resolve-did` per row (cached via `createBoundedCache`,
`use-author-info.ts:22`).

That's fine for v1, but note: the plan says the actor profile
(`actor.handle/displayName/avatarCid`) is denormalised onto each
`FeedEvent` (`discovery.md:86-87`), which means we already have
the actor info on the wire — but `EndorsementRow` re-fetches it
because the *subject* is a different DID from the *actor*. The
issuer = actor (who awarded the badge); the subject = the
endorsed account. So this isn't a bug; it just means the page
load will fire ≤ N `/api/resolve-did` requests per page for
endorsement-typed events (subjects, not actors).

Document this in the plan so it doesn't surface as a "why is
the network panel full of resolve-did" question in review.

### R8. `useFollowing` returns `subjects`, not `followedDids` — naming drift in the plan

`discovery.md:56-58` says `useFollowing(did)` returns
`{ subjects: Set<string>, truncated, isLoading, ... }`. Correct
— see `use-following.ts:60, 190-194`.

Plan §"Author-union hook" pseudocode (`plan.md:208`):
```
union = new Set([...blueskyDids, ...certifiedSubjects]).
```
Uses `certifiedSubjects` — but the variable would presumably be
destructured `const { subjects: certifiedSubjects, ... } = useFollowing(did)`.
That's fine, just a rename. Worth calling out: align variable
names in the actual file to `blueskyDids` /
`certifiedSubjects` so the union expression reads cleanly. Minor.

### R9. `Empty authors: []` — plan vs proxy `readDidList`

Plan §"FollowerEvents → buildVariables" (`plan.md:78-82`):
> `authors`: required. Reuse `readDidList(MAX_DID_LIST)` — caps
> at 1000 client-side... Empty array passes through to the
> upstream — server returns an empty connection (NOT an error).
> The proxy treats `[]` as valid.

But `readDidList` at `route.ts:525-543` explicitly rejects empty
arrays:
```ts
if (value.length === 0 || value.length > maxItems) return null
```
Returning `null` causes `buildVariables` to return `null`, which
causes the route to 400 (`route.ts:749-754`).

So the plan's statement "the proxy treats `[]` as valid" is
**false if the implementer reuses `readDidList`.** Either:

- Write a new reader `readDidListAllowEmpty()` that mirrors
  `readDidList` but allows `value.length === 0`, OR
- Use `readOptionalDidList` (`route.ts:545-558`) which already
  returns `[]` → `[]` and `undefined` → `undefined`.

`readOptionalDidList` is the natural fit. Plan should say so.
Note also that `readOptionalDidList` enforces `MAX_DID_LIST = 1000`
silently (`route.ts:550`); for `MAX_AUTHORS_FILTER_SIZE = 500`,
add a separate length check before calling it, OR add a new
`readBoundedDidList(maxItems, allowEmpty)` that takes both. (The
spec review already flags the 500-vs-1000 discrepancy at
`review-spec.md:8-18`; this is the implementation-side mirror.)

Edge case: when `authors === undefined` (caller didn't pass it),
`readOptionalDidList` returns `undefined`, but the upstream
`followerEvents` field requires `[String!]!` per the plan's
query at `plan.md:55`. Decide upfront whether the server-side
contract is "authors is required and may be empty" or "authors is
optional"; mismatch will produce a noisy GraphQL error rather
than the empty-page semantic the plan documents.

### R10. Polling cleanup contract — `refresh()` is captured by `useCallback` deps

The reference implementation at
`notifications-context.tsx:75-107` puts `refresh` in the effect's
dep array. `refresh` itself is `useCallback` over
`[authLoading, isAuthenticated, did]` — three primitives — so the
identity is stable across renders.

The new feed hook will have `refresh` depending on more:
`authors` (string or ref), `kinds` (string), the abort ref, etc.
If any of those is non-primitive in the dep array, `refresh`
identity changes per render → the polling effect tears down and
rebuilds the interval per render → polling effectively never
runs (or runs in a runaway tight loop).

Plan should explicitly call out: `refresh` must be
`useCallback`-stable across renders of identical primitive
state. Use the same `*Ref` snapshot pattern as `useGlobalFeed`
(`use-global-feed.ts:56-57`). Add a test
("`refresh` reference is stable when authors string-key is stable").

### R11. `FeedEventKind` open-union type is wider than the discriminated dispatch

Plan §"client module" (`plan.md:118-123`):
```ts
export type FeedEventKind =
  | "cert.create"
  | "collection.create"
  | "badge.award"
  | "legacy.endorsement"
  | string
```
The `| string` collapses the union to just `string` —
TypeScript widens once any member is `string`. That means:

- `switch (event.kind) { case "cert.create": ... }` has no
  exhaustiveness check; the compiler won't error if a new kind
  literal is added later and not handled.
- IDEs lose auto-completion for the literal members.

Standard fix: use a literal union for the *known* kinds and a
separate type that allows fallback:
```ts
export type KnownFeedEventKind =
  | "cert.create" | "collection.create"
  | "badge.award" | "legacy.endorsement"
export type FeedEventKind = KnownFeedEventKind | (string & {})
```
The `(string & {})` "branded string" trick preserves literal
auto-completion. Cite this in the plan.

### R12. `FollowerEventsError.code` typed as a nullable union is awkward at use sites

Plan §"client module" (`plan.md:147-150`):
```ts
export class FollowerEventsError extends Error {
  readonly code: "AUTHORS_REQUIRED" | "AUTHORS_FILTER_TOO_LARGE" | "INVALID_CURSOR" | null
}
```
Mirroring `EndorsementClosureError` (`indexer.ts:430-438`),
which uses `string | null`. The plan tightens to a literal
union — better — but then `errorCode: FollowerEventsError["code"] | null`
on the hook (`plan.md:230`) is `(... | null) | null`, redundant
but not wrong.

Concern: the upstream may emit additional `extensions.code` values
the plan hasn't enumerated (the issue lists three, but future
indexer revisions can add more). A future code arrives → it
hits `default: code = null` in the mapper → the type lies, the
consumer's `switch (code)` misses it silently.

Two fixes:

- Keep the literal union but log unknown codes (so they surface
  in console). Plan doesn't say this; add it.
- OR use `string | null` (like `EndorsementClosureError`) and
  document the *known* values in a JSDoc constant. Either is
  fine; pick one.

### R13. `LegacyEndorsements` precedent has `authors` required — `FollowerEvents` plan reuses same shape

The existing `LegacyEndorsements` op (`route.ts:454-473`) takes
`authors: [String!]!` and validates via `readDidList`
(`route.ts:669-677`) — i.e. required, non-empty, ≤ 1000. The
existing client (`indexer.ts:519`) short-circuits to `[]` when
authors is empty rather than calling the upstream.

This is the load-bearing precedent the plan invokes by
"the proxy treats `[]` as valid (preserves the load-bearing
nil/empty semantic from the records repo)" (`plan.md:81-82`).
But the precedent does the **opposite** — it rejects empty
arrays at the proxy and short-circuits at the fetcher. The plan
should follow the same pattern: short-circuit
`fetchFollowerEvents` when `options.authors.length === 0` and
return an empty page locally, NOT call the proxy with `[]`.

This sidesteps R9 (the proxy needn't accept `[]`) and matches
the existing pattern. Recommend: change the plan to short-circuit
at the fetcher; proxy keeps the non-empty `readDidList`
contract.

### R14. Hydration payload `null` semantic isn't typed correctly

Plan §"client module" (`plan.md:174-178`):
```ts
export interface HydratedFeedEvent {
  event: FeedEvent
  /** Per-kind hydrated payload; null when the by-URI lookup 404'd. */
  payload: HydratedActivity | HydratedCollection | HydratedBadgeAward | HydratedLegacyEndorsement | null
}
```
With `null` payload, the dispatch component (`plan.md:272-282`)
needs `payload` discriminated by `event.kind` to narrow safely.
TypeScript won't narrow across the two fields automatically:
```ts
if (event.kind === "cert.create" && payload) {
  // payload here is still the union, not HydratedActivity
}
```
You'll need a runtime type-guard per kind (e.g. discriminator
field on each `HydratedX` interface, or check
`"title" in payload`). Plan should specify the discriminator
shape — without it the dispatch component ends up with `as`
casts that the compiler can't verify.

A clean approach: each `HydratedX` carries a `kind` field that
matches the `FeedEventKind`, so:
```ts
interface HydratedActivity { kind: "cert.create"; ... }
interface HydratedCollection { kind: "collection.create"; ... }
```
Then `if (payload?.kind === event.kind)` narrows correctly.
Mention this in the plan.

### R15. `MAX_BODY_SIZE = 16KB` and the per-event-URI hydration request

Even with the single-request hydration architecture (if R1 is
resolved by adding a `HydrateFeedPage` op), the request body
carries up to 20 × URI strings + variable names. An at:// URI
runs roughly 60-100 bytes. 20 of those + JSON overhead +
operationName + variable wrappers fits comfortably under 16KB.
But the proxy enforces `MAX_BODY_SIZE` at `route.ts:710, 720`. If
the implementer picks resolution #2 (single batched op) and the
page size ever grows past 50 events with longer URIs, this
becomes a risk. Worth noting in plan as a forward-looking
constraint; not a v1 blocker.

### R16. Plan re-exports `INDEXER_PROXY_URL` from `indexer.ts` — currently NOT exported

`discovery.md:135-137`:
> re-export `INDEXER_PROXY_URL` from `indexer.ts` or duplicate the
> literal.

The constant at `indexer.ts:33` is declared `const INDEXER_PROXY_URL = "/api/indexer"` — NOT exported. So "re-export"
requires modifying `indexer.ts` (currently listed as untouched
in plan `plan.md:47`). Either:

- Add `export` to the `indexer.ts:33` declaration (1-line edit,
  outside the disjoint-ownership rule but trivial), OR
- Duplicate `"/api/indexer"` in `follower-events.ts` as the plan
  permits.

Recommend the duplicate — the literal is short, used in one
place per file, and keeps the file-ownership boundary clean. Plan
should pick one.

### R17. Tests around polling will be flaky without `vi.useFakeTimers()` discipline

Plan §"Tests" (`plan.md:333-340`):
> Polling: foreground interval triggers refresh on tick.
> Polling: visibility change to hidden switches to background cadence.

These need `vi.useFakeTimers()` + `vi.advanceTimersByTime(30_000)`
+ `document.visibilityState` stubbing. The notifications-context
test (search for an existing one) is the pattern to follow. Plan
doesn't mention the timer mocking discipline — implementer might
write real-time tests that pass locally then flake in CI. Add to
plan: "tests must use fake timers".

---

## Approved decisions

- **`useAuth().did` is real and correctly typed.**
  `AuthState.did: string | null` (`src/lib/auth/types.ts:7`), set
  from `/api/auth/session` (`auth-context.tsx:59-65`).
  `null`-guarding the feed when `did === null` is the right move.

- **Visibility-aware polling pattern is correctly identified.**
  The reference at `notifications-context.tsx:75-107` is the
  cleanest precedent; the plan's "two-cadence selector by
  `document.visibilityState`" is a faithful extension. Implementer
  should mirror the same teardown sequence
  (`stop()` + `removeEventListener` + abort) in the return
  cleanup.

- **`useGlobalFeed` is the right pattern reference for
  primitive-key effect deps.**
  `combinedServerFilterKey` at `use-global-feed.ts:102-108` is
  exactly the shape the new hook needs (modulo the issues in R3).

- **Endorsement-typed actor info is already on the wire.**
  `discovery.md:86-87` correctly notes the actor profile is
  denormalised onto every `FeedEvent` — saves the per-row
  `useAuthorInfo` for the actor. Only subject info (for
  endorsement kinds) still hits resolve-did, which is unavoidable
  without more server-side denormalisation.

- **Four-kind discriminated render with fallback** is correctly
  scoped and aligned with the existing
  `ActivityCard`/`ProjectListRow`/`EndorsementRow` props (modulo
  R5 `did` plumbing and R6 image-shape unwrapping).

- **Truncating the author union before sending** is correctly
  identified as the v1 way to satisfy the server-side 500 cap,
  and the alphabetical ranking is a defensible default (cheap,
  deterministic, no schema dep).

- **The hook's return shape mirrors the project's standard**
  (`data, isLoading, isLoadingMore, error, hasMore, loadMore,
  refresh`) — matches `useGlobalFeed`, `useFollowing`,
  `useReceivedEndorsements` per `discovery.md:121-122`. No new
  vocabulary.

- **The four-track commit cadence in `## Rollback`
  (`plan.md:389-394`)** is well-structured for revertability and
  fits the project's "direct to staging" convention.

- **File ownership partitioning (`plan.md:22-48`) is disjoint**
  modulo R16 if the implementer picks the re-export route.

---

## Summary

- **One blocker** (R1: hydration architecture incompatible with
  proxy). Decide between the three resolutions before Phase 4.
- **Three will-not-compile items** (R2: missing
  `truncated` on Bluesky hook; R9: `readDidList` rejects empty
  arrays; R11: open-union loses literal narrowing).
- **Four runtime correctness items** (R4: race; R5/R6: synthesised
  record shapes; R10: callback stability).
- **The rest are spec-tightening and developer-experience items**
  to flush before implementation, not after.

The plan is otherwise structurally sound; the data-flow choices
are right and the file-ownership boundaries are clean.
