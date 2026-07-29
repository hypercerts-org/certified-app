# Plan review round 2

Target: [`plan.md`](./plan.md), reviewed against Certified Feed Service commit `02f2a78` and the current React implementation.

## Accepted

### `Retry-After` is not currently CORS-exposed

Accepted. The browser cannot rely on reading it from the deployed cross-origin response. The client will parse and honor a visible valid header opportunistically, but a missing, malformed, or CORS-hidden header blocks automatic pagination and leaves explicit manual retry available. Exposing and verifying the header is a rollout gate, not an app-code or deployment change in this branch.

### Enforce the kind-to-view matrix

Accepted. Known mismatched pairs are contract failures. Unknown kinds or unknown view discriminators still degrade to the generic event renderer.

### Make image validation contextual and pin blob ownership

Accepted. Actor/activity, collection, and update views each accept only their Lexicon-defined image unions. Actor avatars use `actor.did`; view blobs use the source AT-URI authority. Tests must cover both.

### Restrict trusted error messages

Accepted. Only bounded JSON XRPC errors with recognized feed error codes may surface their service message. Unknown/non-JSON/malformed failures use a generic client message.

### Strengthen cursor invariants

Accepted. Response cursors must be non-empty and at most 4096 characters. The hook tracks every cursor in a request generation and stops any cycle before another request.

### Preserve endorsement actor summaries through grouping

Accepted. Grouping stores `HomeFeedActor[]`; service summaries render without `useAuthorInfo`. Grouped-endorsement coverage is required.

### Split source implementations into child components

Accepted. `ServiceHomeFeed` and `LegacyHomeFeed` own disjoint hook graphs. Legacy follow/evaluator/org expansion never runs in service mode. Follow-specific states remain legacy-only.

### Preserve `legacy.endorsement`

Accepted. The rollback path retains it with an incomplete subject actor.

### Define hook retry state and timer ownership

Accepted. The plan now names initial/continuation errors, retry timestamp, auto-load gate, request key, and retry actions. A valid visible 429 delay owns a timer that re-enables manual retry.

### Reset auto-pagination on request-generation changes

Accepted. The body receives a request key so viewer/filter changes reset its attempt budget.

### Require lifecycle and source-isolation tests

Accepted. These tests are mandatory, including acting-context/filter rerenders during continuation and evaluator-list readiness.

### Tighten service URL parsing

Accepted. The value is an exact origin, not a general base URL. Userinfo, path, query, fragment, invalid protocol, and non-loopback HTTP are rejected.

### Add operational cutover gates

Accepted. Exact CORS allowlist, localhost policy, browser preflight/POST smoke tests, same-build rollback smoke, rollout owner/trigger, observation period, and exit metrics are now explicit acceptance gates. They will not be executed without separate approval.

## Rejected or deferred

### Change the feed service or gateway in this app implementation

Deferred. Adding `Access-Control-Expose-Headers: Retry-After`, changing deployed CORS origins, and gateway policy belong to the service/deployment rollout. This branch implements safe fallback behavior and records those external gates without changing external state.

## Result

The app implementation can proceed. Production cutover remains intentionally blocked on the approval-gated operational checks.
