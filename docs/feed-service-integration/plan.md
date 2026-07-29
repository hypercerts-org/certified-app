# Certified Feed Service integration plan

## Larger goal

Replace the home feed's browser-owned scope expansion and two-step Hyperindex hydration with the deployed Certified Feed Service's hydrated XRPC while keeping the old indexer path available for a redeploy-based rollback during the observation window.

The home page should supply only the acting viewer DID and current evaluator/organization-quality selections. The service owns follow expansion, evaluator expansion, organization filtering, event selection, source validation, actor hydration, and cursor generation. The app owns rendering, target-title reads, and blob delivery through its existing XRPC proxy.

Authoritative visual map: [`interactive-plan.html`](./interactive-plan.html).

## Alternatives considered

### 1. Build-time source flag with both implementations retained — chosen

```ts
type HomeFeedSource = "indexer" | "service"

const source = parseHomeFeedSource(
  process.env.NEXT_PUBLIC_HOME_FEED_SOURCE,
)
```

- Default: `indexer` until staging verification completes.
- `service` activates the direct hydrated XRPC path.
- Invalid configured values fail with an actionable configuration error.
- Because this is a `NEXT_PUBLIC_*` build-time value, switching it requires a deployment. Rollback is one environment-variable change followed by a redeploy, not an instantaneous runtime toggle.
- Both paths and their dependencies remain bundled until the observation window ends.

Rationale: preserves the plan's direct-browser boundary and narrow scope without adding a new server proxy solely to own a runtime flag.

### 2. Immediate direct cutover

Rejected because it removes the verified rollback path before staging and production observation.

### 3. Same-origin BFF/runtime switch

Rejected for this cutover because the feed contains public indexed data, `viewerDid` is a public scope input rather than an authorization identity, and a BFF would add another transport and operational boundary. CORS is browser-origin policy, not authentication or abuse prevention; gateway rate limiting remains the abuse-control boundary.

## Trust boundary

The direct feed procedure is intentionally unauthenticated and returns only public indexed records and public actor/profile summaries. The request uses `viewerDid` to select that DID's public Certified follow graph. It does not assert the signed-in user's identity or authorize access to private data.

The browser request must use:

```ts
fetch(endpoint, {
  method: "POST",
  credentials: "omit",
  cache: "no-store",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
  signal,
})
```

No cookie, OAuth token, rate-limit bypass key, or other credential crosses the origin boundary.

## Environment contract

```text
NEXT_PUBLIC_HOME_FEED_SOURCE=indexer|service
NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL=https://<feed-service-origin>
```

- `NEXT_PUBLIC_HOME_FEED_SOURCE` defaults to `indexer` when absent.
- `NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL` is required only when the source is `service`.
- Production/staging service URLs must use HTTPS.
- Non-production permits HTTP only for `localhost`, `127.0.0.1`, or `[::1]`.
- The URL must be an exact origin: no credentials/userinfo, path beyond `/`, query, or fragment. The client appends `/xrpc/app.certified.feed.beta.getFeed`.
- Configuration tests cover HTTPS origins, loopback HTTP, userinfo, paths, queries, fragments, and unsupported protocols.
- Exact approved app origins are `https://certified.app`, `https://staging.certified.app`, and local loopback development origins. Vercel preview origins are not implicitly allowed; they must either use the indexer source or be added explicitly to the service deployment.
- The current CSP already permits direct HTTPS connections. Plain-HTTP local cross-origin feed service use is not added to production CSP; local verification can use the deployed HTTPS service or a same-host development setup.

## Public and internal APIs

```ts
type OrganizationQuality =
  | "high-quality"
  | "standard"
  | "draft"
  | "likely-test"

type GetCertifiedFeedInput = {
  viewerDid: string
  trustedEvaluators: string[]
  organizationQuality: {
    allowed: OrganizationQuality[]
    includeUnrated: boolean
  }
  limit: number
  cursor?: string
}

type CertifiedFeedActor = {
  did: string
  handle?: string
  displayName?: string
  avatar?: FeedImage
}

type CertifiedFeedItem = {
  id: string
  kind: string // open union
  subject: { uri: string; cid: string }
  feedTimestamp: string
  actor: CertifiedFeedActor
  view: KnownFeedView | UnknownFeedView
}

type CertifiedFeedPage = {
  items: CertifiedFeedItem[]
  cursor?: string
}

class CertifiedFeedError extends Error {
  status: number
  code: string | null
  retryAt: number | null
}

async function fetchCertifiedFeed(
  input: GetCertifiedFeedInput,
  signal?: AbortSignal,
): Promise<CertifiedFeedPage>
```

