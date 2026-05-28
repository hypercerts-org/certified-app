# DESIGN.md — Certs.social

## 1. Visual Theme & Atmosphere

Certs.social feels like a notary's ledger reimagined as a mobile app — austere, monochrome, and quietly authoritative. The near-absence of color forces attention onto the content: serif headlines anchor each card like a document title, while the surrounding chrome recedes into warm grays. It's deliberately under-decorated — no gradients, no brand accent hue, no playful illustrations. The restraint *is* the brand.

Underneath the calm surface sits a social feed. Activity cards scroll by like entries in a shared register; endorsements carry the weight of a countersignature. The tension between institutional formality (certificates, seals, identity) and casual social patterns (feeds, follows, tabs) is the defining character of the design.

The app is **mobile-first**. Every layout, component, and interaction is designed for small screens first; the desktop experience is a natural widening of that single-column flow, not a separate layout. There is no desktop sidebar, no multi-column dashboard — just a centered, narrow content column that reads like a social feed on any viewport.

**Key Characteristics:**
- Monochrome palette: near-black primary, warm grays, no brand accent color — identity is carried by typography
- Noto Serif headlines give content the weight of a printed document; Inter handles all UI chrome
- Minimal border-radius (`--radius: 2px`) gives cards and buttons a sharp, document-like feel
- Full dark mode via `data-theme="dark"` — surfaces invert, primary button inverts (dark-on-light becomes light-on-dark)
- Mobile-native navigation: bottom tab bar, hamburger sidebar, bottom-sheet account switcher with drag-to-dismiss
- Feed-centric layout: the home screen is a social feed, not a dashboard
- Frosted-glass navbar with `backdrop-filter: blur(12px)` and translucent backgrounds
- Skeleton loading states with subtle pulse animations for perceived performance
- Accessibility-first: skip-nav link, focus rings, ARIA roles on tabs, `prefers-reduced-motion` support throughout
- Spring-eased transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) for physical, weighted motion

## 2. Color Palette & Roles

Colors are defined as CSS custom properties in `:root` and overridden in `[data-theme="dark"]`. The system has two layers: **invariant primitives** (`--color-primary`, `--color-white`) that never change between themes, and **semantic tokens** (`--bg-canvas`, `--fg-primary`, `--border-default`) that flip in dark mode. All CSS references semantic tokens — never raw hex values or primitives.

### Core

| Name | Token | Light | Dark | Role |
|---|---|---|---|---|
| Ink | `--color-primary` | `#111111` | `#111111` | Theme-invariant primary (skip-nav) |
| Paper | `--color-white` | `#FFFFFF` | `#FFFFFF` | Theme-invariant white |
| Slate | `--color-accent` | `#5e5e5e` | `#a0a0a8` | Secondary text, muted interactive |

### Surfaces (elevation ramp)

| Name | Token | Light | Dark | Role |
|---|---|---|---|---|
| Canvas | `--bg-canvas` | `#f9f9f9` | `#0b0b0d` | Page background |
| Sunken | `--bg-sunken` | `#eeeeee` | `#08080a` | Recessed areas (toggle tracks) |
| Raised | `--bg-raised` | `#f3f3f3` | `#141417` | Slightly elevated surfaces |
| Elevated | `--bg-elevated` | `#FFFFFF` | `#1a1a1e` | Cards, modals, inputs — highest elevation |

### Foregrounds

| Name | Token | Light | Dark | Role |
|---|---|---|---|---|
| Primary | `--fg-primary` | `#111111` | `#f5f5f7` | Headings, primary text |
| Secondary | `--fg-secondary` | `#4c4546` | `#c7c7cc` | Body text (default) |
| Muted | `--fg-muted` | `#7e7576` | `#8e8e93` | Placeholders, tertiary text, timestamps |

### Borders

Borders use transparent black/white overlays so they adapt naturally:

| Name | Token | Light | Dark | Use |
|---|---|---|---|---|
| Whisper | `--border-subtle` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.04)` | Card separators, list dividers |
| Default | `--border-default` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` | Input borders, card borders |
| Hover | `--border-hover` | `rgba(0,0,0,0.15)` | `rgba(255,255,255,0.18)` | Hover state on bordered elements |

### Semantic

| Name | Token | Light | Dark | Role |
|---|---|---|---|---|
| Error | `--color-error` | `#ba1a1a` | `#f87171` | Error text, destructive actions |
| Success | `--color-success` | `#2ECC71` | `#2ECC71` | Success dots, badges |
| Warning | `--color-warning` | `#F5A623` | `#F5A623` | Warning icons |
| Verified bg/fg | `--badge-success-bg/fg` | `#e8f5e9` / `#1b7a3d` | `rgba(46,204,113,0.15)` / `#6ee7a7` | "High quality" label, verified badge |
| Pending bg/fg | `--badge-warning-bg/fg` | `#fff3e0` / `#b37100` | `rgba(245,166,35,0.15)` / `#fbbf24` | "Pending" badge |

### Primary Button (theme-inverting)

The primary button **inverts** in dark mode so it always pops off the canvas:

| Token | Light | Dark |
|---|---|---|
| `--btn-primary-bg` | `#111111` | `#f5f5f7` |
| `--btn-primary-fg` | `#FFFFFF` | `#0b0b0d` |
| `--btn-primary-bg-hover` | `#2a2a2a` | `#e5e5e7` |

### Shadows

