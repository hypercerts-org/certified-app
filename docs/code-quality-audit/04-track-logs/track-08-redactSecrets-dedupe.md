# Track T08 — redactSecrets dedupe + Bearer pattern

Commit: `e78f365`

`src/lib/utils/api.ts` had a private `redactSecrets` that was a strict
subset of the exported `redactSecrets` in `src/lib/utils/log-safe.ts`.
Deleted the local copy and imported the shared one.

To preserve the api.ts-local's bare-`Bearer <token>` coverage that the
log-safe regex (header-line scoped: requires the colon) didn't catch,
added a new `/(Bearer|DPoP)\s+[A-Za-z0-9._-]+/` rule to log-safe's
`redactSecrets`. Strict superset of both prior behaviors.

Test expectations in `src/lib/utils/__tests__/api.test.ts` were updated
to use the log-safe output tokens (`<jwt>`, `Bearer <redacted>`) — the
previous tests asserted the old api.ts tokens (`[jwt-redacted]`,
`Bearer [redacted]`).

Files: 3 — `src/lib/utils/api.ts`, `src/lib/utils/log-safe.ts`,
`src/lib/utils/__tests__/api.test.ts`. Diff: +13/-13.

Verification: all four gates passed. Test coverage retained.
