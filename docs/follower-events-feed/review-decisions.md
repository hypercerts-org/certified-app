# Review round 1 — decisions

Three reviewers ran in parallel against `plan.md`. Their reports live in
`review-spec.md`, `review-build.md`, `review-integration.md`. This file
captures what was accepted, what was rejected, and why. `plan-v2.md`
supersedes `plan.md`.

## Accepted — incorporated into plan v2

### Architecture / spec
- **R1 (build, blocker): hydration cannot use per-event aliases.** The
  proxy holds query strings server-side keyed by `operationName` — the
  client cannot push a dynamic per-page query through. **Replace with a
  single pre-built `HydrateFeedPage` op** that uses `where: { uri: { in:
  $uris } }` filters across four aliased connections, one per lexicon.
  Caveat: `uri.in` on these connections is unproven; phase-4 manual probe
  verifies before commit. Fallback path is per-collection ops (four
  sequential calls) if `uri.in` isn't on the where input.
- **I1 (integration, blocker): mount point is wrong.** Confirmed
  `bottom-nav.tsx:36` routes "Feed" to `/feed`, not `/home`. Replace
  `/feed/page.tsx`'s `HomeClient` (a legacy redirector) with the new feed.
  `/home` stays alone — it's only reachable via `SiteDrawer` and isn't
  load-bearing.
- **I2/I3 (integration): mixed visual registers.** Discarding the "reuse
  three different components in one feed" approach. **Build one
  `FeedEventCard` with internal kind-dispatch** rendering a consistent
  feed-card chrome. The card body still composes from existing primitives
  (avatar, byline, title row, image), but the outer shell is shared and
  feed-shaped. Fallback (unknown-kind) becomes one branch of that
  component rather than a separate file.
- **I3 (integration): badge.award / legacy.endorsement need actor + subject.**
  `EndorsementRow` only renders the subject; the feed card variant
  renders "actor endorsed subject" with both byline rows.

### Validation / proxy
- **S1: proxy enforces 500, not 1000.** Add a dedicated
  `readAuthorListForFollowerEvents` reader that caps at
  `MAX_AUTHORS_FILTER_SIZE = 500` AND accepts empty arrays (R9 below).
  Defence-in-depth: client also pre-truncates to 500.
- **R9: empty `authors: []` must pass through.** Existing `readDidList`
  rejects length 0. New reader for the FollowerEvents op accepts
  length 0..500 inclusive.
- **S2: `first` clamping consistent with existing patterns.** Keep the
  silent clamp (existing `clampFirst(value, MAX_FEED_PAGE_SIZE = 50, 20)`
  pattern). Document in the route comment.
- **S3: `kinds` validation cap.** Keep defensive limits (length ≤ 16,
  each ≤ 64 chars). The cap numbers are conservative defaults consistent
  with the existing `readLabelList`; document them as "defensive, not
  spec-mandated".

### Hook contract
- **R2: `useBlueskyFollows` doesn't expose `truncated`.** Add it. Small
  in-scope change — the page-walk already detects the cap (`while
  followedDids.size < MAX_FOLLOWS`); just track whether the cap stopped
  the loop. This makes the contract symmetric with `useFollowing` and
  unblocks `useHomeFeedAuthors`'s `truncatedBySource` field.
- **R5: `ActivityCard` `did` prop.** Use `event.actor.did`. The actor IS
  the author for `cert.create` events.
- **R6: synthesised record shapes must mirror existing node→record
  mappers.** Extract `nodeToActivityRecord` and `nodeToCollectionRecord`
  helpers (currently inline in `indexer.ts:60-86, 714-759`) so the new
  hydration code reuses the exact same blob-ref unwrapping. Two small
  refactors as part of the client-module track.
- **R10: polling `refresh` stability.** Snapshot `refresh` via `useRef`
  inside the polling effect (mirror `use-global-feed.ts:56-57`), don't
  list it as a dep.
- **R11: `FeedEventKind` shouldn't be `string`.** Define
  `KNOWN_FEED_EVENT_KINDS` as a tuple-literal constant, derive
  `KnownFeedEventKind = (typeof ...)[number]`. The wire shape stays
  `kind: string`; the dispatch component narrows to known kinds and
  falls through to fallback for everything else.
- **S5 + R4: `refresh()` semantics.** Define once: `refresh()` fetches a
  new page-1, merges by `event.id` (dedupe), prepends new entries that
  weren't previously visible. Pagination cursors for already-loaded pages
  stay valid. `loadMore()` and `refresh()` may overlap safely — neither
  resets the other's state.

### UX / states
- Empty state: three variants (signed-out, no-follows, no-events).
- Skeleton: render `ActivityCardSkeleton` × 3 as a generic loading state;
  layout shift on first paint is acceptable for v1 (the cards' actual
  heights vary per kind regardless). Note in deferred.
- `truncatedByCap` / `truncatedBySource` warning: small non-blocking
  banner above the feed when either is true. Copy: "You follow more
  than 500 people. Showing a subset." / "Your follow list is too large
  to fully sync."

## Accepted with revision

- **S6: ranking for over-cap.** Issue recommends recent-interaction;
  v1 still ships alphabetical-by-DID. **Reason recorded in plan v2:**
  "recent-interaction ranking" needs a per-DID timestamp. We have
  `app.certified.graph.follow.createdAt` for Certified follows, but
  Bluesky follows go through the listRecords path which returns records
  in PDS-insertion order — not the same semantic. Mixing the two
  recency signals in a union ranking is not obvious; v1 picks the
  deterministic option and defers the weighted ranking to a follow-up.
  Note also that 500/total truncation is rare for typical users.

## Rejected — with rationale

- **S7: distinguish endorsement-typed `badge.award` via
  `badge.definition.badgeType`.** Per the issue's deliberate v1
  limitation: "Every `app.certified.badge.award` record produces `kind
  = badge.award`. If you need to distinguish endorsement-typed awards
  from other badge types, fetch the linked `badge.definition.badgeType`
  via the existing query." v1 doesn't distinguish — renders all
  `badge.award` events with the same chrome ("actor awarded a badge to
  subject"). Adding the definition-type fetch is a follow-up if/when
  product needs the distinction.
- **S9: stop background polling after N idle minutes.** The existing
  notifications polling doesn't bound idle either, and the cost is one
  GraphQL request every 5 minutes. Skip; revisit if it shows up in
  metrics.
- **R7 (build, minor): per-row `resolve-did` for endorsement subjects.**
  `EndorsementRow` fetches author info itself via `useAuthorInfo`. For
  the feed card variant we'll do the same — N row-level lookups, but
  already cached at the resolve-did module level. Acceptable for v1;
  optimising into a batched resolve is its own ticket.
- **Skeleton per kind.** Mentioned in I-review but adds complexity
  disproportionate to value. Generic skeletons + once-per-paint layout
  shift is fine. Note in deferred.

## Deferred — new items added to v2's deferred list

- Recent-interaction author ranking for the 500-cap truncation.
- Per-kind skeleton variants.
- Endorsement-vs-other-badge-type distinction (needs
  `badge.definition.badgeType` hydration).
- Migrating `ActivityFeed.following` to the new feed.
- Batched `resolve-did` for actor lookups in endorsement cards.
- Subscription / live updates (server doesn't support yet).
- Most-recent-interaction author ranking (depends on a signal we don't
  have client-side).
