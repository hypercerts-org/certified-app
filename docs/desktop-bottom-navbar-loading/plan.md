# Plan — hide bottom navbar on desktop via CSS, not just JS

Status: Plan-review-ready.

## Problem

On desktop (>=800px viewport), the mobile bottom navigation flashes at the bottom of the page during initial load and route transitions before being unmounted by client-side JS. See `discovery.md` for the full trace; the short version is:

- `BottomNav` decides desktop-vs-mobile via `useLayoutBreakpoints()`, whose SSR default is `isDesktop: false`.
- SSR HTML and the first hydration render therefore include `<nav class="bottom-nav">`.
- There is **no CSS rule** hiding `.bottom-nav` at desktop widths (unlike `.navbar`, which has `@media (min-width: 800px) { display: none }`).
- Result: the bar paints on desktop until the first `useEffect` tick replaces it with `null`.

## Goal

Make the desktop loading state visually correct: no bottom nav painted at any time on viewports >=800px.

## Non-goal

- Do not change the SSR default or any other consumer of `useLayoutBreakpoints`. The mobile-default behavior of that hook is load-bearing for other components (e.g. mobile sidebar).
- Do not refactor `BottomNav` to drop the JS unmount. The early-return is still doing useful work — pulling focusable buttons out of the tab order on desktop. CSS-only would also remove them from focus, but the JS guard is the load-bearing one for tab semantics; keep both.
- Do not introduce Suspense around `BottomNav`. It has nothing async to wait for.

## Files touched

| File | Change |
|---|---|
| `src/app/styles/layout.css` | Add `@media (min-width: 800px) { .bottom-nav { display: none } }`. Update the stale comment on line 537 that claims the bottom nav is visible on all viewports. |

That is the entire diff. One file, one new CSS rule, one comment refresh.

## Chosen fix (concrete diff)

In `src/app/styles/layout.css`, near the bottom-nav block (after line 535), replace the stale comment with a new media query:

```css
/* Bottom nav is mobile-only chrome (<800px). On desktop the left rail /
   top bar host navigation, and the bar is hidden via CSS here so first
   paint is correct even before JS hydrates and the component's own
   `if (isDesktop) return null` runs. Mirrors the inverse pattern on
   .desktop-top-bar (line ~1918) and the matching rule on .navbar
   (line ~715). */
@media (min-width: 800px) {
  .bottom-nav {
    display: none;
  }
}
```

The JS guard in `src/components/layout/bottom-nav.tsx` stays untouched — it's the load-bearing rule for focus/tab order on desktop after hydration.

## Acceptance criteria

1. On a fresh desktop page load (>=800px viewport), the bottom nav is **never** painted at any point — not during SSR, not during hydration, not during route transitions.
2. On mobile (<800px), the bottom nav still renders identically to today. No flicker, no missing items, no layout shift.
3. Resizing the browser across the 800px breakpoint behaves the same as today (CSS toggles visibility immediately; JS still unmounts/mounts on the matching tick).
4. No new TypeScript errors. No new ESLint warnings. `npm run build` still succeeds.
5. The new CSS rule is colocated with the existing `.bottom-nav` block in `layout.css` for findability, with a comment that cross-references the symmetric `.navbar` and `.desktop-top-bar` rules.

## Verification plan

Before opening the PR:

1. Capture tsc baseline error count before the change so any new error stands out.
2. `npm run lint` — must pass.
3. `npx tsc --noEmit` — must show no new errors.
4. `npm run build` — must succeed.
5. Read-through smoke test: open the rendered HTML in a desktop viewport (mentally, via the SSR pathway) and confirm `.bottom-nav` is `display: none`. The CSS rule should also be in the built CSS bundle.

## Rollback plan

Single-commit revert of the CSS change. No data migration, no schema change, no user-visible state to roll back.

## Out of scope

- No changes to `bottom-nav.tsx`, `use-layout-breakpoints.ts`, or any other component.
- No changes to the mobile navbar, desktop top bar, or rails.
- No changes to `tokens.css` (the existing `--bottom-nav-height: 0px` override at >=800px stays as-is — it serves a different purpose, namely zeroing the spacer that the content padding consumes).
- No design or copy changes.
