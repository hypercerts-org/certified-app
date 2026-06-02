# Track T07 — relocate use-layout-breakpoints

Commit: `a4c1647`

`src/lib/hooks/use-layout-breakpoints.ts` was the only file under
`src/lib/hooks/`, while the other 46 hooks live in `src/hooks/`.

`git mv` to the canonical path and updated four importers:

- `src/components/ui/feedback-modal.tsx`
- `src/components/layout/bottom-nav.tsx`
- `src/components/layout/navbar.tsx`
- `src/hooks/use-bottom-sheet-drag.ts`

The empty `src/lib/hooks/` directory left over from the rename was
removed (`rmdir`) but it's not tracked by git so the cleanup is local-FS
only.

Files: 5 (1 rename + 4 import updates). Diff: +4/-4.

Verification: all four gates passed.
