# Implementation review round 2 — decisions (2026-07-13)

Three reviewers over `staging...HEAD` (functional correctness of the riskiest
behavior changes; code quality of the new/moved modules; perf-regression +
design-system conformance of the diff). Every finding skeptic-verified before
acceptance: **11 confirmed, 1 refuted**.

## Accepted — fixed in `fix(review)` commit

1. Indexer op allowlists: own-key guards (`Object.hasOwn`) on the GET
   CACHEABLE_OPS and POST OPERATIONS lookups so prototype keys (`op=constructor`)
   die at the first gate; unknown-op tests extended to pin it. (correctness, nit —
   defense-in-depth: buildVariables' switch default already stopped the request.)
2. Barrel/domain import cycle in the indexer split: shared plumbing
   (postIndexer, INDEXER_PROXY_URL, chunkArray) moved to a leaf
   `indexer-client.ts`; strictly one-way imports now, barrel compat preserved.
   (quality, should-fix.)
3. CertPreview compat re-export dropped; the one consuming test imports from
   `home-feed-rows` directly. (quality, should-fix.)
4. Six comment pointers updated from `api/indexer/route.ts` to `operations.ts`
   (incl. the load-bearing keep-in-sync note in network-counts-server.ts).
   (quality, should-fix.)
5. Three carried-over `no-img-element` suppressions got the one-line
   justification suffix the pass standardized on. (quality, nit.)
6. Zero-consumer exports de-exported in explore-results.tsx (type interfaces
   stay exported per convention). (quality, nit.)
7. use-explore-loaders bounded-map: comment states the recency-refresh
   requirement that rules out `createBoundedCache` (reuse rejected — behavior
   difference is real even if immaterial at size 8; honesty beats false DRY).
   (quality, nit.)
8. ExploreSearchField debounce read stale `onCommit`/`search` through the timer
   closure and could revert a URL change made mid-window; latest-ref pattern
   (effect-synced, not render-written) makes the in-code comment true.
   (perf-ds, should-fix.)
9. Endorsement-graph repaintEpoch bumps coalesced to one per animation frame
   (was one re-render per avatar load in a burst). (perf-ds, nit.)
10. Explore content-visibility rule scoped to the three list variants where it
    can apply; funding's `display:contents` rows documented as the exclusion.
    (perf-ds, nit.)

## Accepted — as a PR test-plan item (its fix IS a deployed-build retest)

11. `staleTimes.dynamic=30` must be retested against the preview deployment on
    /explore (warm router cache → filter/sort clicks must still change URL +
    results; the route's `force-dynamic` exists to defeat client segment-cache
    reuse). Added as a checked item in the PR test plan; revert path is a
    one-line config removal.

## Refuted

- "bodyHasErrors treats a no-`data` JSON body as cacheable, pinning a useless
  200" — accurate code reading, but requires a spec-nonconforming upstream
  response no real GraphQL server emits, and s-maxage=300 bounds the blast
  radius. Recorded, not actioned.
