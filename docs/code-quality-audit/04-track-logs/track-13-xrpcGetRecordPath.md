# Track T13 — xrpcGetRecordPath helper

Commit: `15a2879`

Three client-side call sites built the same
`/api/xrpc/com/atproto/repo/getRecord?repo=...&collection=...&rkey=...`
URL inline with three `encodeURIComponent` calls each:

- `src/lib/atproto/profile.ts#getProfile`
- `src/lib/atproto/profile.ts#getBlueskyProfile`
- `src/app/settings/edit-profile/page.tsx#fetchOwnOrgMarker`

Added `xrpcGetRecordPath({ repo, collection, rkey })` to
`src/lib/utils/api.ts`. Scoped strictly to the BFF-proxied path —
the two `/api/groups/[did]/{profile,metadata}` route handlers that build
foreign-PDS URLs with the alternate dotted XRPC shape are deliberately
left untouched (different surface, different format).

Files (3). Diff: +32/-7.

Verification: all four gates passed.
