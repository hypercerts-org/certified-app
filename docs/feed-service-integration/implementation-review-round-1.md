# Implementation review round 1

Target: current uncommitted implementation of [`plan.md`](./plan.md).

## Accepted findings

### Failed invalid-cursor recovery can reuse the invalid cursor

Accepted. Recovery must clear cursor ownership before requesting page one. If that recovery fails, the continuation retry action must retry page one while preserving visible items rather than reissuing the invalid cursor.

### Explicit actor DID can disagree with source ownership

Accepted. A present event actor DID must equal the validated source AT-URI authority. Missing actor DID may still derive from that authority. Tests must pin mismatch rejection and blob ownership.

### Datetime and `Retry-After` parsing are too broad

Accepted. Feed datetimes must match an RFC3339 shape before parsing. `Retry-After` accepts only non-negative delta-seconds or a strict HTTP-date shape, not arbitrary JavaScript-parsable dates.

### Same-tick `loadMore` calls can duplicate one page request

Accepted. Add a synchronous in-flight admission ref set before React state updates and cleared only when that continuation/recovery settles or is superseded.

### Request-key transitions can expose or paginate stale state

Accepted. State must carry/verify request ownership. A viewer/filter transition renders loading state immediately, rejects continuation against old ownership, aborts both request classes, and cannot combine a new request body with an old cursor.

### Legacy identity precedence regressed

Accepted. For incomplete rollback-path summaries, `useAuthorInfo` remains authoritative over indexer hints for handle, display name, and avatar. Add regression coverage.

### Lifecycle/source-isolation coverage is incomplete

Accepted. Add focused coverage for same-tick continuation admission, initial abort, filter change during continuation, stale request ownership, empty-page continuation, multi-step cursor cycles, failed invalid-cursor recovery and retry, cooldown expiry, grouped hydrated endorsements, and service-source isolation from legacy/indexer hooks.

## Rejected or classified separately

### Remove the AGENTS branching-policy change

Rejected as an implementation action. That change existed before this task began and belongs to the user's pre-existing dirty worktree. The feed implementation only added the environment rows and direct-XRPC architecture note. The pre-existing policy edit must remain untouched.

### Treat one reviewer full-suite failure as a confirmed feed regression

Not confirmed. The implementation worker's full run passed 963 tests. The reviewer saw four Explore failures that all passed in isolation, indicating suite-level flakiness or resource sensitivity. Final acceptance still requires a fresh full-suite pass after fixes; repeated failure would become actionable evidence.
