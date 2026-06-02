# Track T05 — drop unused local isDid in handle-search

Commit: `9bf9e89`

`src/components/groups/handle-search.tsx` defined a local `isDid()`
function (line 20) that no code in the file ever called — only
`looksLikeCompleteDid()` (a stricter sibling defined a few lines below) is
referenced. Deleted the dead helper.

Files (1): `src/components/groups/handle-search.tsx`. Diff: -6 lines.

Verification: all four gates passed.