| Token | Light | Dark | Use |
|---|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | `0 1px 2px rgba(0,0,0,0.4)` | Subtle lift (theme toggle) |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 12px rgba(0,0,0,0.5)` | Feedback trigger, dropdowns |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.12)` | `0 12px 32px rgba(0,0,0,0.6)` | Modals, sign-in dialog |

## 3. Typography Rules

### Font Families

| Var | Family | Role |
|---|---|---|
| `--font-inter` | Inter (300–700) | All UI text: body, labels, buttons, navigation |
| `--font-headline` | Noto Serif (400, 700, normal+italic) | Headlines, card titles, feed titles, empty-state headings |

Both fonts loaded via `next/font/google` with `display: swap`.

### OpenType Features

Inter supports several features that should be enabled where appropriate:

| Feature | Code | Use |
|---|---|---|
| Tabular numerals | `tnum` | Stats, counts, timestamps — anywhere numbers should align vertically |
| Slashed zero | `zero` | DID strings, AT URIs, monospace-adjacent contexts |
| Case-sensitive forms | `case` | Uppercase labels — adjusts punctuation and brackets for cap height |

Apply via `font-feature-settings: 'tnum' 1, 'case' 1;` on the relevant elements.

### Type Scale

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Feed card title | `--font-headline` | 1.125rem (mobile) / 1.25rem (desktop) | 700 | 1.3 | — | Single-line, ellipsis overflow |
| Empty state heading | `--font-headline` | 1.125rem | 600 | — | — | Centered empty states |
| Page title (navbar) | Inter | 0.9375rem | 600 | — | -0.01em | Centered in titled navbar |
| Sign-in heading | Inter | 1.125rem | 700 | — | -0.01em | Modal heading |
| Body | Inter | 1rem / 0.875rem | 400 | 1.6 / 1.5 | — | Default reading text |
| Body small | Inter | 0.8125rem | 400–500 | 1.6 | — | Sidebar links, descriptions |
| Caption / label | Inter | 0.6875rem | 500–600 | — | 0.08–0.2em | Uppercase labels, section markers |
| Tiny | Inter | 0.625rem | 500 | 1 | — | Bottom nav labels |

### Principles

- **Serif for content, sans for chrome.** Headlines and card titles use Noto Serif to signal "this is the content worth reading." Everything structural — buttons, nav, labels — is Inter.
- **Uppercase + wide tracking for labels.** Section labels, card labels, and dashboard headers use `text-transform: uppercase` with `letter-spacing: 0.08em–0.2em` to create visual hierarchy without size increase.
- **Negative tracking at display sizes.** Headlines at 1rem+ use -0.01em to -0.02em for a tighter, more editorial feel.
- **Weight ceiling on Inter.** Body text caps at 600 (semibold). Weight 700 is reserved exclusively for Noto Serif headlines.

## 4. Component Styles

### Buttons

The `<Button>` component (`src/components/ui/button.tsx`) defines four variants and three sizes. This is the canonical button system.

| Variant | Background | Text | Border | Hover | Use |
|---|---|---|---|---|---|
| **Primary** | `--btn-primary-bg` | `--btn-primary-fg` | none | opacity 0.9 | Main CTAs, form submits |
| **Secondary** | transparent | `--fg-primary` | `--border-default` | border → `--border-hover` | Cancel, secondary actions |
| **Ghost** | transparent | `--fg-muted` | none | bg `--overlay-weak`, text → primary | Toolbar actions, less emphasis |
| **Destructive** | `error/10` | error | `error/20` | bg error/15, border error/35 | Delete, remove actions |

| Size | Padding | Font Size |
|---|---|---|
| `sm` | 6px 16px | 0.75rem |
| `md` | 10px 24px | 0.875rem |
| `lg` | 12px 32px | 0.875rem |

All buttons: `border-radius: var(--radius)` (2px), `font-weight: 500`, `tracking-wider`, 150ms transition.

### Cards

**App Card** (`.app-card`): `bg-elevated`, 1px `border-default`, `border-radius: var(--radius)`, 24px padding. Hover: border shifts to `--border-hover-soft`.

**Feed Card** (`.feed-card`): No background, no border — just a `border-bottom: 1px solid var(--border-subtle)` separator. 20px vertical padding (24px on desktop). Content-forward: author byline, optional 1:1 image, serif title, description (3-line clamp), meta row.

**Dashboard Card** (`.dash-card`): No background, no border-radius — just a `border-bottom: 1px solid var(--border-light)` separator. Used in sidebar-style stacked content.

### Inputs

**Text Input** (`src/components/ui/input.tsx`): Height 44px, `bg-elevated`, 1px `border-default`, `var(--radius)` radius, 16px horizontal padding. Focus: border → `--focus-ring`, 1px ring at 20% opacity. Error: border → `error/40`.

**Textarea** (`src/components/ui/textarea.tsx`): Same styling as input, `resize-y`, 12px vertical padding.

**Sign-in Input** (`.signin-modal__input`): Larger variant — 56px height, 1.5px border, 8px radius, 20px padding. This is intentionally different from the app input: it's a first-touch experience with more generous sizing.

**iOS auto-zoom rule**: any focusable `<input>` / `<textarea>` must have **font-size ≥ 16px on mobile** (`@media (max-width: 768px)`). Below 16px, iOS Safari auto-zooms on focus and overflows the viewport. Desktop can stay at 14–15px for visual density, but mobile must override to 16px. See the override blocks at the bottom of `feed.css`, `components.css`, and `pages.css`.

