# Plan — proper desktop layout (bsky/x-style three-column shell)

Status: **Post-review-round-2 — implementation-ready.** Round 1: 36 items accepted (2 Critical + 16 Important + nits), 4 rejected. Round 2: 2 Important + 4 nits accepted; R-DesignFid's `block` verdict flipped to `ship` once A1/A2 (600px center, no-fills active state) landed. Below the substantive-item threshold for a round 3. See `review-round-{1,2}.md` for accept/reject decisions.

## Problem

The app is mobile-first by intent and stays single-column at every viewport. Top navbar (64px) + bottom nav (56px) + drawer sidebar; content column capped at 720px on every device. `DESIGN.md` explicitly mandates this. At ≥1100px screens the layout wastes horizontal real estate and feels identical to mobile — which is now an explicit problem we're solving by user direction.

## Reference patterns

bsky.app and x.com converge on a **three-column shell** with the same cascade. From bsky source (`src/alf/breakpoints.ts`):

| Flag | Pixel rule | What it controls |
|---|---|---|
| `gtPhone` | ≥ 500 | (irrelevant for our cascade) |
| `gtMobile` | ≥ 800 | desktop layout begins (left rail visible) |
| `leftNavMinimal` | ≤ 1300 | left rail icon-only (86px) |
| `rightNavVisible` | ≥ 1100 | right rail mounted |
| `centerColumnOffset` | 1100–1299 | center shifts to balance the right rail |
| `gtTablet` | ≥ 1300 | left rail expands to icon+label (240px); right rail full (300px) |

bsky's left rail: Home, Explore, Notifications, Chat, Feeds, Lists, Saved, Profile, Settings, **+ a prominent "New post"**. bsky's right rail: search (sticky), feed selections, progress guide, live events, trending topics, footer links. Both keep the **center column ~600px** — same width as mobile, just *flanked* rather than stretched.

## Goal

Add a desktop shell that:

1. Replaces hamburger + bottom-nav with a **persistent left rail** above 800px.
2. Mounts a **right rail** above 1100px with search + suggested-people-to-endorse + suggested-groups + footer.
3. **Narrows** the center column to **600px** on desktop (matching bsky; A1).
4. Cascades through bsky's thresholds (800 / 1100 / 1300), reusing one source of truth.
5. **Doesn't regress mobile** — at <800px the experience is byte-identical to today, except the centralization of three `window.innerWidth <= 768` checks on the new 800 boundary, which is a documented mobile behavior change at iPad-landscape/foldable widths (see A27/A31).
6. Stays visually of-a-piece with `DESIGN.md`: no fills on Lucide icons, stroke-weight swap for active state, no pill search bars, no bordered rail cards, brandmark in navbar (not in rail).

## Scope decisions

### Decision 1 — Override `DESIGN.md`? → **YES** (user directive)

`DESIGN.md`'s "no sidebar, single column at every viewport" rule was the previous product stance. User has reversed it. **PR2** updates `DESIGN.md` with a new paragraph: single-column center stays on mobile and as a reading-width spine on desktop; rails are additive context. Without the update, future contributors will revert the rails citing the old doc.

### Decision 2 — Right-rail content (A14)

MVP rail, top-to-bottom:

1. **Search input** (sticky at top; reuses existing `<Input>` — 44px, 2px radius, `--bg-elevated`, `--border-default`; A8). On `/search` itself the search input is hidden (already on the search page).
2. **Suggested people to endorse** — handles in the user's network they haven't endorsed yet. Engagement hook tied to the product's defining verb. `.feed-card` pattern (no border, hairline `--border-subtle` between items, 16px vertical padding; A7).
3. **Suggested groups to join** — pulls from `/groups` data. Same `.feed-card` treatment.
4. **Footer** — single tidy inline line (NOT vertical stack): `About · Terms · Privacy · DSA · Imprint · Feedback`. Feedback is a `<button>` opening the existing modal (A18), styled visually identical to the surrounding `<Link>`s. Color `--fg-muted`, 0.75rem / 500.

**Out of MVP**: trending topics, recent-endorsements-in-network, live-events banner — all deferred to follow-ups.

