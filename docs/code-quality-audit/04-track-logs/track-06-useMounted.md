# Track T06 — extract useMounted hook

Commit: `c0a5385`

Three layout components (mobile-sidebar, desktop-left-rail, desktop-top-bar)
each open-coded the canonical "client-only after first paint" boilerplate:

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

Extracted to `src/hooks/use-mounted.ts` as a single-line consumer.

Files: ADD `src/hooks/use-mounted.ts`;
       EDIT `mobile-sidebar.tsx`, `desktop-left-rail.tsx`, `desktop-top-bar.tsx`.

Diff: +33/-7 across 4 files.

Side benefit: one pre-existing `react-hooks/set-state-in-effect` lint
warning in mobile-sidebar evaporated because the explicit useEffect form
went away. Baseline lint warning count fell 56 -> 55.

Verification: all four gates passed (lint improved by 1).