### Badges

Three variants via `<Badge>` component:

| Variant | Background | Text | Icon |
|---|---|---|---|
| `verified` | `--badge-success-bg` | `--badge-success-fg` | CheckCircle |
| `pending` | `--badge-warning-bg` | `--badge-warning-fg` | Clock |
| `unverified` | `--badge-neutral-bg` | `--badge-neutral-fg` | none |

All badges: `border-radius: 999px` (pill), `font-weight: 500`, `0.875rem` text.

### Feed Label Pills

Inline quality labels on feed cards: `border-radius: 999px`, `0.6875rem`, `font-weight: 600`, uppercase.

| Label | Background | Text |
|---|---|---|
| High quality | `--badge-success-bg` | `--badge-success-fg` |
| Standard | `--badge-neutral-bg` | `--badge-neutral-fg` |
| Draft | `--badge-warning-bg` | `--badge-warning-fg` |
| Likely test | `--badge-neutral-bg` | `--badge-neutral-fg` |

### Avatar

`<Avatar>` component with four sizes: `sm` (32px), `md` (48px), `lg` (64px), `xl` (96px). Always circular (`border-radius: 50%`). Fallback: `--color-surface-container-high` background with centered initials.

### Icons

All icons from **Lucide React**. Conventions:

| Context | Size | Stroke Width | Notes |
|---|---|---|---|
| Bottom nav | 24px | 1.5 (default), 2.5 (active) | Active state uses heavier stroke, not fill |
| Navbar (back, menu) | 20–22px | default | ArrowLeft, Menu, X |
| Inline actions | 14px | default | Pencil, Copy, ChevronDown, Trash2 |
| Modal close / header | 18px | default | X, Globe |
| Success/error callouts | 14–16px | default | AlertCircle, CheckCircle |
| Large success states | 40px | default | CheckCircle2 (domain verification) |

### Modals

**Standard sign-in modal** (`.signin-modal` only): Centered on desktop, full-width on mobile. `bg-elevated`, 1px `border-default`, `shadow-lg`. Entry animation: `modalFadeIn` (backdrop 200ms) + `modalSlideUp` (content 300ms, spring easing). 20px radius + 40px hero padding. This shape is **reserved for the sign-in surface** — it's an intentional exception to the 2px system because sign-in is a once-per-session, branded surface.

**App modals** (every other in-app dialog — endorse-people, create-list, sync-social-graph, future): use `<dialog className="signin-modal app-modal …">`. The `.app-modal` modifier inherits the sign-in chrome (backdrop / animation / close button / focus styling) but overrides:

- `border-radius: var(--radius)` (2px — matches cards, dropdowns, inputs).
- Padding trimmed to `16px 20px 12px` header / `0 20px 20px` body — denser than the sign-in surface, which is right for form-style and list-style modals.

If you're building a new modal that isn't the sign-in flow, **always** add `app-modal` alongside `signin-modal`. Forgetting it makes the dialog read as a chunky sign-in surface and breaks the 2px system everywhere else.

**Bottom sheet** (mobile account switcher, mobile feedback): Fixed to bottom, draggable handle, swipe-down-to-dismiss. `bg-elevated`, top border-radius. Expandable via swipe-up.

### Empty State

`<EmptyState>` component (`src/components/ui/empty-state.tsx`) for lists and sections with no content. Props: optional `icon` (LucideIcon, rendered at 40px/1.2 stroke), `title`, `description`, and `children` (CTA slot). Centered layout, serif title, 48px vertical padding.

### Feed Label Pill

`<FeedLabelPill>` component (`src/components/ui/feed-label-pill.tsx`) extracts the quality label badge from activity cards. Takes a `label` prop (LabelValue) and renders the appropriate colored pill.

### Distinctive Components

These components define the visual identity of certs.social — they are what makes the app recognizable:

**Frosted navbar with three modes.** The navbar isn't just sticky — it shapeshifts. In *default* mode: brandmark center, hamburger/avatar on the sides, frosted glass background. In *titled page* mode: back arrow left, page title center, empty right — like a native mobile app. In *profile overlay* mode: fully transparent, only a floating back-arrow pill over the full-bleed banner. The transition between these is instantaneous on route change.

**Bottom-sheet account switcher.** On mobile, tapping the avatar opens a bottom sheet (not a dropdown) with a drag handle. Swipe down to dismiss, swipe up to expand. The sheet has momentum-based physics — dragging past 80px down dismisses, past 40px up expands. Desktop gets a regular dropdown instead.

**Feed with evaluator filter.** The "For you" tab label doubles as a filter toggle — tapping it when already active opens an inline panel with evaluator checkboxes and a "Show everything" toggle. When the filter is non-default, the tab text changes to "Custom." The unfiltered state shows a caution banner.

**Profile hero with banner overlap.** The profile page uses a full-bleed banner with the avatar overlapping downward (negative margin). The navbar goes transparent in this mode so the banner extends to the top edge of the viewport.

### Motion & Animation

The app uses a consistent motion language built on three timing tokens and one easing curve:

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `150ms ease-out` | Micro-interactions: hover, focus, color shifts |
| `--transition-base` | `250ms ease-out` | Medium transitions: navbar hide/show, FAQ expand |
| `--transition-slow` | `400ms cubic-bezier(0.16, 1, 0.3, 1)` | Layout shifts: sidebar slide, bottom sheet |

