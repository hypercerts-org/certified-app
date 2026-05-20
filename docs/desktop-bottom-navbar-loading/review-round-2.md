# Implementation Review — Round 2

One reviewer, general-purpose lens. The diff is a single 9-line CSS addition plus a comment refresh in `src/app/styles/layout.css`. Three review questions per the workflow spec:

1. Does this fix work for the desktop loading-state case?
2. Does it regress mobile?
3. Are there other layouts that need the same change?

## Items raised

### R1. Does the CSS actually paint before JS on desktop?

**Verified.** The new media query block is included in the built CSS bundle (confirmed via `grep '@media (min-width:800px){.bottom-nav{display:none}'` against `.next/static/chunks/*.css` after `npm run build`). Next.js serves CSS in `<link rel="stylesheet">` tags in the document head, which the browser blocks rendering on before first paint. Therefore the rule is applied to `.bottom-nav` from the very first paint of the SSR HTML on desktop — strictly before any JS evaluates. Bug closed at the right layer.

**Decision: Accepted (no change).**

### R2. Does it regress mobile?

**Verified.** The media query is `min-width: 800px`. At any viewport width <800px, the rule does not match, and `.bottom-nav` keeps its default `display: block` (inherited from its `<nav>` tag default). Mobile rendering is byte-identical to before the change.

The component's existing `if (isDesktop) return null` JS guard also stays untouched, so the React tree is unchanged on mobile.

**Decision: Accepted (no change).**

### R3. Are there other layouts that need the same change?

**Verified.** Exhaustive check:

- `find src -name "loading.tsx"` returns **zero results**. The app does not use route-segment loading files, so there is no per-route loading state to fix.
- `grep -rn "bottom-nav" src/` confirms the class is only emitted by `src/components/layout/bottom-nav.tsx`, and `<BottomNav />` is only mounted once, in `src/app/layout.tsx` line 164 (root layout).
- The other desktop-only / mobile-only chrome (`.navbar`, `.desktop-top-bar`, rails, mobile sidebar, hamburger) is already correct at the CSS layer (see discovery doc audit and plan-review R5). Nothing else needs the same change.

**Decision: Accepted (no scope expansion).**

### R4. Could `display: none` interfere with screen-reader announcements during loading?

**Raised.** `display: none` removes the element from both visual rendering and the accessibility tree. At >=800px the element is also fully unmounted by React after hydration, so the accessibility tree is correct steady-state. During the pre-hydration window we want screen readers to **not** announce mobile-only nav items as available on desktop — `display: none` is the correct semantics here. Same approach as the existing `.navbar { display: none }` rule.

**Decision: Accepted (no change).**

### R5. Is there a risk that a future component mounts `.bottom-nav` inside a different desktop-allowed surface (e.g. an iframe or modal)?

**Raised.** Hypothetically, if someone adds a new component that reuses the `.bottom-nav` class for unrelated visuals on desktop, our blanket `display: none` would unintentionally hide it. The class name is BEM-prefixed (`bottom-nav`, `bottom-nav__inner`, etc.) and there's only one consumer, so this is theoretical. If it ever becomes a real concern, the rule can be tightened to `body > .bottom-nav` or scoped via a parent selector. Not worth doing pre-emptively.

**Decision: Rejected (not worth complexity).**

### R6. The comment refresh on line 537 — is the cross-reference to line numbers (~716 / ~1918) stable?

**Raised.** Line numbers in long CSS files drift as the file grows. The comment uses `~` ("approximately") to flag that they're hints, not exact. The class names (`.navbar`, `.desktop-top-bar`) are stable and grep-friendly, so a maintainer can always re-find the rules. Acceptable.

**Decision: Accepted (no change).**

### R7. Local verification — was the baseline correctly captured?

**Verified.** `npx tsc --noEmit` returns **0 lines of output** (zero errors) both before and after the change. `npm run lint` shows 37 warnings, 0 errors — all of which exist in files not touched by this PR (`use-layout-breakpoints.ts`, `notifications-context.tsx`, etc.), so by definition pre-existing. `npm run build` succeeds with the example `.env.local` (the env-required modules now load with the dev defaults from `.env.local.example`).

**Decision: Accepted (no change).**

## Summary

7 items raised, 6 accepted with no change, 1 rejected. No follow-up commits needed — the implementation is correct as-is. Stop reviewing. Push and open the Draft PR.
