# Feed service consumption update

## Goal

Make the Certified app consume the current `http/configurable-cors` feed-service contract without spreading service-specific wire types through the home-feed UI.

## Main API / ownership

```ts
fetchCertifiedFeed(input: HomeFeedRequest): Promise<CertifiedFeedPage>
// adapter emits { feedId, params: { $type, viewerDid, ... }, limit, cursor }
// adapter normalizes { feed, cursor? } into the app-owned page model
```

- `src/lib/atproto/certified-feed.ts` owns wire request construction, response validation, and normalization.
- `src/hooks/use-home-feed.ts` maps normalized items into the existing `HomeFeedEvent` model.
- Existing home-feed components remain unchanged unless nullable timestamps require a minimal rendering adjustment.

## Alternatives

- Keep the current UI model and translate at the boundary (chosen: smallest surface and preserves rollback hook).
- Propagate `feed/view/content` through UI components (drop: unnecessary coupling).
- Support both old and new wire contracts (drop: beta service has no required compatibility window).

## Acceptance criteria

- Requests include the feed ID and typed nested params; pagination remains top-level.
- Responses parse `feed` entries with URI-only subjects and nested Certified views.
- Current activity, collection, endorsement, evaluation, measurement, hyperboard, and update cards map correctly.
- Missing optional wire fields are safe; source CID/feed timestamp are not assumed.
- CORS remains credentialless and requires no app proxy/configuration.
- Adapter and hook regression tests fail before implementation and pass afterward.

## Out of scope / rollback

- No service-repository changes, CORS policy changes, activity-quality UI, or new feed UI.
- Roll back by reverting the app adapter/hook commit; `NEXT_PUBLIC_HOME_FEED_SOURCE=indexer` remains available.

## Open question

- If the service rebase adds `activityQuality`, model it as an optional top-level request field in a follow-up or include it only when the app exposes that filter.
