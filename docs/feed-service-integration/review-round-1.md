# Plan review round 1

Target reviewed: [`interactive-plan.html`](./interactive-plan.html) plus the current home-feed implementation and Certified Feed Service commit `02f2a78`.

## Accepted findings

### Clarify the direct-browser trust boundary

Accepted. The implementation plan now states that the endpoint returns public indexed data, `viewerDid` is a scope input rather than an authorization identity, and CORS is not authentication or abuse prevention. A same-origin authenticated BFF is intentionally not part of this cutover.

### Define rollback flag ownership and semantics

Accepted. The flag is `NEXT_PUBLIC_HOME_FEED_SOURCE=indexer|service`, defaults to `indexer`, fails on invalid configured values, and requires a redeploy because it is build-time public configuration. Both implementations remain bundled through observation.

### Name and validate the service URL configuration

Accepted. The URL variable is `NEXT_PUBLIC_CERTIFIED_FEED_SERVICE_URL`. It is required only in service mode, must be HTTPS outside local development, and is documented alongside exact-origin behavior. Vercel preview origins are not implicitly supported.

### Define open-union and malformed-known-view behavior

Accepted. Unknown kinds/views become generic renderable events. Malformed known views fail the page with a contract error. Required fields, strong refs, DIDs, timestamps, and known image wrappers are runtime-checked. Missing actor DIDs are derived only from a valid DID-authority source AT-URI.

### Define rate-limit and continuation failure behavior

Accepted. The plan now distinguishes initial and continuation failures, parses both `Retry-After` formats, blocks automatic pagination after failure, preserves visible items, and requires explicit retry UI and focused tests.

### Record the activity-quality behavior change

Accepted. The shared activity-quality controls are removed. Service mode has no activity-quality filter and may include draft/likely-test activities. The rollback indexer path keeps its existing internal default exclusion.

### Add a canonical Markdown implementation plan

Accepted. `plan.md` is now the implementation-shaped contract; the interactive map remains the visual source.

## Rejected or corrected findings

### Request should include activity-quality input

Rejected. The deployed `app.certified.feed.beta.getFeed` Lexicon has no activity-quality field, and the approved cutover explicitly defers it. Sending one would violate the request contract.

### Every service actor must contain a DID

Corrected. Commit `b256138` made `actorSummary.did` optional on the wire. The client therefore derives a missing actor DID from the validated source AT-URI. The normalized internal actor always has a DID.

### Add a runtime server-controlled source switch

Rejected for this cutover. It would require a new BFF/control-plane seam and undermine the chosen direct-browser architecture. Redeploy-based rollback is acceptable during the observation window.

## Result

No unresolved product or architecture decision blocks implementation. Live origin/service verification and any environment or deployment change remain separate approval-gated actions.
