# Track T02 — formatShortDate in activity-detail

Commit: `cbdbc24`

Replaced the local `formatDate` definition in
`src/components/feed/activity-detail.tsx` with the canonical
`formatShortDate` from `src/lib/utils/format-date.ts`. Behavior identical;
both produce "Mon D, YYYY".

Files: `src/components/feed/activity-detail.tsx` (1 file).
Diff: -11/+5.

Verification: all four gates passed.
