# Spec review — plan v1 vs issue #88

Audits `plan.md` against issue #88. Terse; anchors are `issue §...` /
`plan §...`.

## Misses / corrections

- **`MAX_AUTHORS_FILTER_SIZE` enforcement happens only in the author-union
  hook, not in the proxy.** Plan §"Server proxy ops → FollowerEvents" says
  `authors` is validated by `readDidList(MAX_DID_LIST)` capped at 1000, with
  the comment that "server's own 500 cap is the load-bearing one." Issue
  §"Operational constraints" puts the 500 cap at the server boundary and
  expects the client to truncate before sending — but the proxy is part of
  *our* client surface. A bug in `useHomeFeedAuthors` (or a future caller
  that bypasses it) can send 501–1000 DIDs through the proxy and only fail
  at the upstream. Add an explicit proxy-side reject at
  `MAX_AUTHORS_FILTER_SIZE` so the contract is enforced in one place. The
  1000-DID `MAX_DID_LIST` ceiling is the wrong number here.

- **`MAX_FEED_PAGE_SIZE` "clamp" silently rewrites the caller's intent.**
  Plan §"FollowerEvents → buildVariables" says `first` is clamped to 50.
  Issue §"Operational constraints" frames 50 as a hard cap. Clamping
  hides a client bug (caller asking for 100 silently gets 50 and may
  expect-but-not-get the extra rows). Prefer reject (400) at the proxy,
  matching the existing `readDidList` reject-when-over-cap pattern. At
  minimum the plan should call out the clamp-vs-reject decision; right now
  it's drive-by.

- **`kinds` validation is over-strict relative to the spec.** Plan caps the
  list at 16 entries × 64 chars. Issue §"What you get" says "unknown kinds
  silently ignored" — there's no documented per-request cap. 16 is plausibly
  fine in practice (4 documented kinds + headroom) but it's a made-up
  number; either drop the cap or justify it in the plan. The 64-char
  per-entry cap is also unbacked.

- **Hydration aliasing semantics are slightly off.** Plan §"Hydration"
  says "single GraphQL request with one aliased query per event, each
  branching by `event.kind` to the matching `*ByUri` op." Issue §
  "Recommended query shape" shows the Hydrate query with **one alias per
  visible event whose kind matches that collection** — i.e. unknown kinds
  contribute no alias, and the alias name encodes the index/uri so the
  client can map results back. Plan should explicitly call out the alias
  naming scheme (e.g. `e0`, `e1`, …) and confirm unknown-kind events are
  excluded from the hydrate query entirely. Today the wording could be
  read either way.

- **Unknown-kind contract — render path is right, but `subjectUri`
  hydration is dropped on the floor.** Issue §"Documented kinds → Unknown-
  kind contract" says render "actor + subjectUri link rather than dropping
  the event silently." Plan §"Generic fallback" does render the event, but
  hydration returns `payload: null` and the card shows the raw at:// URI.
  That matches the spec literally. Note for the implementer: do NOT
  attempt to guess the lexicon from the URI and hydrate against an
  arbitrary `*ByUri` op — the spec explicitly accepts the raw-URI render.
  (Confirmation, not a miss — flagging so a reviewer doesn't push back.)

- **`refresh()` cursor-reset behaviour conflicts with cursor-stability
  guarantee.** Plan §"Feed hook → refresh" says refresh "re-fetches page 1,
  replacing the current list (does NOT reset pagination cursors; callers
  needing a full reset reload from the top)." Then plan §"Risks → Cursor
  stability across polls" contradicts: "`refresh()` re-fetches page 1, so a
  paginated user's `loadMore` history is reset on every poll." Pick one.
  Issue §"Cursor stability" says cursors are opaque and refresh-from-cursor
  is idempotent — the natural read is that polling should *prepend* new
  events above the existing list, not throw it away. Plan should either
  spec that semantic, or explicitly accept the "blow away pagination on
  every poll" UX as a v1 trade-off (and remove the contradictory
  "replacing the current list … does NOT reset pagination cursors"
  language).

- **`AUTHORS_REQUIRED` is unreachable as specced and the plan never says
  so.** Issue §"Coded errors" lists `AUTHORS_REQUIRED` for "`authors` arg
  omitted." Plan §"FollowerEvents → buildVariables" requires `authors` at
  the proxy, so the upstream can never see an omitted arg from us. Plan
  §"Tests → follower-events.test.ts" says "Each coded error: maps
  `extensions.code` to `FollowerEventsError.code`" — fine for unit tests
  with mocked GraphQL, but the plan should note that production traffic
  will only ever see `AUTHORS_FILTER_TOO_LARGE` / `INVALID_CURSOR` from
  upstream, so the `AUTHORS_REQUIRED` branch is defensive only.