The adapter remains dependency-free and runtime-checks the response boundary.

## Runtime validation contract

- Validate the response object, `items` array, optional cursor, required item fields, strong references, timestamps, actor summaries, and every known view shape.
- A response cursor must be a non-empty string no longer than 4096 characters.
- Validate DIDs at least as a syntactically bounded `did:<method>:<identifier>` value.
- If `actor.did` is absent, derive it only from a valid source AT-URI whose authority is a valid DID.
- Enforce the service's kind-to-view matrix: `cert.create` → `activityView`; `collection.create` / `project.created_with_cert` → `collectionView`; every other known kind → its same-named view. A known kind paired with the wrong known view is a contract failure.
- A malformed known view is a contract failure for the page. The error says which item/view failed and that the service contract or deployment must be corrected.
- An unknown `view.$type` or unknown event kind becomes a renderable unknown event preserving actor, timestamp, raw kind, and subject URI. It must not crash or disappear silently.
- Image validation is contextual: actor/activity accept `uri | smallImage`; collection accepts `uri | smallImage | largeImage`; update accepts `uri | smallBlob`. A malformed known variant fails the contract; a genuinely unknown discriminator is ignored.
- Actor-avatar blob URLs use `actor.did`. View-image blob URLs use the DID authority from the validated source AT-URI. All blobs resolve through `/api/xrpc/com/atproto/sync/getBlob`; URI variants remain external image URLs.

## View-native rendering seam

Both sources normalize into one `HomeFeedEvent` union:

```ts
type HomeFeedActor = {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  complete: boolean // service summary is complete even when DID-only
}

type HomeFeedEvent =
  | { kind: "cert.create"; view: ActivityView; ...base }
  | { kind: "collection.create" | "project.created_with_cert"; view: CollectionView; ...base }
  | { kind: "endorsement.award" | "legacy.endorsement"; subject: HomeFeedActor; ...base }
  | { kind: "evaluation.create" | "measurement.create" | "hyperboard.create" | "update.create"; view: SimpleView; ...base }
  | { kind: "unknown"; rawKind: string; subjectUri: string; ...base }
```

Call stack:

```text
HomeFeed(activeDid)
  -> ephemeral evaluator + organization-quality controls
  -> source switch between separate hook-owning children
     -> ServiceHomeFeed
        -> wait for useTrustedEvaluators() to resolve
        -> useHomeFeed({ viewerDid, trustedEvaluators, organizationQuality })
        -> fetchCertifiedFeed()
        -> normalize service views
     -> LegacyHomeFeed
        -> existing follows/evaluator/org expansion
        -> useLegacyHomeFeed(effectiveFollows)
        -> FollowerEvents + HydrateFeedPage
        -> normalize legacy payloads
  -> HomeFeedBody(HomeFeedEvent[])
  -> target-title hooks / blob proxy only where still required
```

The source split uses separate `ServiceHomeFeed` and `LegacyHomeFeed` child components so legacy hooks are never invoked in service mode and hooks are not called conditionally inside one component. Follow-specific loading/error/count states remain inside `LegacyHomeFeed`; the service body does not claim an empty page means the viewer follows nobody.

Service actor and endorsement-subject summaries set `complete: true`. Source-safe renderer components consume complete summaries without invoking `useAuthorInfo`; legacy lookup renderers receive only incomplete summaries. Evaluator rows still resolve evaluator display data because the trusted-evaluator list contains DIDs only. Endorsement groups carry `HomeFeedActor[]`, not just DIDs, so grouped service endorsements preserve hydrated summaries. `legacy.endorsement` remains supported through the observation window with an incomplete subject actor.

## Pagination and failure behavior

The service hook returns explicit failure and retry state:

```ts
type HomeFeedState = {
  events: HomeFeedEvent[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  initialError: string | null
  continuationError: string | null
  retryAt: number | null
  canAutoLoad: boolean
  requestKey: string
  retryInitial(): void
  loadMore(): void // also the explicit continuation retry
}
```

- Initial and continuation requests receive abort signals.
- A dependency change aborts both request classes and increments a request generation; stale resolutions cannot commit state.
- `requestKey` resets/remounts the component-level auto-pagination budget when viewer or filters change.
- Append pages deduplicate by event ID.
- Missing cursor means end of feed.
- Empty pages with a cursor remain pageable; existing auto-pagination may request the next selected page.
- Track every cursor seen in the current request generation. Reject an empty, overlong, repeated, or cyclic cursor before another request can loop.
- `InvalidCursor` discards the cursor and requests page one while preserving visible items until replacement succeeds.
- Initial errors show a retry action.
- Continuation errors preserve visible items, set `canAutoLoad: false`, and show a manual retry action.
- HTTP 429 reads `Retry-After` as delta-seconds or HTTP-date only when cross-origin response headers expose it. A valid visible delay disables manual retry until expiry. Missing, malformed, or CORS-hidden headers still block automatic pagination but allow explicit manual retry; the app does not pretend a hidden header was honored.
- Preserve server messages only from a bounded, validated JSON XRPC error body carrying one of the recognized feed error codes. Malformed bodies, non-JSON gateway responses, and unknown error codes use a generic client message.