**Spring easing** (`cubic-bezier(0.16, 1, 0.3, 1)`) is the signature curve — used for sidebar entry, modal slide-up, bottom sheet transitions. It overshoots slightly before settling, giving motion a physical, weighted feel.

**Animation patterns:**
- **Press scale** (`.press-scale`): `transform: scale(0.98)` on `:active`. Applied to all `<Button>` variants. Bottom nav items use `scale(0.92)` for a more pronounced tap feel. Disabled via `prefers-reduced-motion`.
- **Skeleton pulse**: `opacity: 0.4 → 1 → 0.4` over 1.4–1.5s, ease-in-out. Used for all loading placeholders.
- **Modal entry**: backdrop fades in (200ms linear) while content slides up 16px and scales from 0.98 → 1 (300ms spring).
- **Logo pulse** (loading screen): `opacity: 0.3 → 1`, `scale: 0.95 → 1` over 2s. Slow, calming.
- **Navbar hide**: `transform: translateY(-100%)` on scroll-down, reversed on scroll-up, using `--transition-base`.

**`prefers-reduced-motion`**: All animations are disabled — `animation-duration: 0.01ms`, `transition-duration: 0.01ms`. Elements render at their final state with `opacity: 1` and no transform.

## 5. Layout Principles

### Mobile-First Philosophy (revised)

> **Note (2026-05):** This section was rewritten when the proper desktop layout shipped. The previous rule — "single narrow column at every viewport, no sidebars, no multi-column grids" — was reversed by product direction. The mobile experience is unchanged; the desktop experience now adds context rails around the center spine rather than stretching the column. Rails are *additive context*, not new per-page layouts.

The layout is a **single narrow column on mobile** (≤ 799px) and the same center spine flanked by **persistent rails on desktop** (≥ 800px). The reading width is preserved or slightly narrowed on desktop — the column is not stretched. Rails carry navigation and context (suggested follows, search, footer), so the center can stay editorial.

- **Mobile (< 800px)**: `padding: 0 16px–20px`, content fills viewport width, max 720px on small tablets. Bottom-nav + hamburger drawer + bottom-sheet account switcher.
- **Tablet desktop (800–1099px)**: 86px left rail (icon-only) + center column (max 600px). Bottom-nav and hamburger unmount.
- **Narrow desktop (1100–1299px)**: + 250px right rail (search, suggestions, footer). Center column shifts slightly to balance.
- **Full desktop (≥ 1300px)**: 240px left rail (icon+label) + 600px center + 300px right rail (300px). Outer wrapper `max-width: 1300px; margin: 0 auto` so ultra-wide displays show passive horizontal gutters rather than anchored-left layout.

The center column **narrows from 720px → 600px** on desktop because the flanking rails carry context the mobile column had to carry alone. This is intentional and matches bsky.app / x.com.

#### Rail visual specs

