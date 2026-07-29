# Implementation review round 3

Target: post-round-2 implementation.

## Accepted findings

### Add normalization/render coverage for every event kind

Accepted. Runtime adapter tests parse all seven views, but app-level coverage should also prove the normalized home-feed union and row renderer handle all eight known event kinds plus the unknown fallback without crashing or reintroducing actor lookups for complete summaries.

### Run final gates after the coverage change

Accepted. The round-2 worker reported a fresh passing run of both typechecks, 994 tests, lint, build, and diff check. Adding the final coverage requires another run before completion.

## Rejected findings

### Add Draft to the organization-quality UI

Rejected as an unapproved product expansion. The approved [`interactive-plan.html`](./interactive-plan.html) request builder exposes High quality, Standard, Likely test, and Not labeled yet. The app's authoritative `ORGLABEL_TIERS` and Orglabeler documentation likewise define only `high-quality`, `standard`, and `likely-test`. The feed-service wire type accepts `draft` for forward compatibility, so the adapter keeps that value in its public type, but the current UI intentionally does not offer or send it.

### Prior quality gates are unavailable

Corrected. The round-2 fix worker ran and reported passing post-fix typecheck, test typecheck, 994-test full suite, lint with the unchanged warning baseline, production build, and `git diff --check`. Final gates will still run again after the added matrix coverage.

## Result

Add the focused event matrix coverage, then perform one final clean review and independent local validation. External rollout checks remain approval-gated.
