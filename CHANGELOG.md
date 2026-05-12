# Changelog

## 2026-04-13 — Security Audit

Full security and code quality audit. See `AUDIT_REPORT.md` for complete details.

### Security Fixes

- **Next.js 16.1.6 → 16.2.3** — Patches 6 CVEs including CSRF bypass, HTTP request smuggling, and DoS vectors
- **Transitive dependency patches** — Resolves all npm audit advisories (undici, flatted, picomatch, brace-expansion)
- **CSRF null origin hardening** — Explicitly rejects `Origin: null` header to prevent sandbox/iframe-based CSRF attacks
- **Indexer proxy body size limit** — 100 KB cap prevents memory exhaustion via oversized GraphQL payloads
- **Group profile/metadata mass assignment prevention** — Field allowlists replace raw body spread in group record writes
- **Group blob upload Content-Length pre-check** — Rejects oversized uploads before reading into memory

### Input Validation

- **Handle length validation** — Group handle update and registration enforce 253-char DNS hostname limit
- **Strict DID validation** — `/api/resolve-did` now uses `isValidDid` regex instead of `startsWith("did:")`

### Code Quality

- **Consistent error handling** — All API routes now use `extractRouteError` helper for uniform 5xx sanitization
- **Extended Permissions-Policy** — Added `payment=()` and `usb=()` restrictions

### Dependencies

| Package | Before | After |
|---|---|---|
| next | 16.1.6 | 16.2.3 |
| eslint-config-next | 16.1.6 | 16.2.3 |

No breaking changes. All changes are additive security hardening.
