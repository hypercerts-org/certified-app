# Plan Review — Round 1

One reviewer, plan-correctness lens. Single question: does the proposed fix actually close the bug at the right layer, or is it papering over a deeper issue?

## Items raised

### R1. Is CSS `display: none` the right layer, or should the SSR default flip?

**Raised.** The alternative ("just flip `SSR_DEFAULT.isDesktop` to `true`") was considered in the discovery doc. Confirming the plan's reasoning holds:

- Flipping the default would trade a desktop-loading flash for a **mobile-loading flash**, because every mobile browser would render the empty (no-bottom-nav) shell first, then mount the bar after hydration.
- Most users are on mobile. Optimizing the loading state for the larger audience and using CSS to fix desktop is correct.
- The hook's own docstring states the design intent: "the only desktop-side pop on hydration is components disappearing, which is the safer direction." Flipping the default would reverse that intent, with no other benefit.

**Decision: Accepted (no change).** Keep the CSS approach. The SSR default stays at `isDesktop: false`.

### R2. Does the CSS rule actually win the cascade against the existing `.bottom-nav` rule?

**Raised.** The current `.bottom-nav` rule (layout.css line 473-483) sets `position: fixed; bottom: 0; left: 0; right: 0; ...` but does not set `display`. Default `display` for `<nav>` is `block`. Adding `@media (min-width: 800px) { .bottom-nav { display: none } }` lower in the file (same specificity, but later in source order, and gated on the media query) will win at >=800px. Confirmed by re-reading the cascade rules and noting how `.navbar`'s analogous rule at line 715-718 works the same way and is empirically correct.

**Decision: Accepted (no change).** Approach is sound.

### R3. Does hiding via CSS interact badly with the JS guard?

**Raised.** Both guards would be active at >=800px: CSS sets `display: none`, JS returns `null`. After hydration, the JS guard wins (the element is unmounted entirely; CSS is moot for an unmounted node). Before hydration, the CSS guard wins (`display: none` on an existing element). They don't conflict — one is a strict superset of the other during their respective windows.

**Decision: Accepted (no change).** Belt-and-suspenders is fine here. The plan correctly notes the JS guard remains load-bearing for tab order.

### R4. Should the fix be moved out of CSS into the React layer (e.g. `dynamic` import with `ssr: false`)?

**Raised.** `next/dynamic({ ssr: false })` would also prevent the SSR render. But it introduces a runtime cost (the component bundle loads lazily) and a layout-shift cost (the bar pops in on mobile after JS arrives — exactly the regression we rejected in R1). CSS is strictly cheaper at runtime and doesn't change mobile behavior.

**Decision: Rejected.** CSS is the cheapest correct fix.

### R5. Are there other components with the same hydration leak that should be fixed in this PR?

**Raised.** Audit:

- `.navbar` — already has `@media (min-width: 800px) { display: none }` (line 715-718). OK.
- `.desktop-top-bar` — already opt-in via `display: none` default + `display: flex` at >=800px (line 1918-1928). OK.
- `MobileSidebar` — only renders when its parent (`navbar`) renders, and the parent's CSS rule hides the whole subtree. OK.
- Hamburger button — same, lives inside `.navbar`. OK.
- Rails — explicitly designed to be CSS-mountable (no JS gate). OK.

The only stragglers are the bottom nav itself. Scope of this PR is correct as-is.

**Decision: Accepted (no scope expansion).**

### R6. Will the CSS rule fight an !important rule from a third party or theme?

**Raised.** No `!important` is used anywhere in `layout.css` or `tokens.css` for bottom-nav-related rules. Nothing else in the codebase styles `.bottom-nav`. Safe.

**Decision: Accepted (no change).**

### R7. Does the existing `--bottom-nav-height: 0px` override at >=800px conflict?

**Raised.** No — that override (tokens.css line 156-160) is for the `--bottom-nav-height` CSS variable, which is consumed by `.app-shell__content`'s `padding-bottom` to reclaim layout space (line 746). It's orthogonal to whether the bar itself paints. Both rules can and should coexist.

**Decision: Accepted (no change).**

### R8. Should the stale comment in `layout.css` line 537 be updated?

**Raised.** Yes — the comment "Bottom nav is visible on all viewports - same navigation on mobile and desktop." is wrong post-desktop-redesign and actively misleading to future maintainers reading the file. The plan already accounts for refreshing it as part of the same diff.

**Decision: Accepted (already in plan).**

## Summary

8 items raised, 7 accepted with no plan change, 1 rejected. Plan is implementation-ready. Proceed to branch + implement.
