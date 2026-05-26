# Track T14 — log-safe Bearer/DPoP test coverage

Commit: `0ca8db6`

The redactSecrets dedupe in T08 added a bare-`Bearer`/`DPoP` fragment
pattern to `log-safe.ts`. The existing log-safe test suite didn't cover
it. Added three tests in `log-safe.test.ts`:

- bare "Bearer <token>" fragment redacts
- bare "DPoP <token>" fragment redacts
- documents accepted over-redaction of "Bearer scheme" mention (the
  regex is intentionally permissive; over-redacting log lines is the
  safer failure direction)

Test count 154 -> 157.

Files (1): `src/lib/utils/__tests__/log-safe.test.ts`. Diff: +28/-0.

Verification: all four gates passed; 157/157 tests pass.
