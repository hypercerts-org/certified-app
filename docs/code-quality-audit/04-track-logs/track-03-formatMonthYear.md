# Track T03 — formatMonthYear helper

Commit: `8fb3dc6`

Added `formatMonthYear(iso)` to `src/lib/utils/format-date.ts`. Adopted
in two sites that were inlining `toLocaleDateString("en-US", { month,
year })`:

- `src/components/profile/profile-sidebar.tsx#formatJoined` (the "Joined
  Mon YYYY" subtitle on the profile sidebar).
- `src/hooks/use-profile-inline-edit.ts#readableFoundedDate` (the org
  founded-date display; preserves the 4-digit-year passthrough branch).

Diff: +25/-6 across 3 files.

Verification: all four gates passed.