### Decision 3 — Promote a primary action to the left rail (A15)

Yes. **"New activity"** button at the bottom of the left rail. Route: `/create` (existing). Full-width primary button when rail is icon+label (240px); 44px **square** primary when rail is icon-only — NOT a circular FAB (A5). 2px radius matching the rest of the brand's button system.

Endorsements are created from someone else's profile/activity card (not from `/create`), so the rail button is unambiguously "New activity," not "New endorsement."

### Decision 4 — Feedback (A18)

Drop from primary nav on desktop. Footer in right rail = `<button>` opening the existing feedback modal. **Keep `Feedback` in mobile bottom-nav** (no migration needed there). The footer button uses `useFeedback().openFeedback()`.

### Decision 5 — Bottom nav on desktop

Hide entirely at ≥800px. **Mechanism**: `<BottomNav>` is JS-unmounted via the layout-breakpoints hook (A24) — it has focusable buttons that must not be in the DOM at desktop widths. `--bottom-nav-height` is also zeroed at `:root` via media query so any consumer of the variable (e.g., `.app-shell__content`'s padding-bottom) updates without JS (A32).

### Decision 6 — Account-switcher placement on desktop (A10 + A17)

**Minimal trigger** at the bottom of the left rail (above the New-activity button): avatar + handle + chevron. No verbose profile card with stats/role garnish. Trigger reads `useOrg().activeOrg` and swaps avatar/name/handle (matches existing mobile-sidebar behavior; A17).

Navbar's account-switcher trigger is hidden at ≥800px.

### Decision 7 — Profile banner on desktop (A9)

Banner remains **center-column-bleed** (NOT viewport-bleed). To preserve the panoramic aspect ratio at 600px width, banner height shrinks to **120px at ≥800px** (from the current mobile height). Simpler than overlap mechanics; matches the trimmer rail aesthetic.

### Decision 8 — Logged-out left rail (A16)

**Slimmed rail when unauthenticated**: Home, Explore, About; replace the account-switcher trigger with a "Sign in / Create account" CTA card. Legal pages (`/about`, `/terms`, `/privacy`, `/dsa`, `/imprint`) render with the slim rail — not single-column.

### Decision 9 — `/connected-apps` (A13)

Surface as a **sub-link under Profile or Settings** (defer exact placement to implementation review). Don't leave the route orphaned. Not a top-level nav slot.

### Decision 10 — Activity routes (A20)

`/activity/[did]/[rkey]` and `/activity/[did]` are **explicitly not** in the rail. They're content-level routes surfaced via Profile and feed cards. Future readers should not re-litigate.

### Decision 11 — Identity / DID (A22)

**No "DID" or "Identity" nav item.** Identity surfaces through handle display + account switcher + `/connected-apps`. Resist plumbing-on-display.

## Breakpoints (one source of truth)

Defined in `src/app/styles/tokens.css` as CSS custom properties + mirrored in the hook:

```css
:root {
  --bp-gt-mobile: 800px;        /* desktop layout begins */
  --bp-gt-narrow-desktop: 1100px; /* + right rail */
  --bp-gt-desktop: 1300px;      /* + left rail expands to icon+label */
}
```

Existing 769px CSS rules (in `pages.css`, `components.css`, `layout.css`) collapse to 800px in **PR1** (A23). The three raw `window.innerWidth <= 768` checks (`feedback-modal.tsx:37`, `navbar.tsx:84`, `use-bottom-sheet-drag.ts:39, 55`) migrate to the new hook (A27). Mobile behavior at 769–799px (iPad-landscape, foldables) shifts from "mobile sheet" → "desktop dropdown" — documented in PR1 body and `DESIGN.md` update.

| Range | Layout | Components mounted | Behavior |
|---|---|---|---|
| `< 800` | **Mobile** (current) | navbar(hamburger+brandmark+account), bottom-nav, mobile-sidebar (on hamburger click) | Today's behavior |
| `800–1099` | **Tablet desktop** | navbar(brandmark only), left rail icon-only (86px), no right rail | Bottom-nav unmounted; hamburger unmounted; mobile-sidebar unmounted |
| `1100–1299` | **Narrow desktop** | + right rail (250px); center shifts left | |
| `≥ 1300` | **Full desktop** | left rail icon+label (240px); right rail full (300px); center 600px max, centered | |

**Width math at the 1300px breakpoint**: 240 + 600 + 300 = 1140; ~80px outer gutter at 1300. At 1100px: 86 + 600 + 250 = 936; ~80px margin on either side. Visually matches the brand's whitespace philosophy (A1, A29).

**Centering on wide viewports**: the three-column grid lives inside an outer wrapper with `max-width: 1300px; margin: 0 auto;`. At 1920px+ the entire rail/center/rail unit centers in the viewport rather than anchoring left. Outer gutters on ultra-wide displays are passive whitespace, consistent with `DESIGN.md`'s "horizontal whitespace is passive" rule.

## Hook (`use-layout-breakpoints`) — narrowed scope (A24)

Gates **mount/unmount only** for three components: `<BottomNav>`, `<MobileSidebar>`, the hamburger button in `<Navbar>`. These have focusable/portal content that must not exist at ≥800px for accessibility.

**Everything else is CSS-only** via media queries on the same breakpoint tokens. Rails mount unconditionally and use `@media (min-width: 800px) { .left-rail { display: block } }`. First paint is correct without JS. **No cookie-SSR needed** (A26).

```ts
// src/lib/hooks/use-layout-breakpoints.ts
export function useLayoutBreakpoints(): {
  isDesktop: boolean   // gates BottomNav, MobileSidebar, hamburger
  // CSS-only flags below; exposed in case a component needs them in JS
  hasRightRail: boolean
  isFullDesktop: boolean
}
```

SSR returns `isDesktop: false` (mobile defaults). First effect-tick recomputes from `matchMedia`. Because rail VISIBILITY is CSS-only, a desktop user sees rails on first paint regardless — only the three unmount-gated components pop in after hydration (which is the correct direction: more chrome, not less).

## Z-index map (A28)

Pin explicit values in `tokens.css`:

| Layer | z-index | CSS var |
|---|---|---|
| Page content | 0 | — |
| Sticky-within-rail (e.g. right-rail search) | 10 | `--z-rail-sticky` |
| Rails (left/right) | 30 | `--z-rail` |
| Navbar | 50 | `--z-navbar` |
| Bottom-sheet portal / mobile-sidebar drawer | 60 | `--z-portal-sheet` |
| Bottom-nav | 50 (only mounted <800px; no competition) | `--z-bottom-nav` |
| Modals | 100 | `--z-modal` |
| Skip-nav / toasts | 9999 | `--z-skip-nav` |
| Feedback portal | 10000 (existing — NOT migrated to tokens in this PR; out of scope) | `--z-feedback` |

Rails at 30 — below navbar 50 so the navbar visually crosses the rail top edge (matches bsky).

## File ownership

| File | PR | Change |
|---|---|---|
| `src/app/styles/tokens.css` | PR1 | Add breakpoint tokens (`--bp-gt-mobile: 800px` etc.); z-index tokens. |
| `src/app/styles/layout.css`, `components.css`, `pages.css` | PR1 | Collapse all existing 769px rules to 800px. |
| `src/app/styles/layout.css` | PR1 | Override `:root --bottom-nav-height: 0` at ≥800px (A32). Rename `.app-shell__content` wrapper structure to `.app-shell__center` (grid cell) > `.app-shell__content` (reading container) (A25). |
| `src/lib/hooks/use-layout-breakpoints.ts` | PR1 | **NEW.** SSR-safe matchMedia hook returning `{ isDesktop, hasRightRail, isFullDesktop }`. |
| `src/components/ui/feedback-modal.tsx` | PR1 | Replace `window.innerWidth <= 768` (line 37) with hook (A27). |
| `src/components/layout/navbar.tsx` | PR1 | Replace `window.innerWidth <= 768` (line 84) with hook. Add resize-effect that clears `dropdownOpen`/`switcherOpen` on crossing 800 (A34). |
| `src/hooks/use-bottom-sheet-drag.ts` | PR1 | Replace `window.innerWidth > 768` (lines 39, 55) with hook (A27). |
| `src/components/layout/app-shell.tsx` | PR1 (scaffold) / PR2 (rails) | PR1: refactor to `.app-shell__center` grid cell + `.app-shell__content` reading container. PR2: render `<DesktopLeftRail/>` + `<DesktopRightRail/>` in the grid; gate with hook for the three unmount-only components. |
| `src/components/layout/bottom-nav.tsx` | PR1 | Caller (`app-shell.tsx`) conditionally renders via hook. Component itself unchanged. |
| `src/components/layout/mobile-sidebar.tsx` | PR1 | Same — conditionally rendered. Component unchanged. |
| `src/components/layout/desktop-left-rail.tsx` | PR2 | **NEW.** Items: Home, Explore, Endorsements, Notifications, Groups, Profile, Settings (A13). Active state: `strokeWidth={active ? 2.5 : 1.5}`, label color `--fg-muted → --fg-primary`, weight 400 → 600 — **no fills, no background tint** (A2). Two width modes (86px / 240px). Account-switcher trigger at the bottom (avatar + handle + chevron, reads `useOrg().activeOrg`; A10, A17). "New activity" primary button below trigger: full-width when 240px, 44px square when 86px (A5, A15). Logged-out variant: slim rail (Home, Explore, About) + sign-in CTA (A16). |
| `src/components/layout/desktop-right-rail.tsx` | PR2 | **NEW.** Sticky search (reuses `<Input>` — 44px, 2px radius; A8). Suggested-people-to-endorse list (`.feed-card` pattern; A7). Suggested-groups list (same pattern). Footer: inline link line with Feedback as `<button>` (A18, A14). Hidden on `/search`. Two width modes (250px / 300px). |
| `src/components/layout/navbar.tsx` | PR2 | Hide hamburger button at ≥800px. Hide account-switcher trigger at ≥800px (left-rail trigger replaces it). Brandmark stays in current position (A11). |
| `src/app/profile/[handle]/page.tsx` and `useProfileNavbar` | PR2 | Banner shrinks to 120px at ≥800px (A9). Center-column-bleed (not viewport-bleed) on desktop. |
| `src/components/layout/mobile-sidebar.tsx` | PR2 | Add `/dsa` link to align with right-rail footer (A19). |
| `DESIGN.md` | PR2 | Document the new philosophy: single-column on mobile + as a reading spine on desktop, rails as additive context. Specify the breakpoint scale, rail typography (Inter 0.875rem/500/-0.005em), rail colors (`--bg-canvas`, `--border-subtle`, `--overlay-weak`, active `--fg-primary` / inactive `--fg-secondary`), row height (48px), active-state recipe (stroke-weight swap, no fills). Note the 769 → 800 breakpoint migration and the mobile behavior change at 769–799px. |
| `scripts/layout-breakpoint-smoke.ts` | PR2 (optional, A36) | One-shot tsx script: mock `matchMedia`, render `<AppShell>` at 375 / 820 / 1180 / 1440, assert rail mount + bottom-nav state. Catches regressions on future layout edits. |

## Visual specs (pin now to prevent drift)

| Element | Spec |
|---|---|
| **Rail surface bg** | `--bg-canvas` (NOT `--bg-elevated`; rails are chrome, not cards) |
| **Rail / center divider** | 1px hairline, `--border-subtle` |
| **Rail row height** | 48px (mouse target, not thumb; A6) |
| **Rail row padding** | 16px horizontal / 12px vertical (icon+label); centered (icon-only) |
| **Icon ↔ label gap** | 12px |
| **Label typography** | Inter `0.875rem / 500 / -0.005em` (A3) |
| **Active state** | `strokeWidth={1.5 → 2.5}` + label color `--fg-muted → --fg-primary` + weight `400 → 600`. No fills, no pill tint. (A2) |
| **Hover state** | `--overlay-weak` |
| **Notification badge** | Inherits `tnum` (tabular numerals) — match bottom-nav badge styling (A12) |
| **"New activity" button (240px mode)** | Full-width primary, 2px radius, Inter 500, tracking-wider, `--btn-primary-bg` |
| **"New activity" button (86px mode)** | 44px square primary, 2px radius, `<Plus size={20} />` icon-only. NOT circular FAB. (A5) |
| **Right-rail search input** | Existing `<Input>` component, no overrides. 44px, 2px radius, `--bg-elevated`, `--border-default`. (A8) |
| **Right-rail suggestion cards** | `.feed-card` pattern: no border, hairline `--border-subtle` between items, 16px vertical padding (A7) |
| **Right-rail footer** | Inline single line (NOT vertical stack), `0.75rem / 500 / --fg-muted`, links separated by middle dot `·` to match the feed-card meta separator already used in `DESIGN.md` (A14) |
| **Profile banner (≥800px)** | 120px tall, center-column-bleed (600px wide) (A9) |

## Acceptance criteria

**Per-breakpoint layout checks** (DevTools at each width):

- [ ] **375px (iPhone SE)**: Byte-identical to today. Bottom nav visible, hamburger visible, content 343px. No rails mounted (DOM check).
- [ ] **768px (iPad portrait)**: Mobile. Bottom-nav visible. iPad-portrait deliberately stays on the mobile side of the 800px line.
- [ ] **769–799px (iPad-landscape edge / foldable)**: Documented mobile-behavior change. Account-switcher uses bottom-sheet (was dropdown above 769). Confirm intentional.
- [ ] **820px**: Left rail icon-only (86px). Bottom-nav unmounted. Hamburger hidden. Right rail NOT mounted. Center 600px starting after left rail.
- [ ] **1180px**: Left rail icon-only. Right rail mounted (250px). Center 600px shifted left for balance.
- [ ] **1440px**: Left rail icon+label (240px). Right rail full (300px). Center 600px centered. ~80px outer gutter on each side.
- [ ] **2560px**: Same as 1440px shape; no further expansion.

**Per-route smoke** (`/`, `/profile/[handle]`, `/settings`, `/create`, `/groups`, `/search`, `/about`, `/terms`, `/privacy`, `/imprint`, `/dsa`):
- [ ] Authenticated: left + right rails render correctly; main content unbroken; active rail item highlighted.
- [ ] Unauthenticated visiting `/about`, `/terms`, etc.: slim left rail with sign-in CTA renders; legal-page content unbroken.

**Behavior:**
- [ ] **No layout shift on resize 700→1500px** at 800/1100/1300 thresholds: no flicker (matchMedia events).
- [ ] **First-paint correctness at desktop widths**: rails appear in the first paint (CSS-only visibility). Bottom-nav + hamburger may pop out on hydration — that's the unmount direction, acceptable.
- [ ] **Hamburger state machine**: open mobile-sidebar at 600px, resize to 1000px, resize back to 600px → drawer is closed (state cleared on crossing 800; A34).
- [ ] **Keyboard nav**: Tab order goes left-rail → center → right-rail. Focus rings visible. No focus trap.
- [ ] **Screen reader landmarks**: `<nav>` for left rail (`aria-label="Primary"`); `<main>` for center; `<aside aria-label="Suggestions and search">` for right rail.
- [ ] **No new tsc errors** vs baseline.
- [ ] **No new lint warnings** vs baseline.
- [ ] **Account-switcher**: triggered from navbar on <800px (bottom sheet); triggered from bottom of left rail on ≥800px (dropdown). Active-org state swaps avatar/handle in both cases.
- [ ] **Profile banner**: panoramic at all widths (120px tall on desktop; current height on mobile). No square/card-like aspect at 1440px.

## Out of scope

- Designing or changing individual page contents.
- Right-rail content beyond MVP (trending, recent-endorsements-in-network, live events).
- Notification-badge real-time / push surfaces.
- Theme or dark-mode work.
- Animation/transition polish beyond what already exists.
- i18n of rail labels.
- Right-rail search behavior beyond navigating to `/search?q=…`.
- Bumping `@atproto/api` 0.13 → 0.19 (separate follow-up).

## Open questions / follow-ups

1. **`/connected-apps` placement**: Profile sub-link or account-switcher menu? Decide in implementation review.
2. **Activity-route surfacing on desktop**: explicitly not in rail (Decision 10). Confirmed.
3. **Right-rail "Suggested people / groups" data source**: pull from indexer endpoints, or add new endpoint? Defer to implementation review.
4. **Optional smoke script** (`scripts/layout-breakpoint-smoke.ts`): worth committing now or defer to follow-up?

## Risks

- **R1 — Mount-state desync on resize.** Mitigation: A34 — `navbar.tsx` resize effect clears stale state on crossing 800.
- **R2 — 769→800 migration silently changes mobile bottom-sheet/dropdown behavior at 769–799px** (iPad-landscape, foldable widths). Mitigation: documented in PR1 body and DESIGN.md update; explicit acceptance criterion above.
- **R3 — Z-index conflicts under rails.** Mitigation: A28's z-index map pinned in tokens.css; all layers reference the tokens.
- **R4 — Profile banner aspect-ratio change.** Mitigation: A9 — banner explicitly resized to 120px at ≥800px. Acceptance criterion at 1440px verifies it doesn't look square.
- **R5 — DESIGN.md staleness in other docs** (AGENTS.md, AUDIT_REPORT.md, README.md). Mitigation: PR2 greps for "single column at every viewport" and updates all hits.
- **R6 — Right-rail empty state when user has no endorsable suggestions / no joinable groups.** Mitigation: each card list renders an empty-state line `--fg-muted` ("No suggestions right now"); footer is always present.
- **R7 — Logged-out / public-page rail rendering** could leak authed-only data. Mitigation: Decision 8 — slim rail when unauthenticated, no profile card.

## Implementation order — PR partition (A30)

**PR1 — Foundation (no visible rails yet)**

1. `tokens.css`: add breakpoint + z-index tokens.
2. CSS: collapse 769px rules to 800px across `layout.css` / `components.css` / `pages.css`. Override `--bottom-nav-height: 0` at ≥800.
3. `use-layout-breakpoints.ts`: new hook.
4. Migrate three `<=768` checks (feedback-modal, navbar, use-bottom-sheet-drag).
5. `navbar.tsx`: resize-effect to clear dropdown state on threshold crossing.
6. `app-shell.tsx`: refactor wrapper into `.app-shell__center > .app-shell__content`. JS-unmount bottom-nav + mobile-sidebar + hamburger at ≥800px (CSS still works without rails — content gets full center column space).
7. Local verification: tsc clean vs baseline; smoke at 375 / 768 / 1180 / 1440 — mobile unchanged; desktop is content-centered without rails (placeholder before PR2 lands the rails).

**PR2 — Rails + DESIGN.md update**

1. **Prerequisite**: resolve Open Question 3 (suggested-people / suggested-groups data source) in implementation review before starting step 2.
2. `desktop-left-rail.tsx`: build with all visual specs.
3. `desktop-right-rail.tsx`: build with all visual specs.
4. Wire both into `app-shell.tsx`.
5. `profile/[handle]/page.tsx` + `useProfileNavbar`: shrink banner at ≥800px.
6. `mobile-sidebar.tsx`: add `/dsa` link (A19).
7. `DESIGN.md`: replace single-column paragraph; add breakpoint scale, rail visual specs (including the deliberate `-0.005em` rail-label tracking so future contributors don't "correct" it to display-size values), behavior-change note for the 769→800 migration.
8. Optional: `scripts/layout-breakpoint-smoke.ts`.

**Stop after PR2 is Draft + green CI.** User merges.

### Merge guards

- **Do NOT merge PR1 alone to `main`.** PR1 ships ≥800px users a centered content column with no rails, no bottom-nav, and no hamburger — i.e. an authed desktop user has navbar nav only. This is a functional interim for the staging Draft state only. PR1 can be merged into `staging` (where PR2 will land shortly after), but the `staging → main` release PR should bundle both PRs together.
- PR1 alone is rollback-safe in `staging`; if PR2 stalls, `git revert <PR1>` restores today's behavior with zero schema/state impact.

## Rollback

- **PR1 alone is rollback-safe**: it's all internal refactoring with no new visible layout. `git revert <PR1>` restores today's behavior.
- **PR2 rollback** removes the rails but keeps PR1's foundation. The shell at ≥800px would then render content centered with no rails (functional, just empty space).

Neither PR introduces persistent state, schema changes, or env vars. Reverts are clean.