- **Surface**: `--bg-canvas` (chrome, not card). No bordered card around the rail.
- **Divider rail↔center**: 1px `--border-subtle` (the hairline; same separator the feed cards use).
- **Row height**: 48px (mouse target). Padding: 16px horizontal / 12px vertical at icon+label mode; centered at icon-only mode. Icon↔label gap: 12px.
- **Label**: Inter `0.875rem / 500 / -0.005em`. The `-0.005em` tracking is deliberately tight (half the display-size convention) — do NOT "correct" it to `-0.01em`; rail labels are chrome, not headlines.
- **Active state**: `strokeWidth 1.5 → 2.5` on the Lucide icon **+** label color `--fg-muted → --fg-primary` + weight `400 → 600`. **No fills, no background-tint pill.** This is the same active-state recipe the bottom-nav uses; it preserves the brand rule that fills are reserved for content (avatars, images), not chrome.
- **Hover**: `--overlay-weak`.
- **"New activity" primary button** (left rail bottom): full-width primary at 240px mode, 44px **square** primary at 86px mode (NOT a circular FAB — the 2px radius is the brand's primary-button system).
- **Account-switcher trigger** (left rail bottom, above New-activity): minimal avatar + handle + chevron. Reads `useOrg().activeOrg` so identity reflects the acting role.
- **Right-rail items** (suggested-people, suggested-groups cards): use the `.feed-card` pattern (no border, hairline `--border-subtle` between items, 16px vertical padding). Not bordered cards.
- **Right-rail footer**: single inline line with `·` separators (matches feed-card meta convention). NOT a vertical stack.
- **Right-rail search**: existing `<Input>` component (44px, 2px radius, `--bg-elevated`, `--border-default`). Not pill-shaped.

#### Logged-out variant

Unauthenticated users see a **slim left rail** (Home, Explore, About) plus a sign-in CTA card replacing the account-switcher trigger. Right rail and bottom nav are unchanged.

### Whitespace Philosophy

Whitespace does the work that borders and dividers don't. Feed cards are separated by a single hairline border — the generous 20–24px vertical padding on each side is what actually creates the visual gap. Settings pages stack cards with whitespace between them rather than grouping them in bordered containers. The single-column layout means horizontal whitespace is passive (the unused margins on desktop) while vertical whitespace is active and deliberate — it controls reading rhythm. More space between sections means "new topic"; tight space means "related."

### Spacing System

Base unit: **4px**. The scale:

`2px · 4px · 6px · 8px · 10px · 12px · 16px · 20px · 24px · 32px · 40px · 48px · 64px`

Key usage patterns:
- **4–8px**: Inline gaps (icon + text, meta separators)
- **12–16px**: Component internal spacing (card content gaps, form field spacing)
- **20–24px**: Section padding within cards, sidebar sections
- **32px**: Major section gaps, desktop side padding
- **48–64px**: Page-level vertical spacing

### Container Widths

| Context | Max Width | Use |
|---|---|---|
| App shell content | `720px` | Feed, settings, create form — the editorial column |
| App page inner | `1024px` | Wider app pages (settings with cards) |
| Navbar inner | `1536px` | Navigation bar content |

### Border Radius Scale

| Value | Token / Literal | Use |
|---|---|---|
| `2px` | `var(--radius)` | Default: cards, buttons, inputs, modals, badges in app chrome |
| `4px` | `calc(var(--radius) * 2)` | Desktop feed card images |
| `16px` | literal | Bottom sheet top corners — signals "draggable" on mobile |
| `999px` | literal | Pill shapes: avatar, badge pills, feed labels, sign-in submit |
| `20px` | literal | Sign-in modal (welcoming, soft first-touch) |
| `50%` | literal | Circles: avatars, dots, step numbers |

### Image Treatment

| Context | Aspect Ratio | Object Fit | Border Radius | Placeholder |
|---|---|---|---|---|
| Feed card image | 1:1 (square) | `cover` | `var(--radius)` (mobile), `calc(var(--radius) * 2)` (desktop) | `--color-surface-container` bg |
| Activity detail image | 16:9 | `cover` | `var(--radius)` | `--color-surface-container` bg |
| Profile banner | Free (180px height) | `cover` | none (full-bleed) | Linear gradient `--color-gray-100` → `--color-light-gray` |
| Avatar | 1:1 (circle) | `cover` | `50%` | `--color-surface-container-high` bg + initials |
| Partner/app logos | 1:1 | `cover` | `var(--radius)` | `--color-off-white` bg |

All images use `loading="lazy"` and include `onError` fallbacks. Feed card images show nothing (hide the wrapper) on failure. Avatars fall back to initials.

### Navbar

Fixed at top, 64px height (`--navbar-height`). Three-column grid: left (hamburger or theme toggle) | center (brandmark) | right (avatar switcher or sign-in). Frosted glass: `var(--navbar-bg)` + `backdrop-filter: blur(12px)`. Hides on scroll-down, reappears on scroll-up.

Three modes:
1. **Default**: Brandmark center, hamburger/avatar sides
2. **Titled page**: Back arrow left, page title center, empty right
3. **Profile overlay**: Transparent background, back arrow in floating pill

### Bottom Nav

Fixed at bottom on mobile only (< 800px), 56px + safe area inset. 5 items: Home, Explore, Create, Notifications, Feedback. **Unmounted at desktop widths** — the persistent left rail is the primary nav on desktop.

### Left Rail (desktop)

Mounted at ≥ 800px. Two width modes:
- **86px icon-only** at 800–1299px (touchpads, small laptops)
- **240px icon+label** at ≥ 1300px

Items (authenticated): Home, Explore, Endorsements, Notifications, Groups, Profile, Settings. When acting as an org, Groups is hidden (matching mobile-sidebar).

Items (unauthenticated): Home, Explore, About — plus a sign-in CTA card in the bottom slot.

Bottom of rail: account-switcher trigger (minimal avatar + handle + chevron; reads `useOrg().activeOrg`) and a primary "New activity" button.

### Right Rail (desktop, wider)

Mounted at ≥ 1100px. Width 250px at 1100–1299px, 300px at ≥ 1300px. Contents:
- Sticky search input (existing `<Input>`; hidden on `/search` itself)
- "Suggested to endorse" — `.feed-card` pattern, hairline separators
- "Groups to join" — same pattern
- Footer: inline `·`-separated link line including About / Terms / Privacy / DSA / Imprint / Feedback (Feedback is a button opening the existing modal)

### Breakpoint cascade

| Range | Layout | Components |
|---|---|---|
| `< 800px` | **Mobile** | navbar (hamburger + brandmark + account switcher), bottom-nav, mobile-sidebar drawer on hamburger; content max-width 720px |
| `800–1099px` | **Tablet desktop** | navbar (brandmark only), left rail icon-only (86px); bottom-nav + hamburger + mobile-sidebar unmounted; center 600px |
| `1100–1299px` | **Narrow desktop** | + right rail (250px); center column shifts left to balance |
| `≥ 1300px` | **Full desktop** | left rail icon+label (240px); right rail full (300px); center 600px centered |

CSS tokens (`src/app/styles/tokens.css`): `--bp-gt-mobile: 800px`, `--bp-gt-narrow-desktop: 1100px`, `--bp-gt-desktop: 1300px`. The hook `useLayoutBreakpoints()` mirrors these numbers and is used to JS-unmount the three components with focusable/portal content that must NOT exist at desktop widths (bottom-nav, mobile-sidebar, hamburger button). All other responsive behavior is CSS-only.

**Mobile behavior change at 769–799px**: prior to the desktop layout, the boundary between mobile and desktop affordances was 768px. It is now 800px. At iPad-landscape edge and foldable widths (769–799px), the account switcher, feedback modal, and bottom-sheet drag now use the desktop dropdown pattern instead of the bottom-sheet pattern.

## 6. Depth & Elevation

The depth system is minimal and uses **background luminance steps** rather than heavy shadows:

| Level | Light Treatment | Dark Treatment | Use |
|---|---|---|---|
| Sunken | `--bg-sunken` (#eeeeee) | `--bg-sunken` (#08080a) | Toggle tracks, recessed panels |
| Canvas | `--bg-canvas` (#f9f9f9) | `--bg-canvas` (#0b0b0d) | Page background |
| Raised | `--bg-raised` (#f3f3f3) | `--bg-raised` (#141417) | Code blocks, location cards |
| Elevated | `--bg-elevated` (#FFFFFF) | `--bg-elevated` (#1a1a1e) | Cards, modals, inputs, navbar |
| Floating | `--bg-elevated` + `--shadow-md` | Same + stronger shadow | Dropdowns, feedback trigger |
| Modal | `--bg-elevated` + `--shadow-lg` + backdrop blur | Same | Sign-in modal, bottom sheets |

Shadows are intentionally subtle in light mode and stronger in dark mode (where luminance differences are harder to perceive). The navbar uses a 1px border-bottom (`--navbar-border`) instead of shadow for its floating effect.

### Overlays

| Token | Light | Dark | Use |
|---|---|---|---|
| `--overlay-weak` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.04)` | Ghost button hover |
| `--overlay-medium` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` | Focus ring glow |
| `--navy-overlay-70` | `rgba(0,0,0,0.7)` | `rgba(0,0,0,0.8)` | Modal backdrops |

## 7. Do's and Don'ts

### Do

- Use `var(--radius)` (2px) for all app chrome: buttons, cards, inputs, modals
- Use `var(--fg-secondary)` as the default body text color — not primary
- Use `--font-headline` (Noto Serif) for content titles; Inter for everything else
- Use `--border-default` for input/card borders; `--border-subtle` for list separators
- Use the `<Button>` component for all interactive buttons — don't hand-roll button styles
- Use transparent overlay borders (`rgba(0,0,0,0.08)`) — they adapt to dark mode automatically
- Use `var(--transition-fast)` (150ms ease-out) for micro-interactions; spring easing for layout shifts
- Respect `prefers-reduced-motion` — disable animations, keep opacity at 1
- Keep mobile touch targets at least 44x44px (the hamburger and bottom nav items do this)
- Use the semantic token layer (`--bg-canvas`, `--fg-primary`, etc.) — never hard-code hex values in components
- Use `--btn-primary-bg` for primary CTAs — it inverts automatically in dark mode
- Use the `<EmptyState>` component for empty lists — don't hand-roll empty state markup
- Use Lucide icons at 14px for inline actions, 20–24px for navigation, consistent stroke-width
- Add skeleton loading states for every data-fetching view — match the shape of the expected content
- Add `.press-scale` class to interactive elements for tap feedback

### Don't

- Don't use `border-radius` values other than `var(--radius)`, `999px`, or `50%` — avoid 4px, 6px, 8px in new code (the sign-in modal's 20px and 8px input are deliberate exceptions)
- Don't stretch the center reading column on desktop — the layout is mobile-first; the desktop column stays editorial-width (600px) and is flanked by context rails. Stretching the center to fill the viewport breaks the editorial cadence.
- Don't use bold (700) weight on Inter — reserve 700 for Noto Serif headlines only; Inter body caps at 600
- Don't use `--color-primary` or `--color-white` for theme-aware surfaces — those are invariant; use `--bg-elevated` / `--fg-primary`
- Don't add shadows to cards by default — elevation is communicated through background color, not shadows
- Don't use different button styles in one-off CSS classes — extend the `<Button>` component instead
- Don't skip loading states — every data-fetching view should have a skeleton or spinner
- Don't use fill on Lucide icons — the system uses stroke icons exclusively; active states use heavier stroke-width, not fill
- Don't add images without `onError` fallback handling and a visible placeholder

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 800px | Bottom nav visible, hamburger sidebar, bottom sheets, tighter padding (16–20px) |
| Tablet desktop | 800–1099px | Left rail icon-only (86px); bottom-nav + hamburger + mobile-sidebar unmounted; center 600px |
| Narrow desktop | 1100–1299px | + right rail (250px); center column shifts left to balance |
| Full desktop | ≥ 1300px | Left rail icon+label (240px); right rail full (300px); outer wrapper centers on ultra-wide |

The single 769px breakpoint that this section previously described was replaced when the desktop layout shipped. See §5 (Layout Principles) for the rail visual specs and the mobile behavior change at 769–799px.

### Touch Targets

| Element | Size | Notes |
|---|---|---|
| Bottom nav items | full flex width, 56px height | Oversized for comfortable thumb reach |
| Hamburger button | 44x44px | Meets WCAG minimum |
| Back overlay (profile) | 40x40px | Floating pill on transparent navbar |
| Sidebar links | full width, 44px+ padding | Generous vertical padding for tap accuracy |
| Sign-in button | 34px height, 18px horizontal | Compact but reachable in navbar corner |

### Typography Scaling

- Feed card title: 1.125rem (mobile) → 1.25rem (desktop)
- No other text scales with viewport — the type scale is fixed

### Mobile-Specific Patterns

- **Bottom sheets** replace desktop dropdowns/modals for account switcher and feedback
- **Sidebar** (83.33% width, max 320px) slides in from left with spring easing
- **Safe area insets**: bottom nav and bottom sheets respect `env(safe-area-inset-bottom)` for notched devices
- **16px minimum font size** on inputs in bottom sheets to prevent iOS zoom
- **Modal actions stack vertically** (column-reverse) on small screens for thumb-friendly ordering

## 9. Agent Prompt Guide

### Quick Color Reference

- **Canvas** (page bg): #f9f9f9 (light), #0b0b0d (dark)
- **Elevated** (cards, modals): #FFFFFF (light), #1a1a1e (dark)
- **Primary text**: #111111 (light), #f5f5f7 (dark)
- **Secondary text** (body default): #4c4546 (light), #c7c7cc (dark)
- **Muted text** (placeholders): #7e7576 (light), #8e8e93 (dark)
- **Primary button**: #111111 bg / #FFFFFF text (light), inverted in dark
- **Borders**: rgba(0,0,0,0.08) (light), rgba(255,255,255,0.08) (dark)
- **Error**: #ba1a1a (light), #f87171 (dark)
- **Success badge**: #e8f5e9 bg / #1b7a3d text (light)

### Example Component Prompts

**Feed card:**
"Create a feed card with no background — only a 1px bottom border in rgba(0,0,0,0.04). Author byline: 32px circular avatar, 0.875rem/600 Inter name, 0.8125rem muted handle. 1:1 aspect-ratio image with 2px border-radius. Title in Noto Serif 1.125rem/700 #111111. Description in Inter 0.875rem/400 #4c4546, 3-line clamp. Meta row: 0.75rem muted text with 3px dot separators and pill badges."

**Primary button:**
"Create a button on #f9f9f9 canvas with #111111 background, #FFFFFF text, Inter 0.875rem/500, py-2.5 px-6, border-radius 2px. Hover: opacity 0.9. Active: scale(0.98). Disabled: opacity 0.5. Include a Loader2 spinner when loading."

**App card (settings):**
"Create a card with #FFFFFF background, 1px border rgba(0,0,0,0.08), border-radius 2px, 24px padding. Label above in Inter 0.6875rem/600, uppercase, letter-spacing 0.08em, color #7e7576."

**Sign-in modal:**
"Full-screen backdrop with rgba(0,0,0,0.25) + blur(8px). Centered card max-width 460px, white background, 20px border-radius, 40px padding, shadow 0 12px 32px rgba(0,0,0,0.12). Brandmark centered. Input: 56px height, 1.5px border, 8px radius. Submit: full-width 56px pill button (999px radius) in primary colors."

**Bottom nav bar:**
"Fixed to bottom, 56px height + safe area inset. White background, 1px top border rgba(0,0,0,0.04). 5 equally-spaced Lucide icons at 24px, strokeWidth 1.5 default / 2.5 active. Active: #111111, inactive: #7e7576. No labels on current build."

**Profile hero:**
"Full-bleed banner at 180px height with gradient placeholder (#eeeeee to #e2e2e2). Avatar 96px circle overlapping the banner by 48px (negative margin). Display name in Noto Serif 1.5rem/700. Handle in Inter 0.875rem muted. Activity count in Inter 0.875rem/600 primary. Below: tab bar with underline-style active indicator."

**Skeleton loading state:**
"Mimic the feed card shape: 1:1 rectangle for image, 70%-width bar for title, full-width bar for description, 45%-width bar for second line, row of small pills for meta. All shapes use --color-surface-container (#eeeeee) background with opacity pulsing 0.4→1→0.4 over 1.5s ease-in-out."

**Dark mode variant (feed card):**
"Same structure as light feed card but on #0b0b0d canvas. Title: #f5f5f7. Description: #c7c7cc. Muted text: #8e8e93. Border: rgba(255,255,255,0.04). Badge backgrounds use low-opacity color (rgba(46,204,113,0.15) for success). Primary button inverts to #f5f5f7 bg / #0b0b0d text."

### Common Mistakes

Things an AI agent is likely to get wrong:

- **Using semantic tokens where invariants are needed.** The skip-nav uses `--color-navy` (always #111111) — if you use `--bg-elevated` it will flip in dark mode when it shouldn't.
- **Adding multi-column layouts on desktop.** The single-column layout is intentional. Don't create sidebars or 2-column grids for app pages just because there's horizontal space available.
- **Using shadows on cards.** Cards use background color for elevation, not box-shadow. Shadows are reserved for floating elements (modals, dropdowns, tooltips).
- **Using fill on icons.** Lucide icons are stroke-based. Active states use heavier `strokeWidth` (2.5 vs 1.5), never fill.
- **Forgetting `onError` on images.** Every `<img>` needs a fallback — feed images hide on error, avatars show initials, banners show a gradient.
- **Hard-coding border colors.** Use `var(--border-default)` etc. — they flip automatically in dark mode. Hard-coded `rgba(0,0,0,...)` borders will be invisible on dark backgrounds.
- **Using 700 weight on Inter.** This weight exists in the font load but is reserved for Noto Serif headlines only. Inter body text should cap at 600.

### Iteration Guide

1. **Start with CSS custom properties.** Never hard-code colors — use `var(--bg-canvas)`, `var(--fg-primary)`, etc. This ensures dark mode works automatically.
2. **Default to `var(--radius)` (2px).** Only use 999px for pills (badges, avatars, sign-in submit) or 50% for circles.
3. **Use the `<Button>` component.** Don't create new button styles in CSS — add variants to the component if needed.
4. **Mobile-first CSS.** Write base styles for mobile, then use `@media (min-width: 769px)` for desktop overrides.
5. **Check both themes.** Toggle `data-theme="dark"` and verify all text is readable, borders are visible, and the primary button inverts correctly.
6. **Respect the type system.** Headlines → Noto Serif 700. Body → Inter 400. Labels → Inter 500–600 uppercase. Don't mix these roles.
7. **No new shadows on cards.** Cards communicate elevation via background color (`--bg-elevated` vs `--bg-canvas`), not box-shadow. Shadows are reserved for floating elements (modals, tooltips, dropdowns).
8. **Test skeleton states.** Every new data-fetching component needs a skeleton. Match the geometry of the loaded state — rectangles where text will be, circles where avatars will be, same spacing.
9. **Icon sizing follows context.** 14px for inline actions alongside text, 20–22px for navigation chrome, 24px for bottom nav. Don't mix these.

---

## 14. Design consolidation pass (2026-05-28)

This section documents the changes from `feat/design-consolidation` (PR into `feat/positioning-redesign`). It supersedes any contradictions earlier in this file.

### 14.1 New rules

1. **All `border-radius` values are `var(--radius)` (2 px).** No exceptions. The previous `--radius: 2px` policy was being eroded by 116+ instances of 4 / 6 / 8 / 12 / 16 / 20 px corners; those are gone. Pills stay at `999px`, circles at `50%`. The sign-in modal is no longer a "hero exception" (was 20 px → 2 px).
2. **Landing has proper dark mode.** The "landing palette kept invariant so /welcome always renders light-themed" policy is retired. The landing tokens (`--color-navy`, `--color-off-white`, `--color-light-gray`, `--color-mid-gray`, `--color-dark-gray`, `--color-surface`, `--color-surface-container-low`) flip in `[data-theme="dark"]`. `--color-primary` and `--color-white` remain invariant for systems that still depend on them (skip-nav, brand SVG).
3. **Breakpoints: 800 / 1100 / 1300 only.** Previously `landing.css` used 768 (9 places) and `home/explore/workspace` used 760 (5 places). All migrated to `max-width: 799px` to match the existing "just below desktop" convention.
4. **Form input padding follows the 4-px grid.** `12 × 14` and `7 × 12` arbitrary values were replaced with `12 × 16` / `8 × 12`.
5. **Cert-detail / project-detail "wide" pages share the 1280 px fullbleed width** with profile / settings / workspace.

### 14.2 New UI components

| Component | File | Purpose |
| --- | --- | --- |
| `<Card variant="row\|elevated\|inset">` | `src/components/ui/card.tsx` | Canonical card with three shapes. Migrate `.feed-card`, `.dash-card`, `.explore-*-card`, `.app-card`, `.endorsements-v2__card` to it. |
| `<Tabs>`, `<TabList>`, `<Tab>`, `<TabPanel>` | `src/components/ui/tabs.tsx` | Proper ARIA tab pattern with keyboard arrow navigation. Migrate `.profile-tabs__tab`, `.feed-tabs__tab`. |
| `<Skeleton variant="line\|box\|circle\|text">` | `src/components/ui/skeleton.tsx` | Single primitive for all loading states. Migrate `ActivityCardSkeleton`, `NotificationRowSkeleton`, `.feed-card__author--skeleton`, etc. |
| `<Popover>`, `<PopoverTrigger>`, `<PopoverContent>`, `<PopoverItem>` | `src/components/ui/popover.tsx` | Floating menus — click-outside, Esc, ARIA wired. Migrate `.feed-filter`, account switcher menu, workspace breadcrumb menu, `.response-menu__menu`. |

### 14.3 Extended component APIs

| Component | New API | What absorbed |
| --- | --- | --- |
| `<Button>` | `size="icon"` (40 × 40 square, requires `aria-label`) | `.desktop-top-bar__icon-btn` and similar icon-only buttons. Variant `accent` rejected; domain modal moved to `primary`. |
| `<Input>` | `size="sm\|md\|lg"` (36 / 44 / 56 px), `variant="default\|underline\|inline-edit"` | `.signin-modal__input` (size=lg), `.delete-record-dialog__input` (variant=inline-edit). |
| `<Badge>` | New variants: `tag`, `role`, `count`, `high-quality`, `standard`, `draft`, `test`. `compact` prop for the tighter 11 px chip. | `.feed-card__label*` (4 quality variants), `.org-list__item-role`. `FeedLabelPill` now composes Badge. |

### 14.4 Modal hygiene

`AddOrgModal` and `MembershipSyncModal` moved from hand-rolled backdrop/Esc/focus-trap implementations to the canonical `<AppDialog>`. `CustomDomainModal` migration is deferred (multi-step indicator needs visual review). `<ResponsiveModal>` extraction from `FeedbackModal` is deferred until a second consumer exists.

### 14.5 Z-index tokens

Added `--z-feedback: 10000` and `--z-feedback-above: 10001` to the token map. Hardcoded z-index values (`49`, `999`, `10000`, `10001`) in `layout.css` / `landing.css` / `components.css` are now token references.

### 14.6 What didn't make it

- Migration of every `.profile-tabs__tab` / `.feed-tabs__tab` to `<Tabs>` — primitive shipped, call sites stay until each is touched.
- Migration of every CSS-based card to `<Card>` — same.
- Migration of every CSS-based popover to `<Popover>` — same.
- Migration of skeleton CSS to `<Skeleton>` — same.
- `CustomDomainModal` → `<AppDialog>`.
- `<ResponsiveModal>` extraction from `FeedbackModal`.
- A stylelint rule that flags `border-radius: 6px` and raw hex outside `tokens.css`.

These are documented as follow-on work in `docs/design-consolidation/plan.md`.
