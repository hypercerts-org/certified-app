# Implementation review round 2

Target: post-round-1 uncommitted implementation.

## Accepted findings

### Calendar-valid RFC3339 validation

Accepted. A shape regex plus `Date.parse` still permits normalized rollover values. The adapter must reject invalid calendar days, invalid hour 24, and other normalized-but-invalid timestamps while preserving valid fractional seconds and timezone offsets.

### Bound `Retry-After` timestamp arithmetic

Accepted. Delta-seconds must produce a safe finite millisecond timestamp within the browser timer/date range. Oversized values degrade to no readable cooldown rather than overflowing.

### Enforce handle, URI, and CID formats

Accepted. Runtime validation must reject malformed actor handles, generic URI image values, source/target CIDs, and blob-ref CIDs. This remains dependency-free and should follow the Lexicon-compatible syntax already enforced by the service.

### Empty-page pagination needs a manual escape after the auto budget

Accepted. When no events are visible but a cursor remains, render a manual load-more control. It must remain usable after 25 automatic attempts without introducing a second unbounded IntersectionObserver loop. Add component coverage for budget exhaustion/accessibility.

### Recognized 5xx messages must remain generic

Accepted. Even a recognized `InternalError` body cannot surface its message when HTTP status is 500 or greater. Preserve service messages only for recognized sub-500 XRPC errors; test recognized 5xx sanitization.

### Add rollback-source isolation coverage

Accepted. Add an indexer-mode component test proving the service hook does not mount and the legacy follow/evaluator hook graph remains selected.

### Run fresh ship gates after fixes

Accepted. Final review cannot rely on the previous worker run because this round changes code and tests.

## Result

Apply these fixes in one writer pass, then run a final fresh review round focused on regressions rather than optional hardening.