- **Open question #2 (ranking) is answered without addressing the issue's
  recommendation.** Issue §"Open questions" recommends "most-recently-
  endorsed / most-recently-interacted-with, falling back to alphabetical."
  Discovery picks plain alphabetical-by-DID with the rationale "needs a
  last-interacted signal we don't have client-side today." Plan §"Author-
  union hook" repeats this. The signal *is* partially available — Certified
  `app.certified.graph.follow` records have a `createdAt`, and so do badge
  awards a viewer authored — but the plan never considers them. Either
  acknowledge the option and reject it explicitly with a one-line reason,
  or upgrade to "rank by `follow.createdAt` desc, then alphabetical." As
  written this is a silent demotion from the issue's recommendation.

- **`badge.award` vs endorsement-typed-award distinction not surfaced in
  the plan.** Issue §"Deliberate v1 limitations → No badge.award →
  endorsement.award subtype" instructs callers to fetch
  `badge.definition.badgeType` if they need to distinguish endorsement-
  typed awards. Plan §"*ByUri hydration ops → AppCertifiedBadgeAwardByUri"
  selects `{ subject { did }, note, createdAt }` only — no `badgeType` and
  no follow-up `badge.definition` hydration. Plan §"Render → badge.award"
  unconditionally routes to `EndorsementRow`, which is correct *only if*
  every `badge.award` is endorsement-typed. If non-endorsement badges
  start landing, they'll render as endorsements. Either confirm in the
  plan that today all `badge.award` records are endorsements (and add a
  TODO for when that changes), or pull `badgeType` through the hydration
  + branch in the renderer.

- **Polling-pause condition under-specced.** Issue §"Operational
  constraints" frames the cadences as load-planning assumptions. Plan §
  "Feed hook → Polling" pauses when `authors` is empty. Should also pause
  when the tab/document is in the background `hidden` state for >5min
  consecutive (i.e. drop to BACKGROUND cadence is in the plan, but a
  truly idle backgrounded tab shouldn't poll forever) — or at least state
  that BACKGROUND cadence runs indefinitely as a deliberate choice.

## Confirmations

- **`MaxAuthorsFilterSize = 500`** — constant exported, author hook
  truncates (plan §"Client module" + §"Author-union hook").
- **`MaxFeedPageSize = 50` + default 20** — constants present, default
  matches issue's recommended query shape (plan §"Client module").
- **Polling cadences 30s / 5min, visibility-aware** — plan §"Feed hook →
  Polling" mirrors `notifications-context.tsx` pattern, cadences match
  issue exactly.
- **Empty `authors: []` returns empty connection, not error** — explicitly
  preserved in proxy and fetcher (plan §"FollowerEvents → buildVariables"
  + §"Client module → Behaviour").
- **`INVALID_CURSOR` mapping** — covered via the generic `extensions.code`
  → `FollowerEventsError` mapping (plan §"Client module").
- **`AUTHORS_FILTER_TOO_LARGE` mapping + UI surfacing** — typed error on
  hook return + truncation-warning UI path (plan §"Feed hook" +
  §"Render → home-feed").
- **Unknown-kind contract — fallback render shipped in v1** — answers
  open question #3 in the affirmative as the issue recommends (plan §
  "Generic fallback" + §"Render → dispatch").
- **No update events / no subscriptions / no payload field** — out-of-
  scope list is explicit and matches issue §"Deliberate v1 limitations"
  (plan §"Scope" + §"Out of scope" via discovery).
- **Migration path — build `use-home-feed.ts` directly against
  `followerEvents`, no detour through the three-op fan-out** — plan §
  "File ownership" creates the file fresh and never touches the legacy
  hooks (plan §"Untouched").
- **Cursor opacity preserved** — proxy treats `after` as
  `readString(MAX_AFTER_LEN)`, fetcher passes through unchanged, no
  decode attempts (plan §"FollowerEvents → buildVariables" + §"Client
  module").
- **Follow-set source of truth answer** — `useBlueskyFollows ∪
  useFollowing` via new `useHomeFeedAuthors`, reuses existing module-level
  caches; answers open question #1 (plan §"Author-union hook"; discovery
  §"Decisions on open questions").
- **Hydration is GraphQL-aliased, not XRPC fanout** — matches issue's
  recommended shape; rationale documented in discovery (plan §
  "Hydration"; discovery §"Hydration path").
