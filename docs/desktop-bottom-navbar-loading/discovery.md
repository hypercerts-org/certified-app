# Discovery — desktop bottom navbar leak during loading

## Symptom

> "On desktop, when a page is loading I see the bottom navbar that shouldn't be there on desktop."

The mobile bottom navigation flashes at the bottom of the viewport on desktop during initial page load and route transitions, before disappearing once React hydrates.

## Root cause

`src/components/layout/bottom-nav.tsx` is responsible for unmounting itself on desktop. It does this via a JS hook:

```ts
const { isDesktop } = useLayoutBreakpoints();
// Unmount at >=800px - the left rail is the primary nav on desktop and
// bottom-nav's focusable buttons would compete for tab order.
if (isDesktop) return null;
```

`useLayoutBreakpoints` (`src/lib/hooks/use-layout-breakpoints.ts`) returns the SSR default `{ isDesktop: false, ... }` on the server and on the first client render, then reconciles to the real viewport in a `useEffect`:

```ts
const SSR_DEFAULT: LayoutBreakpoints = {
  isDesktop: false,
  hasRightRail: false,
  isFullDesktop: false,
};

export function useLayoutBreakpoints(): LayoutBreakpoints {
  const [bp, setBp] = useState<LayoutBreakpoints>(SSR_DEFAULT);
  useEffect(() => {
    setBp(compute());
    // ...
  }, []);
  return bp;
}
```

Consequence: SSR HTML and the first hydration render both contain `<nav class="bottom-nav">...</nav>`. On a desktop browser, this is **visible** at first paint and remains visible until the first post-hydration effect tick replaces it with `null`. During that window (which can be a noticeable fraction of a second on slower devices, slow networks, or under React work backpressure), the mobile bottom nav is painted across the bottom of the desktop viewport. The same gap reopens momentarily during route transitions where suspense boundaries cause re-renders.

The hook docstring itself acknowledges the trade-off: "the only desktop-side pop on hydration is components disappearing, which is the safer direction." That comment is correct in the abstract (a desktop user briefly seeing mobile chrome is less disruptive than a mobile user briefly seeing desktop chrome) but doesn't make the flash invisible — it's exactly the bug being reported.

### Why bottom-nav, but not navbar or desktop-top-bar?

Looking at the parallel components, the *other* responsive-chrome components have a CSS layer that hides them before JS runs:

- `src/app/styles/layout.css` line 715-722 has `@media (min-width: 800px) { .navbar { display: none; } ... }`. So the mobile navbar (which uses the same `if (isDesktop) return null` pattern in `src/components/layout/navbar.tsx` line 200) is invisible on desktop at first paint even though the JS hasn't unmounted it yet.
- `.desktop-top-bar` (line 1918-1928) is the opposite case: `display: none` by default, `display: flex` only at `@media (min-width: 800px)`. There's also a `Suspense` fallback in `src/app/layout.tsx` line 158 that reserves the row-1 height with `<div class="desktop-top-bar desktop-top-bar--placeholder" />` so first paint doesn't jump.

`.bottom-nav` has **no `@media` rule that hides it on desktop** anywhere in `layout.css` or `tokens.css`. The only desktop-aware CSS for it is `--bottom-nav-height: 0px` at `min-width: 800px` (tokens.css line 156-160), which only zeroes the spacer-variable consumers; it doesn't hide the bar itself, which is `position: fixed` and sizes from its own children. This was deliberate per the comment ("Bottom nav is visible on all viewports - same navigation on mobile and desktop." - layout.css line 537), but it's stale: bottom-nav is now mobile-only after the desktop-layout redesign, and the JS-gated unmount is the only thing keeping it off desktop.

### Verification

- `grep -n "@media" src/app/styles/layout.css | grep -B1 -A2 "bottom-nav"` returns nothing.
- The component file unconditionally renders the `<nav class="bottom-nav">...</nav>` tree on the first render (when `useState(SSR_DEFAULT)` is still in effect), which is what gets serialized to SSR HTML.
- Cross-check: visiting a route fresh in a desktop browser, the SSR HTML payload contains the rendered bottom-nav (would need a live deploy to literally view, but the code path is deterministic).

## Layer of fix

The right fix is the same layer the other components use: a CSS media query in `src/app/styles/layout.css` that sets `.bottom-nav { display: none }` at `@media (min-width: 800px)`. This is a one-line CSS change that:

1. **Closes the bug at the root paint layer.** The bar never paints on desktop, even before any JS runs. No flash, no hydration race.
2. **Symmetric with the rest of the responsive chrome.** Mirrors the pattern at `.navbar` (line 716-718) and the inverse pattern at `.desktop-top-bar` (line 1918-1928).
3. **Does NOT replace the JS unmount.** The existing `if (isDesktop) return null` stays — it still serves its stated purpose of pulling the focusable buttons out of the tab order on desktop. CSS `display: none` would also remove them from focus, so this is belt-and-suspenders, but the JS guard is the load-bearing one for tab-order semantics and the CSS guard is the load-bearing one for first-paint correctness.
4. **No mobile regression.** The new rule is gated on `min-width: 800px`, which has no effect below the breakpoint.

A leaner alternative would be to change `SSR_DEFAULT.isDesktop` to `true`, which flips the SSR default. That fixes desktop loading but **regresses mobile loading** — every mobile device would see the bottom nav disappear and reappear on hydration. The hook's existing comment ("the only desktop-side pop on hydration is components disappearing, which is the safer direction") is exactly the reason not to do that. The CSS rule is strictly better because it doesn't trade one flash for another.

A third alternative would be to wrap `<BottomNav />` in `<Suspense>` with a placeholder, mirroring `<DesktopTopBar />`. But `<BottomNav />` doesn't need Suspense — it doesn't use `useSearchParams`, and there's nothing async to wait for. Adding Suspense here would be cargo-culted complexity. CSS is the right tool.

## Other layouts to check

Searched for all places that render `<BottomNav>` or similar bottom navigation:

- `src/app/layout.tsx` line 164: single `<BottomNav />` mount, sibling to `<main>` (root layout). This is the only mount point in the codebase.
- No route-segment `loading.tsx` files render their own bottom nav (none of the `loading.tsx` files in `/feed`, `/notifications`, etc. import `BottomNav`).
- No other component renders `<nav class="bottom-nav">` directly — the class is only emitted by `bottom-nav.tsx`.

Conclusion: a single CSS rule fixes every page. No per-route loading state needs to change.

## Out of scope

- The stale comment in `layout.css` line 537 ("Bottom nav is visible on all viewports") will be updated as part of the fix to reflect the new mobile-only contract. Not a separate change.
- The `SSR_DEFAULT.isDesktop = false` behavior in `use-layout-breakpoints.ts` is left as-is. Other consumers of the hook (e.g. the mobile sidebar mount logic in `navbar.tsx`) depend on it.
- No other responsive components are audited or modified. Scope is the desktop loading flash of the bottom nav only.