## Filter behavior

Keep:

- Trusted evaluator selection, sourced from the existing curated list reader.
- Organization-quality selection, serialized directly as `allowed` and `includeUnrated`.
- Ephemeral in-memory state only.

Drop from the service path:

- PDS follow walk in the browser.
- Evaluator endorsement expansion in the browser.
- Organization-label DID resolution in the browser.
- Activity-quality request filtering and its controls.

The hydrated service contract has no activity-quality field or labels in activity views. Service mode can therefore include draft/likely-test activities selected by the public feed service. The rollback indexer path keeps its existing default label exclusion internally, but the activity-quality control is removed from the shared UI during this cutover.

## File ownership

### Add

- `src/lib/atproto/certified-feed.ts`
- `src/lib/atproto/__tests__/certified-feed.test.ts`
- Mandatory hook lifecycle and source-isolation contract tests

### Change

- `src/hooks/use-home-feed.ts`
- `src/components/home/home-feed.tsx`
- `src/lib/utils/group-feed.ts`
- `src/lib/utils/__tests__/group-feed.test.ts`
- `src/lib/dev/fixtures/feed.ts`
- `src/components/dev/mock-fetch-provider.tsx`
- `.env.local.example`
- `README.md`
- `AGENTS.md` only for the new public environment and architecture contract

### Keep through observation

- `src/lib/atproto/follower-events.ts`
- `src/hooks/use-evaluator-endorsements.ts`
- Home-feed GraphQL operations and tests
- `/api/indexer` for Explore, profiles, and the rollback feed path
- `useActivity` / `useProject` target-title reads

### Remove only after a separately approved observation-window cleanup

- Home-only `FollowerEvents`, `HydrateFeedPage`, `EvaluatorEndorsements`, and organization-label feed usage
- Legacy feed fixtures and rollback source branch

No file deletion is part of this implementation.

## Acceptance criteria

1. Service mode sends one credentialless `getFeed` request per selected page.
2. Personal and active-group DIDs are sent as `viewerDid` without client-side scope expansion.
3. All eight event kinds render from the seven known view variants.
4. Unknown views/kinds degrade to the existing generic event treatment.
5. Feed actor and endorsement-subject cards do not call `useAuthorInfo` in service mode.
6. Activity/project target titles and blob fallbacks remain intact.
7. Filter changes and acting-context changes cannot append stale events.
8. Empty-page cursors, cursor cycles, invalid cursors, 429 responses, and continuation 500s terminate or recover without loops.
9. Configuration tests reject malformed/non-origin service URLs and invalid source values.
10. Lifecycle tests cover personal→group and filter changes during continuation, both request classes being aborted, stale resolutions, empty/repeated/cyclic cursors, retry blocking, evaluator-list readiness, grouped hydrated endorsements, and source isolation.
11. Service mode sends no home-feed requests to `/api/indexer`; indexer mode remains functional.
12. Explore and unrelated indexer operations are unchanged.
13. Before enabling service mode, the target app origin is present in the deployed exact CORS allowlist; production localhost allowance is explicitly reviewed; browser preflight and credentialless POST smoke tests pass for personal and active-group contexts; and indexer rollback mode is smoke-tested from the same build.
14. The rollout owner, rollback trigger, observation period, and exit metrics are recorded before production cutover. `Retry-After` cooldown is verified only if the gateway/service exposes that response header to browser JavaScript.
15. `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm test`, and `npm run build` pass.

## Out of scope

- Durable preference Lexicon or PDS writes
- localStorage preference cache
- Cross-device filter synchronization
- Feed-service authentication
- Target-record hydration inside the service
- Blob proxying inside the feed service
- Explore/profile indexer migration
- Legacy path deletion before observation completes
- Deployment, environment changes, CORS changes, or live external verification without separate explicit approval. These remain rollout gates, not app-code work.

## Rollback

Set `NEXT_PUBLIC_HOME_FEED_SOURCE=indexer` and redeploy the app. The legacy code, fixtures, and indexer operations remain present. No data migration, schema change, or user-state rollback is required.
