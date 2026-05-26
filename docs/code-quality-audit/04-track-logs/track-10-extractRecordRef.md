# Track T10 — extractRecordRef helper

Commit: `aa436d2`

Four group route handlers (activity, follow, location, project) repeated
the same `{ data: { uri?, cid? } }` extraction-and-validation dance
after an XRPC mutation call. Each cast `upstream` through `as unknown as
{ data?: { uri?: string; cid?: string } }`, pulled the strings, returned
502 if either was missing, then echoed `{ uri, cid }` on success.

Extracted `extractRecordRef(upstream): { uri, cid } | null` to
`src/lib/utils/api.ts`. The 502 message strings stay per-route
("strongRef" in location.ts; "record reference" elsewhere) because they
match each route's domain language.

Files (5): `src/lib/utils/api.ts` + the 4 route handlers.
Diff: +45/-27. Four `as unknown as` casts removed.

Verification: all four gates passed.
