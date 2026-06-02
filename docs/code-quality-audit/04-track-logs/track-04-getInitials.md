# Track T04 — inline initials → getInitials

Commit: `04f1763`

Three pages computed avatar fallback initials inline with ad-hoc
slice() expressions. Routed all three through `getInitials` from
`src/lib/utils/initials.ts`.

Behavior nuance: for a multi-word displayName, `getInitials` produces
"first letters of first two words" ("Alice Bob" -> "Ab"), where the
inline version on `settings/edit-profile/page.tsx` was returning the
first two letters of the first word ("Al"). The multi-word output is
the intended behavior per the helper's contract; the inline version was
the regression. Single-word displayNames unchanged.

Files (3): `src/app/settings/edit-profile/page.tsx`,
`src/app/groups/page.tsx`,
`src/app/groups/[groupDid]/edit-profile/page.tsx`.

Diff: -10/+9.

Verification: all four gates passed.
