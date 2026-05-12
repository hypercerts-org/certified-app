# Review round 1 — desktop-layout

Four reviewers ran in parallel against `plan.md`:

- **R-Arch** (responsiveness, breakpoint cascade, hook design, SSR) → `ship-then-fix-nits`
- **R-IA** (information architecture, product fit) → `ship-then-fix-nits`
- **R-DesignFid** (visual language match against `DESIGN.md`) → **`block`**
- **R-Regression** (mobile-untouched promise, regression surface) → `ship-then-fix-nits`

R-DesignFid's block is substantive, not procedural: the plan as drafted would ship a "Twitter chrome pasted on" feel because (i) the width math fights `DESIGN.md`'s whitespace philosophy and (ii) "filled icon for active state" violates an explicit `DESIGN.md` Do-Don't. Both are addressable in plan revisions; once integrated, R-DesignFid's verdict moves to ship.

## Accepted

| # | Source | Severity | Item | Action |
|---|---|---|---|---|
| **Brand fidelity (R-DesignFid blockers + nits)** ||||
| A1 | DesignFid C1 | **Critical** | Width math: 240+720+300=1260 + gaps leaves zero outer gutter at 1300; the 720px center feels bloated when flanked. | Center column = **600px** (matches bsky's 600). New math 240+600+300=1140; ~80px outer gutter at 1300. Apply across plan + acceptance criteria. |
| A2 | DesignFid C2 | **Critical** | "Filled/outlined icon pair for active state" violates `DESIGN.md`: stroke icons only, active = heavier stroke. Single biggest "pasted-on Twitter" tell. | Active-state recipe: keep existing `strokeWidth={active ? 2.5 : 1.5}` swap. Label color `--fg-muted → --fg-primary`, weight 400 → 600. No fills. No background-tint pill behind active rows. |
| A3 | DesignFid I3 | Important | Rail typography unspecified; risk of inventing a third type role. There is no "mono brand face" — only Inter (chrome) + Noto Serif (content). | Rail labels: **Inter `0.875rem / 500 / -0.005em`** (matches body-small in DESIGN type scale). Serif is reserved for content; rail is chrome. |
| A4 | DesignFid I4 | Important | Rail color tokens unspecified. Implementer will reach for `--bg-elevated` and rails will look like cards. | Rail surface = **`--bg-canvas`** (NOT `--bg-elevated`); rails are chrome, not cards. Hairline divider rail↔center = `--border-subtle`. Hover = `--overlay-weak`. Active text = `--fg-primary`; inactive = `--fg-secondary` (NOT `--fg-muted` — muted is for timestamps). |
| A5 | DesignFid I5 | Important | "Primary" Create button is ambiguous — risk of FAB/pill mismatch. | Full-width primary button, **2px radius** (NOT 999/pill), Inter 500, tracking-wider, `--btn-primary-bg`. Icon-only collapsed: **44px square primary**, NOT a circular FAB. |
| A6 | DesignFid I6 | Important | 56px rail rows are "phone-app stretched." | **48px row height** (mouse targets, not thumb). Padding 12px vertical / 16px horizontal (label mode) / center-aligned (icon-only mode). Gap 12px icon↔label. |
| A7 | DesignFid I7 | Important | Right-rail cards default to bordered `.app-card` style — boxed-rail look. | Use **`.feed-card` pattern** (no border; hairline `--border-subtle` between items; 16px vertical padding). No bordered cards in rails. |
| A8 | DesignFid I8 | Important | Right-rail search risk of becoming pill-shaped Twitter signature. | Reuse the existing `<Input>` component as-is: 44px height, **2px radius**, `--bg-elevated`, `--border-default`. No pill. |
| A9 | DesignFid I9 | Important | Center-column full-bleed profile banner becomes ~600×180 (near square) — reads as a card, not a hero. | **Option B**: shrink banner height to **120px at ≥800px** to preserve panoramic aspect. Banner remains center-column-bleed, not viewport-bleed. (Simpler than overlap; matches trimmer rail aesthetic.) |
| A10 | DesignFid N10 | Nit | "Profile card at top of left rail" is bsky-shaped (verbose). | Account-switcher trigger = minimal **avatar + handle + chevron at bottom of left rail** (above the Create button is fine too; just not a verbose card with stats/role garnish). |
| A11 | DesignFid N11 | Nit | Brandmark in rail risks looking small in 240px column. | **Brandmark stays in navbar** (current position). Reject IA N1's "top-of-rail" proposal (R-IA's reasoning was bsky-parity; R-DesignFid's reasoning of identity-anchor is stronger here). |
| A12 | DesignFid N12 | Nit | Notification count badges must inherit `tnum`. | Spec it in implementation; bottom-nav's badge styling already uses it — match. |
| **Information architecture (R-IA)** ||||
| A13 | IA C1 | **Critical** | Rail item ordering: `Endorsements` is the product's defining noun; surface above Groups. `/connected-apps` is a primary AT-Proto concept with no current home. | New rail order: **Home, Explore, Endorsements, Notifications, Groups, Profile, Settings**. Surface `/connected-apps` as a Profile sub-link (or in account-switcher menu — defer to impl review). Don't leave the route orphaned. |
| A14 | IA C2 | **Critical** | "Suggested evaluators" is the wrong primary right-rail hook — evaluators are a filter input, not an engagement entity. | Right rail MVP: (1) **Search** sticky top; (2) **Suggested people to endorse** — handles in network not yet endorsed (engagement hook tied to the product verb); (3) **Suggested groups to join**; (4) Footer. Drop "suggested evaluators" entirely; recent-endorsements-in-network is a follow-up. |
| A15 | IA I1 | Important | "Create" button label is generic; bsky/x both name the primary noun. | Label = **"New activity"** (route stays `/create`). Endorsements are created from someone else's profile/card — not a rail button. |
| A16 | IA I2 | Important | Logged-out left rail unaddressed. | **Slimmed rail when unauthenticated**: Home, Explore, About, plus a "Sign in / Create account" CTA card in place of the profile trigger. Legal pages (`/about`, `/terms`, `/privacy`, `/dsa`, `/imprint`) keep the slim rail — not single-column. |
| A17 | IA I3 | Important | Profile card on rail must handle the active-org switch (mobile-sidebar already does). | Account-switcher trigger reads `useOrg().activeOrg` and swaps avatar/name/handle. Add to file-ownership notes for `desktop-left-rail.tsx`. |
| A18 | IA I4 | Important | Feedback in footer is a `<button>` opening a modal — not a route. | Spec footer "Feedback" as a button styled like the surrounding links (no `<Link>`). Triggers `useFeedback().openFeedback()`. |
| A19 | IA N2 | Nit | Mobile-sidebar legal links and right-rail footer must not drift. | Audit and align: mobile-sidebar currently has About/Terms/Privacy/Imprint (no DSA). Add DSA to mobile-sidebar in this PR so both surfaces match. |
| A20 | IA N3 | Nit | Activity detail routes are content, not nav. | Explicitly state: `/activity/[did]/[rkey]` and `/activity/[did]` are NOT in the rail; they surface via Profile and feed cards. Future readers should not re-litigate. |
| A21 | IA N4 | Nit | Profile pages keep rails. | Confirmed in plan; make explicit. |
| A22 | IA N5 | Nit | DID/identity is the platform's USP but doesn't need a rail slot. | No "DID" or "Identity" nav item. Identity surfaces via handle display + account switcher + `/connected-apps`. |
| **Architecture (R-Arch)** ||||
| A23 | Arch I1 | Important | The existing **769px** CSS rules collide with the new 800/1100/1300 cascade. iPad portrait (768) sits on the seam. | Collapse the existing 769px rules to **800px**. Document a single token table in `tokens.css` (`--bp-gt-mobile: 800`, `--bp-gt-narrow-desktop: 1100`, `--bp-gt-desktop: 1300`). Hook reads the same numbers. One source of truth. |
| A24 | Arch I2 + I3 (cross-ref Regression I3) | Important | Hook scope creep risks SSR flash. Most responsive behavior can be CSS-only. | **Hook scope, narrowed**: gates mount/unmount of `<BottomNav>`, `<MobileSidebar>`, and the hamburger button only (these have focusable/portal content that must not exist at ≥800px for a11y). Rails mount unconditionally; CSS `@media (min-width: 800px) { .left-rail { display: block } }` controls visibility — first paint is correct without JS. |
| A25 | Arch I3 | Nit | `.app-shell--fullbleed` toggling padding/max-width on `.app-shell__content` conflicts with grid orchestration. | Rename: **`.app-shell__center`** (always-present grid cell) wraps **`.app-shell__content`** (reading-width container). Fullbleed operates on `.app-shell__content` inside the cell. |
| A26 | Arch I5 (superseded by I2/I3 + Regression I3) | Important | Cookie-SSR was proposed to fix flash — but if rails are CSS-mountable (A24), cookie-SSR is moot. | **Drop cookie-SSR.** CSS-only mount via media query gives first-paint correctness without server-side state. Simpler. |
| A27 | Arch I7 (overlaps Regression N2/N3) | Important | Three raw `<=768` checks need centralization or explicit decision: `feedback-modal.tsx:37`, `navbar.tsx:84`, `use-bottom-sheet-drag.ts:39, 55`. | Migrate all three to the new hook. **Threshold decision**: these are all mobile-affordance / bottom-sheet behaviors — the right semantic cutover is the same 800 boundary. Documented mobile-behavior change at 769–799 (iPad portrait stays mobile; iPad-landscape-foldable widths now use desktop sheets/dropdowns). Call it out in PR body. |
| A28 | Arch I8 | Important | Z-index map is vague. | **Pin the map** (insert as table in plan): page 0, sticky-in-rail 10, rails 30, navbar 50, bottom-sheet/sidebar portals 60, modals 100, toast/skip-nav 9999. Rails at 30 (below navbar 50). |
| A29 | Arch I9 | Nit | At 1100px: 720 + 86 + 250 = 1056, leaving 44px outer margin — cramped. With A1's 600px center: 600 + 86 + 250 = 936, fine at 1100. | Verified by A1's narrower center. Right-rail breakpoint stays at **1100**. Update arithmetic notes in plan. |
| A30 | Arch I10 | Important | Splitting "left rail" from "right rail" ships an asymmetric desktop to staging. | **Repartition** to: **PR1** = foundation (hook, z-index map, CSS-mountable rail scaffolding, bottom-nav/mobile-sidebar/hamburger unmount, `<=768` centralization, `--bottom-nav-height` override); **PR2** = left rail + right rail + profile banner + `DESIGN.md` update. No intermediate asymmetric state. |
| **Regression (R-Regression)** ||||
| A31 | Regression I1 | Important | Account-switcher 769–799px gap: moving everyone to 800 silently changes mobile sheet behavior at iPad-portrait/foldable widths. | Migrate to 800 deliberately (per A27); call out the mobile behavior change in PR body and `DESIGN.md` update. (Alternative — split 768 sheet trigger vs 800 layout trigger — is rejected; one threshold is cleaner.) |
| A32 | Regression I2 | Important | `--bottom-nav-height` consumed in `.app-shell__content` padding-bottom; needs CSS-only zeroing at desktop. | Override at `:root` via media query: `@media (min-width: 800px) { :root { --bottom-nav-height: 0px } }`. No JS dependency. |
| A33 | Regression I3 | Important | Hydration flash is layout-thrash, not "small flash," since rails are new DOM. | Resolved by A24: rails mount unconditionally, CSS gates visibility. First paint correct. |
| A34 | Regression I4 | Important | Hamburger state machine: `dropdownOpen=true` set at 600px persists if user resizes to 1000px. | Add a resize-effect in `navbar.tsx` that clears `dropdownOpen` and `switcherOpen` on crossing the 800 boundary. ~3 lines. |
| A35 | Regression N4 | Nit | Z-index pinned per A28 — explicit values, including bottom-sheet portal (60), feedback modal (10000+). | Captured. |
| A36 | Regression N5 | Nit | Add one minimal smoke script for matchMedia mock + width assertions. | **Optional**: `tsx scripts/layout-breakpoint-smoke.ts` rendering `<AppShell>` at three widths with `matchMedia` mocked, asserting rail mount + bottom-nav hidden. ~30 lines. Catches stale-state regressions on future edits. Mark optional since `tests/` has no runner. |

## Rejected

| # | Source | Severity | Item | Rationale |
|---|---|---|---|---|
| Z1 | IA N1 | Nit | "Brandmark belongs top-of-left-rail" (R-IA) | Overridden by R-DesignFid N11: brandmark in 240px rail column looks small/lost; demoting from navbar weakens identity. Keep current placement. |
| Z2 | Arch I4 | Nit | "Both bottom-nav and mobile-sidebar should JS-unmount for a11y" | Resolved differently by A24: with CSS-mountable rails + JS-unmount for BottomNav/MobileSidebar/hamburger, the principle ("focusable content gets unmounted, decorative chrome gets CSS-hidden") holds. The dichotomy was never really wrong. |
| Z3 | Arch N9-N11 (various confirmations) | — | "Verified safe" / "Already correct" findings | No action; captured as plan annotations where relevant. |
| Z4 | Regression N6, N7 | — | Bottom-nav consumer audit / modal positioning safety confirmations | No action; captured as plan annotations. |

## Round 2?

Per the workflow rule: ≥5 substantive items → round 2 warranted. Round 1 surfaced **2 Critical + 16 Important = 18 substantive items**. Well above threshold.

Plan to integrate all 36 accepted items into `plan.md` now, then run a focused round 2 pass against the post-integration state. Round 2 should:

1. Re-evaluate the **two rejected items** (Z1, Z2) under the new shape — are they still rejected?
2. Verify the integration didn't introduce contradictions (Arch's A24 + Regression's A33 are co-dependent — confirm the integrated text is coherent).
3. Re-check **R-DesignFid**'s verdict — does it flip from `block` to `ship` after A1/A2 land?
4. Final pass on the PR split (A30) given the integrated complexity.

Expected: small number of nits, maybe one Important item I missed.
