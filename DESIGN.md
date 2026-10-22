# DESIGN.md — Certified (certified-app)

The design system for certified-app. `CLAUDE.md` holds the hard rules and first checks; `AGENTS.md` §11/§12 hold the CSS and component conventions. This file holds the reasoning and the specs behind them.

**One numeric source.** `src/app/styles/tokens.css` (plus `tailwind.config.ts` for the type ramp and motion utilities) is the only place values live. This document names tokens and their roles. It quotes numbers only where it defines a scale (type ramp, motion, spacing, icons, control heights). If this file and the code disagree on a value, the code wins and this file is wrong; fix it.

**The primitive library is a shared dependency.** `src/components/ui/` is the canonical, portable, barrel-exported library (`src/components/ui/index.ts`) reused by other hypercerts-org apps. Primitives express their chrome as Tailwind utilities with token arbitrary values (`bg-[var(--bg-elevated)]`), not BEM classes. Intra-`ui` imports are relative (`./button`) so the directory ports cleanly. `feed-label-pill` and `feedback-modal` are app-coupled and excluded from the portable surface (see the barrel header).

## Contents

0. Rules at a glance
1. Brand and atmosphere
2. Color
3. Typography
4. Layout
5. Depth and elevation
6. Interaction
7. Motion
8. Icons
9. Components
10. Async states and copy
11. Landing page system
12. Enforcement
13. Agent prompt guide
14. Token appendix
15. Changelog

---

## 0. Rules at a glance

These mirror the `CLAUDE.md` hard rules. Hold every UI change to them.

| # | Rule | Quick test |
|---|---|---|
| 1 | `border-radius` is `var(--radius)` (2px), `var(--radius-pill)` (999px) for pills, `50%` for circles. Never 4/6/8/12/16/20px. No exceptions, including sign-in and the bottom sheet. | `grep -rEn "border-radius:\s+(4\|6\|8\|12\|16\|20)px" src/app/styles/` is silent |
| 2 | No raw hex / rgb / rgba / hsl / named colors outside `tokens.css` and `landing.css`. | stylelint (§12) |
| 3 | Breakpoints are 800 / 1100 / 1300 only. "Below desktop" is `@media (max-width: 799px)`. | `grep -rEn "@media.*?\((max\|min)-width:\s*(76[08]\|64[80])px\)" src/app/styles/` is silent |
| 4 | Elevation shadows are `var(--shadow-sm \| --shadow-md \| --shadow-lg)`, plus `--shadow-modal` for dialogs only. Rings and hairlines use `--shadow-ring-*` / `--shadow-inset-*` / `--shadow-outline-*` / `--shadow-navbar-hairline`. Never a literal `box-shadow`. | stylelint |
| 5 | Z-index is a `--z-*` token. | stylelint |
| 6 | Headings use `font-headline` + `text-h1`..`text-h4`. Never `text-xl` / `text-lg` / `text-2xl`. | `grep -rn "font-headline text-\(xl\|lg\|2xl\)" src/app/ src/components/` is silent |
| 7 | Modals are `<AppDialog>` (or `<ConfirmDialog>` / `<DeleteRecordDialog>` / `<FormDialog>`). Never a hand-rolled backdrop + focus trap. | `grep -rn "signin-modal__backdrop" src/components/` only hits the two allowed files |
| 8 | Icon-only buttons are `<Button size="icon" aria-label="…">` (or `size="icon-sm"`). | TypeScript enforces the label |
| 9 | Dark mode must work. Toggle `data-theme="dark"` on `<html>` and check. Landing uses the theme-aware `--color-navy` / `--color-off-white`, not the invariant `--color-primary` / `--color-white`. | Manual |
| 10 | Reach for a primitive in `src/components/ui/` before writing a component or BEM class. | `ls src/components/ui/` |

And the rules that this document adds on top:

- Never put a Tailwind `/NN` opacity modifier on a `var()` color (`ring-[var(--x)]/20`). Tailwind 3.4 compiles it to nothing. Use a pre-mixed token or `color-mix()`.
- Only sizes from the type ramp (§3.2). Positive letter-spacing only on uppercase text.
- Hover styles exist only on devices that hover (§6.1).
- Name transition properties; never `transition: all` (§7).
- Cards never carry shadows, including on hover (§5).

---

## 1. Brand and atmosphere

Certified feels like a notary's ledger reimagined as a mobile app: austere, monochrome, quietly authoritative. The near-absence of color puts attention on content. Serif titles anchor each entry like a document heading while the chrome recedes into warm grays. No gradients, no brand accent hue, no playful illustration. The restraint is the brand.

Underneath sits a social feed. Activity cards scroll by like entries in a shared register; an endorsement carries the weight of a countersignature. The tension between institutional formality (certificates, seals, identity) and casual social patterns (feeds, follows, tabs) is the defining character.

**Mobile-first.** Every layout and interaction is designed for a phone first. On desktop the reading column stays editorial-width; wider pages are explicit opt-ins (§4.4), never a stretched column.

Key characteristics:

- Monochrome: near-black ink, warm grays, no accent color. Identity is carried by typography.
- Noto Serif for content titles, Inter for all chrome.
- `--radius: 2px` gives cards, buttons and dialogs a sharp, document-like edge.
- Full dark mode via `data-theme="dark"`. Surfaces flip; the primary button inverts.
- Mobile-native navigation: labeled bottom tab bar, bottom sheets with drag-to-dismiss, a translucent top navbar.
- Feed-centric: home is a feed, not a dashboard.

---

## 2. Color

Colors are custom properties in `:root`, overridden in `:root[data-theme="dark"]`. Values live in `tokens.css` only. CSS and JSX reference semantic tokens, never raw values or primitives.

### 2.1 Layers

| Layer | Tokens | Rule |
|---|---|---|
| Invariant primitives | `--color-primary`, `--color-white` | Never flip. Reserved for skip-nav and brand SVG. Do not use on app surfaces. |
| Semantic (app) | `--bg-*`, `--fg-*`, `--border-*`, `--overlay-*`, `--btn-*`, `--badge-*`, `--color-error/success/warning*`, `--focus-ring` | Flip in dark mode. Everything in the app uses these. |
| Landing palette | `--color-navy`, `--color-off-white`, `--color-gray-100`, `--color-light-gray`, `--color-mid-gray`, `--color-dark-gray`, `--color-surface`, `--color-surface-container-low` | Theme-aware. Landing (`lp-`) surfaces only; never inside a `ui/` primitive. |
| Theme-aware accent | `--color-accent`, `--color-accent-hover` | Muted interactive gray; overridden in dark mode. `--focus-ring` derives from it. |

### 2.2 Surfaces

| Token | Role |
|---|---|
| `--bg-sunken` | Recessed: toggle tracks, disabled filled controls, inset wells. |
| `--bg-canvas` | Page background. |
| `--bg-elevated` | Cards, inputs, popovers. Lighter than canvas in both themes. |
| `--bg-overlay` | `<AppDialog>` and the dialogs built on it. A lifted page (it resolves to the canvas value); inputs and cards inside it sit on `--bg-elevated`. Bottom sheet and drawer currently paint `--bg-elevated` instead. |
| `--bg-raised` | **A tint, not an elevation step.** A quiet filled area: code blocks, location cards, the `test` badge. In light mode it is darker than canvas; in dark mode lighter. Never use it to mean "above". |

### 2.3 Foregrounds

| Token | Role |
|---|---|
| `--fg-primary` | Headings, names, primary text, selected state. |
| `--fg-secondary` | Body text (the default on `body`), field labels. |
| `--fg-muted` | Placeholders, timestamps, helper text, inactive nav. |

### 2.4 Borders

Four tokens. All are transparent black (light) or white (dark) so they adapt to whatever they sit on.

| Token | Role |
|---|---|
| `--border-subtle` | Dividers between rows (feed cards, list items). |
| `--border-default` | Box edges: cards, text fields, dialogs, popovers. |
| `--border-hover` | Hover on bordered elements; unchecked states that need a touch more presence. |
| `--border-control` | Boundaries a user must find to operate a control: checkbox box, switch-off track. Meets 3:1 against its surface. |

Hairlines (`subtle`, `default`) separate content. `--border-control` is only for the checkbox box and the switch-off track; text fields keep the `default` hairline because their label always identifies them. The `<RadioGroup>` primitive draws no circle (its options are labeled buttons with a selected state), so radio is not covered by `--border-control` today. The old names (`--border-light`, `--border-medium`, `--border-hover-soft`) are removed; don't reintroduce them.

### 2.5 Status and badges

| Token family | Role |
|---|---|
| `--color-error` | Error text, destructive actions, error icons. |
| `--color-error-bg` / `-border` / `-ring` | Error-tinted surfaces, their border, and the invalid-field ring. |
| `--color-success`, `--color-warning` | **Fills and dots only.** As text on canvas they fail contrast. |
| `--color-success-text/-bg`, `--color-warning-text/-bg/-border` | Text and tinted surfaces for success and warning. |
| `--badge-success-*`, `--badge-warning-*`, `--badge-neutral-*` | Badge bg / fg / border triplets for status and quality pills. |
| `--badge-count-bg/fg` | Notification count pill. |
| `--badge-danger-*`, `--badge-accent-*` | Additive tones for cross-app parity; unreferenced in this app today. |
| `--accent-gold`, `--accent-gold-soft` | The single splash of color: deluxe contributor board hover only. |

Color is never the sole signal. Errors pair red with text and an icon; success pairs green with an icon or label.

### 2.6 Primary button

`--btn-primary-bg` / `--btn-primary-fg` invert in dark mode so the primary action always pops off the canvas. `--btn-primary-bg-hover` is the hover fill (§6.1).

### 2.7 Contrast

Every fg/bg pair gets a row here. Targets: ≥ 4.5:1 for text under 18px, ≥ 3:1 for icons and control boundaries. Ratios are WCAG 2.x, computed from `tokens.css`. Re-run them when a value changes.

| Pair | Light | Dark |
|---|---|---|
| `--fg-muted` on canvas / elevated / sunken | 5.61 / 5.91 / 5.10 | 6.34 / 4.89 / 6.74 |
| `--fg-secondary` on canvas / elevated | 8.88 / 9.35 | 10.52 / 8.12 |
| `--focus-ring` on canvas / elevated | 6.16 / 6.48 | 6.82 / 5.27 |
| `--badge-success-fg` on its bg | 4.79 | 6.73 |
| `--badge-warning-fg` on its bg | 5.56 | 6.12 |
| `--badge-neutral-fg` on its bg, over elevated | 5.42 | 5.12 |
| `--badge-count-fg` on `--badge-count-bg` | 6.47 | 4.83 |
| `--border-control` on canvas / elevated | 3.32 / 3.35 | 3.23 / 3.05 |
| `--color-success` / `--color-warning` as text on canvas | 2.00 / 1.93 (fills only) | n/a |

Weakest pair: dark `--fg-muted` on `--bg-elevated` (4.89). Don't darken elevated or lighten muted without re-checking it.

### 2.8 Overlays and scrim

| Token | Role |
|---|---|
| `--overlay-weak` | Hover fill on neutral surfaces (ghost button, row card, menu item). |
| `--overlay-medium` | Selected / pressed-toggle fill. |
| `--scrim` | The one dimming layer behind every blocking surface: AppDialog `::backdrop`, Drawer, BottomSheet, FeedbackModal (and the tour backdrop). 0.4 black in light, 0.6 in dark. A dialog and a sheet showing the same content dim the page by the same amount. `--modal-backdrop` is removed. |
| `--scrim-pill`, `--scrim-pill-hover`, `--scrim-pill-ghost` | Invariant pills over user images (avatar / banner "Change"). Don't flip with the theme. |
| `--media-letterbox` | Invariant black behind embedded video. |

### 2.9 Translucent chrome

Translucent chrome is always the surface it sits on at reduced alpha, never a separate literal: `--navbar-bg` is canvas at 80% (`color-mix()` toward transparent), `--sheet-bg` is elevated at 95% (both defined once, no dark override). The mobile navbar and the desktop top bar use `--navbar-bg`; the bottom nav is opaque (§4.3). Chrome blurs what scrolls under it (`backdrop-filter: blur(12px)`). Text over blur uses `--fg-primary` or `--fg-secondary`, never `--fg-muted`. The chrome edge is a 1px `--navbar-border` hairline (drawn with `--shadow-navbar-hairline`), not an elevation shadow.

### 2.10 Selection

`::selection` uses `--selection-bg` / `--selection-fg`: ink on paper in light, paper on ink in dark.

---

## 3. Typography

### 3.1 Families and loaded weights

| Var | Family | Loaded weights | Role |
|---|---|---|---|
| `--font-inter` | Inter | Variable font (every weight in one file); the system uses 400 / 500 / 600 | All chrome and body: buttons, nav, labels, descriptions. |
| `--font-headline` | Noto Serif (normal + italic) | 300 / 400 / 600 / 700 | Content titles. 300 is landing display only; 400 is landing item titles; 600 is app headings h2-h4; 700 is display, h1 and feed card titles. |
| `--font-mono` | System stack (`ui-monospace, SFMono-Regular, …`) | n/a | DIDs, AT URIs, code; on landing also registry numerals and stats. No web font. |

Inter and Noto Serif load via `next/font/google` with `display: swap`. A spec may only name a loaded weight: an unloaded serif weight silently renders as the nearest loaded face. Inter is loaded as a variable font, so 700 would render; the system still never uses it.

### 3.2 Type ramp

`tailwind.config.ts` `fontSize` is authoritative; this table must match it. Each step carries its own leading and tracking. The sizes are mirrored as `--text-*` tokens in `tokens.css` (`--text-display` … `--text-micro`) for CSS consumers, with `--tracking-label` (0.06em) and `--measure` (65ch).

| Utility | Size | Leading | Tracking | Weight | Font | Use |
|---|---|---|---|---|---|---|
| `text-display` | 3rem | 1.1 | -0.03em | 700 | serif | Rare app hero |
| `text-h1` | 2.25rem | 1.15 | -0.02em | 700 | serif | Wide-page title |
| `text-h2` | 1.75rem | 1.2 | -0.015em | 600 | serif | Page title in the content (column pages) |
| `text-h3` | 1.375rem | 1.3 | -0.01em | 600 | serif | Section title, profile name |
| `text-h4` | 1.125rem | 1.35 | -0.005em | 600 | serif | Card title, empty-state title, dialog and sheet title |
| `text-body` | 1rem | 1.6 | 0 | 400 | Inter | Reading text |
| `text-body-sm` | 0.875rem | 1.5 | 0 | 400 / 500 | Inter | Default UI text, descriptions, buttons |
| `text-ui` | 0.8125rem | 1.45 | 0 | none set (400 / 500) | Inter | Dense chrome, meta rows, menu items, field labels |
| `text-caption` | 0.75rem | 1.4 | +0.01em | none set (400 / 500) | Inter | Timestamps, helper and error text |
| `text-label` | 0.6875rem | 1.2 | +0.06em | 600 | Inter, uppercase, `'case' 1` | Eyebrows, section labels, square tags |
| `text-micro` | 0.625rem | 1 | +0.02em | 500 | Inter | Reserved for the tightest chrome; no consumer today |

Rules:

- Sizes not in this table are not allowed in new code. Snap 0.9375 / 0.85 / 0.9 / 0.95rem to `body-sm`; 0.7 / 0.78rem to `caption`.
- Feed card title is serif 700 at `h4` size on mobile, 1.25rem on desktop. It is the one sanctioned responsive app title.
- App type does not scale with the viewport. Landing display type is fluid via `clamp()` (§11).
- Two serif voices: the app speaks firm serif (600/700); the landing speaks light serif (300 display, 400 item titles). Don't mix them on one surface.

### 3.3 Tracking and case

- Positive tracking exists only on uppercase text, one value: `+0.06em` via `text-label` / `tracking-label`. The landing mono registry numerals are the only place wider tracking appears. (`caption` and `micro` carry their small optical tracking from the ramp.)
- Mixed-case text, including button labels and field labels, has 0 tracking. Spaced-out lowercase degrades word shapes.
- Serif headings get the slight negative tracking in their ramp step. Don't add more.
- UI copy is sentence case. Uppercase is a style (`text-label`), never typed into the string.

### 3.4 Numerals and OpenType

- Any number that changes or sits in a column uses `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`): counts, badges, pagination, timestamps, funding amounts, stats, table cells. Never `font-feature-settings` for this; it replaces other features on the element.
- `'case' 1` is part of `text-label`, not a per-class list.
- DIDs, AT URIs and wallet addresses use `slashed-zero` (`<WalletAddress>`).

### 3.5 Wrapping and measure

- `h1`-`h4` and serif titles use `text-wrap: balance`.
- Descriptions and long-form paragraphs use `text-wrap: pretty`.
- Prose caps at `--measure` (65ch) regardless of container width. 1280px pages hold grids, not paragraphs.
- Long unbroken strings (DIDs, URLs, handles) wrap via `overflow-wrap: break-word` on `body`; components that want an ellipsis set `white-space: nowrap` themselves.

### 3.6 Heading hierarchy

- The chrome title is the page's single `<h1>`: the mobile navbar title or the desktop top bar title (`AuthGuard` sets it when signed out).
- Page content therefore starts at `<h2>`. Section headings are `<h3>`; card and empty-state titles are `<h4>` (or the level passed via `headingLevel`).
- Visual size and DOM level are independent: pick the ramp step for the look and the element for the outline.

---

## 4. Layout

### 4.1 Shell

The app shell (`src/components/layout/app-shell.tsx`) is a single centered column. The left and right rails were retired in the Overview redesign; desktop chrome is the top bar.

| Viewport | Chrome | Content |
|---|---|---|
| < 800px | Mobile navbar (top) + labeled bottom nav + hamburger drawer | Column up to 720px, 16px side gutter |
| ≥ 800px | Desktop top bar (bottom nav, hamburger and mobile drawer unmount) | Column 600px; fullbleed pages up to 1280px |

`useLayoutBreakpoints()` mirrors the CSS breakpoints and JS-unmounts the components that must not exist on desktop (bottom nav, mobile drawer, hamburger). Everything else is CSS-only.

### 4.2 Mobile navbar (< 800px)

Fixed, `--navbar-height`, translucent chrome (§2.9). Hides on scroll down, returns on scroll up (compositor-only transform, `--transition-base`: 200ms `--ease-out`). On desktop `--navbar-height` is zeroed.

| Mode | Left | Center | Right |
|---|---|---|---|
| Default | Hamburger | Brandmark | Account switcher or sign-in |
| Titled page | Back | Page title (`<h1>`) | Empty |
| Profile overlay | Back in a floating pill | none | none |

In profile overlay mode the navbar is transparent so the banner reaches the top edge.

### 4.3 Bottom nav (< 800px)

Fixed bottom, `--bottom-nav-height` + `env(safe-area-inset-bottom)`; zeroed on desktop. Opaque `--bg-elevated` surface with a 1px `--border-subtle` top line (not translucent). Items: Home, Explore, Create (signed in), Apps, Feedback. Each item is a 24px icon over a short label (labels make ambiguous glyphs readable on touch, where tooltips are suppressed). The label is Inter 0.6875rem (the `label` size) / 500 / leading 1, mixed case with no tracking: it borrows the size, not the uppercase `text-label` style. Every item is at least 44px tall. Active: `--fg-primary` and a heavier icon stroke (1.5 → 2.5), never a fill or tint pill. Inactive: `--fg-muted`. Press: `scale(0.95)`. Hover color only under `(hover: hover) and (pointer: fine)`.

### 4.4 Desktop top bar (≥ 800px)

Mounted in the root layout as a sibling to `<main>`. Translucent chrome with a 1px `--navbar-border` line.

- **Row 1** (`--top-bar-row1`): brandmark, page title (`<h1>`, or a breadcrumb), search, labeled icon buttons, account switcher.
- **Row 2** (`--top-bar-row2`): the profile tabs strip, only on `/profile/[handle]`. `--top-bar-total` is row 1, or row 1 + row 2 on `.app-shell--fullbleed`.

### 4.5 Breakpoints

Three, everywhere: tokens `--bp-gt-mobile`, `--bp-gt-narrow-desktop`, `--bp-gt-desktop` (informational; `@media` can't read `var()`, so CSS hard-codes the numbers). Tailwind `screens` is replaced (not extended): `md` 800, `lg` 1100, `xl` 1300, so a stray `md:` can never resolve to 768.

| Range | What changes |
|---|---|
| < 800px | Mobile chrome, bottom sheets instead of dropdowns, 16px input text (iOS zoom rule), dialog actions stack |
| ≥ 800px | Desktop top bar; column narrows to 600px; dropdowns and centered dialogs replace sheets; tab panels slide |
| ≥ 1100px | Top-bar search widens and the switcher shows its text meta; profile Overview about-block and project detail go two-column |
| ≥ 1300px | Grid wrapper reaches its max width; endorsement grids go to three columns |

Write mobile first: base styles, then `@media (min-width: 800px)`. "Below desktop" is `max-width: 799px`. Never 768 / 760 / 640.

### 4.6 Container widths

| Context | Width | Notes |
|---|---|---|
| Reading column, mobile | 720px max | `.app-shell__content` |
| Reading column, desktop | 600px | Narrower on purpose; the column is editorial, not stretched |
| Fullbleed pages | 1280px | Profile, settings, workspace, cert detail, project detail. Opt in with `.app-shell--fullbleed`. |
| Page-frame pages | Edge to edge | Home and Explore carry their own sidebar/main split |
| Grid wrapper | 1300px | Ultra-wide screens get passive gutters |

Multi-column layouts are explicit opt-ins on wide pages (the profile Overview is an intentional two-column layout). The reading column never gets a second column.

### 4.7 Spacing and rhythm

Scale (Tailwind steps): **4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64** (`1 2 3 4 5 6 8 12 16`). 2 / 6 / 10 are allowed only inside controls to hit a fixed height (Button md `py-2.5` → 40px on desktop), never between elements.

| Relationship | Space |
|---|---|
| Label → its control | 6 (`mb-1.5`, the one in-control exception) |
| Field → field, paragraph → paragraph | 16 |
| Heading → its content | 8 (h4) / 12 (h3) / 16 (h2 and up) |
| Related groups within a card or section | 24 |
| Section → section | 32 mobile / 48 desktop |
| Page top → first heading | 24 mobile / 32 desktop |

Proximity rule: the space above a heading is always at least twice the space below it. Whitespace, not borders, carries the structure: feed cards are separated by one hairline and the padding around it; settings stack cards with space rather than nesting them in containers.

### 4.8 Radius

| Value | Token | Use |
|---|---|---|
| 2px | `var(--radius)` (Tailwind `rounded`) | Everything: cards, buttons, inputs, dialogs, sheets (top corners), images, square chips |
| 999px | `var(--radius-pill)` | Pills: badges, feed labels |
| 50% | literal | Circles: avatars, dots, step numbers |

No other value, at any viewport.

### 4.9 Images

| Context | Ratio | Fit | Radius | Placeholder |
|---|---|---|---|---|
| Feed card image | 1:1 | cover | `--radius` | `--bg-sunken` |
| Activity detail image | 16:9 | cover | `--radius` | `--bg-sunken` |
| Profile banner | free (fixed height) | cover | none (full-bleed) | `--bg-sunken` fill |
| Avatar | 1:1 | cover | 50% | `--color-surface-container-high` + initials |
| Partner / app logo | 1:1 | cover | `--radius` | `--bg-canvas` |

Every image has `loading="lazy"` and an `onError` fallback: feed images hide their wrapper, avatars show initials, banners show the fill.

### 4.10 Z-index

Every layer is a `--z-*` token in `tokens.css`. Lowest to highest: `--z-local-raise`, `--z-rail-sticky`, `--z-popover`, `--z-navbar` / `--z-bottom-nav`, `--z-feedback-trigger` (floating Feedback button: above the nav bars, below sheets and dialogs), `--z-portal-sheet`, `--z-modal`, `--z-skip-nav`, `--z-feedback`, `--z-feedback-above`, `--z-tour-backdrop`, `--z-tour-card`, `--z-tooltip`. A genuinely new layer gets a new token, placed in this order.

---

## 5. Depth and elevation

Depth is carried by surface lightness and hairlines, not shadows.

| Level | Surface | Edge | Shadow | Use |
|---|---|---|---|---|
| Sunken | `--bg-sunken` | none | none | Tracks, wells, disabled fills |
| Canvas | `--bg-canvas` | none | none | Page |
| Elevated | `--bg-elevated` | `--border-default` | none | Cards, inputs |
| Floating | `--bg-elevated` | `--border-default` | `--shadow-md` | Popover, toast. Tooltip is the exception: an inverted bubble (`--fg-primary` fill, `--bg-canvas` text, `--shadow-md`). |
| Overlay | `--bg-overlay` (dialog), `--bg-elevated` (sheet, drawer) | `--border-default` (dialog) | `--shadow-modal` (dialog), `--shadow-lg` (drawer), none (sheet) | Dialogs, sheets, drawers, over `--scrim` |

Elevation shadow tokens:

| Token | Use |
|---|---|
| `--shadow-sm` | Controls only: switch thumb, segmented active segment |
| `--shadow-md` | Popover, tooltip, toast, floating Feedback button |
| `--shadow-lg` | Drawer |
| `--shadow-modal` | AppDialog (Tailwind `shadow-modal`), the feedback modal, the domain modal and the landing contact modal. Dialogs only. |

Ring and hairline tokens (box-shadow used as a border or halo, not elevation): `--shadow-ring-weak` (hover / selected halo), `--shadow-ring-medium` (active swatch), `--shadow-ring-focus` (focus ring drawn as a shadow), `--shadow-ring-error` (invalid-input halo), `--shadow-ring-elevated` (surface-colored gap ring, stacked avatars), `--shadow-outline-subtle` (1px outer outline), `--shadow-inset-subtle` / `--shadow-inset-hover` (1px inner border), `--shadow-inset-indicator` (left active-item bar), `--shadow-navbar-hairline` (navbar bottom line). They compose with commas.

Rules:

- Cards never get shadows, including on hover. A hoverable card shifts its border to `--border-hover`.
- In dark mode, elevation is carried by surface lightness plus a hairline. Shadows stay but are not relied on. A floating surface is at least one step lighter than what is directly beneath it.
- No backdrop blur on dialogs; blur is for translucent chrome only (§2.9). Known exception in code: `.feedback-modal__backdrop` still blurs 8px.

---

## 6. Interaction

### 6.1 States

| State | Neutral (ghost, row, menu item, tab) | Filled (primary) | Outlined (secondary, field, elevated card) |
|---|---|---|---|
| Hover | bg `--overlay-weak`, text → `--fg-primary` | bg `--btn-primary-bg-hover` | border → `--border-hover` |
| Active (press) | `.press-scale`: `scale(0.98)`, `--duration-instant` | same | same |
| Selected / pressed toggle | bg `--overlay-medium` + `--fg-primary` + weight 600 | n/a | border `--fg-primary` |
| Focus-visible | §6.2 | same | same |
| Disabled | `opacity: var(--opacity-disabled)`, `cursor: not-allowed`, no hover | `--bg-sunken` fill + `--fg-muted` text + `--border-default` | opacity + `--bg-sunken` fill |
| Loading | Keep the fill; a spinner replaces the leading icon; `aria-busy` | same | same |

- Hover applies only on devices that hover. Tailwind `future.hoverOnlyWhenSupported` gates every `hover:` utility; hand-written CSS wraps `:hover` in `@media (hover: hover)`. A tap must never leave a sticky hover.
- Selected is never hover: selection is `--overlay-medium` plus a weight or stroke change, never color alone.
- Interactive elements that can be long-pressed (buttons, nav items) set `user-select: none` and `-webkit-touch-callout: none`.

### 6.2 Focus

One color, two geometries. Color is `--focus-ring` (derived from `--color-accent`, theme-aware).

| Geometry | Applies to | Recipe |
|---|---|---|
| Outline | Buttons, links, tabs, checkbox, radio, switch, menu items, anything with `tabindex` | `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px }` (global rule in `tokens.css`; primitives repeat it as utilities) |
| Field | Input, Textarea, Select, Combobox | `:focus`: border → `--focus-ring`, plus a 1px ring inside the radius, no offset (fields sit close together) |

Safety net: `tokens.css` sets `--tw-ring-color` on every element to `--focus-ring` mixed toward transparent, so any `ring-*` utility is gray, never Tailwind's default blue. Invalid fields swap the ring to `--color-error-ring`.

### 6.3 Control heights and hit areas

The scale is `--control-h-compact` / `-sm` / `-md` / `-lg`, exposed as Tailwind `h-control-*` / `min-h-control-*`.

| Height | Token | Use |
|---|---|---|
| 32 | `h-control-compact` | Compact, desktop only (`icon-sm` visual) |
| 36 | `h-control-sm` | `<Input size="sm">` |
| 44 | `h-control-md` | `<Input size="md">`, `<Button size="icon">` below 800px; every control's minimum below 800px |
| 56 | `h-control-lg` | `<Input size="lg">` (sign-in field) |

- `<Button size="icon">` is 44 on mobile, 40 on desktop.
- `<Button size="icon-sm">` is 32 visual, with its hit area expanded to 44 by a transparent `::after` (inset -6px).
- Dismiss and close controls in Dialog, Sheet, Banner and Toast are `<Button size="icon-sm" variant="ghost" aria-label="Close">`, never hand-rolled.
- `sm` and `md` Buttons carry `min-h-control-md` below 800px (reset with `md:min-h-0`), so a compact desktop control is still 44 on touch.
- **Not yet applied to Button sizes.** Button `sm` / `md` / `lg` are still padding-driven at about 30 / 40 / 44px on desktop (§9.1), not 32 / 36-44 / 56 from this scale. Moving them is an open owner decision.
- `<SegmentedControl>` is off the scale too: `sm` 28px, `md` 32px.

### 6.4 Touch

- Inputs are at least 16px font size below 800px, or iOS Safari zooms on focus. Tailwind `md:text-sm` on fields flips at 800, not 768.
- Safe-area insets: bottom nav, bottom sheets and the floating Feedback button respect `env(safe-area-inset-bottom)`.
- Dialog actions stack (column-reverse, primary on top) below 800px.

---

## 7. Motion

### 7.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 100ms | Press, color flips |
| `--duration-fast` | 150ms | Hover, focus, small fades, popover and toast enter/exit, every reduced-motion fade |
| `--duration-base` | 200ms | Scrim fade, tab-panel slide, navbar hide, drawer exit |
| `--duration-slow` | 300ms | Dialog, sheet, drawer enter |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Default for UI |
| `--ease-emphasized` | `cubic-bezier(0.16, 1, 0.3, 1)` | Signature curve for dialogs, sheets, drawers. Expo-out: fast start, long settle, **no overshoot** (both control-point y values are ≤ 1). |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | On-screen movement of something already visible. Defined (and in Tailwind as `ease-in-out`) but no consumer yet; the navbar hide uses `--transition-base`. |

`--transition-fast` and `--transition-base` remain as aliases (`--duration-fast` / `--duration-base` + `--ease-out`) for existing CSS. `--transition-slow` is removed. Tailwind exposes the tokens in `transitionDuration` (`duration-instant|fast|base|slow`; bare `transition-*` defaults to fast) and `transitionTimingFunction` (`ease-out|emphasized|in-out`; default `--ease-out`).

### 7.2 Rules

- Exits run at about 75% of the enter duration.
- Never `transition: all`. Name properties: `transform, opacity` for movement; `background-color, border-color, color` for state.
- Never `ease-in` for UI.
- Nothing enters from `scale(0)`; the smallest start is 0.95.
- Animate `transform` and `opacity` only; never layout properties.
- Keyframes are defined once (no duplicate `@keyframes` across files).

### 7.3 Recipes

| Element | Enter | Exit |
|---|---|---|
| Button / card press | `scale(0.98)`, instant, `--ease-out` | eases back on release |
| Bottom-nav press | `scale(0.95)` | eases back |
| Popover | `--duration-fast` (150ms) fade + `scale(0.97)` + 2px drop from the trigger side, via `@starting-style` | unmount |
| Tooltip | appears after a 300ms hover delay, no fade | unmount |
| Toast | `--duration-fast` (150ms) fade + 8px rise | 150ms fade + 8px drop, then removed on `transitionend` |
| Tab panel (≥ 800px) | `--duration-base` (200ms) `--ease-emphasized` fade + 12px slide from the direction of the new tab | none |
| Dialog | scrim fades `--duration-base`; panel rises 16px from `scale(0.98)`, `--duration-slow` `--ease-emphasized` | none (native close) |
| Drawer | `--duration-slow` (300ms) slide, `--ease-emphasized`; scrim `--duration-base` fade | `--duration-base` (200ms), `--ease-emphasized` |
| Bottom sheet | `--duration-slow` slide up, `--ease-emphasized`; scrim `--duration-base` fade | 75% of slow (225ms), `--ease-emphasized`; scrim `--duration-fast`. Drag follows the finger; past threshold it dismisses |
| Skeleton | invisible for 200ms, 150ms fade-in, then one pulse: opacity 1 → 0.5 → 1 over 1.5s ease-in-out | content replaces it |
| Navbar hide | `translateY(-100%)`, `--transition-base` (200ms `--ease-out`) | reverse |
| Loading screen | Brandmark opacity/scale pulse, slow | n/a |

There is one pulse recipe (`animate-skeleton` / `animate-pulse` in `tailwind.config.ts`). Don't author another.

### 7.4 Reduced motion

Under `prefers-reduced-motion: reduce`, movement goes and meaning stays.

- Translate, scale, rotate and parallax are removed.
- The global backstop in `tokens.css` collapses every animation and transition to its end state, stops `infinite` loops after one iteration (no 0.01ms flicker), and clears delays.
- Primitives that communicate state with a fade (dialog, toast, tab panel, popover) keep a short opacity fade at `--duration-fast` (150ms): dialog and toast via the `.motion-reduce-fade` opt-in, tab panel and popover via their own reduced-motion rules.
- Spinners keep turning. `.animate-spin` and the named spinner classes are exempted from the backstop (1s, infinite): they carry status, not decoration. Loading still never relies on motion alone; pair a spinner with `aria-busy` and a label.
- The skeleton pulse, drawer slide and `.press-scale` press are switched off.
- Landing has its own three-brake contract (§11.3).

---

## 8. Icons

All icons are Lucide React (`lucide-react`). The cert icon is Tabler, wrapped by `<CertIcon>` with a Lucide-compatible `strokeWidth`; don't import Tabler elsewhere.

| Size | Pairs with | Stroke | Use |
|---|---|---|---|
| 12 | `label` / `caption` | 2 | Meta-row glyphs, badge icons |
| 14 | `ui` / `body-sm` | 1.75 | Inline actions, menu items, chevrons |
| 16 | `body`, Button md | 1.75 | Button icons, toast and banner icons |
| 20 | chrome | 1.5 | Top bar, navbar |
| 24 | bottom nav | 1.5, **2.5 active** | Bottom nav; active is a heavier stroke, never a fill |
| 40 | empty state | 1.25 | `EmptyState` rich (hard-coded in the primitive) |

- Smaller icons get heavier strokes so the rendered weight stays constant. Snap 11 / 13 / 15px to the nearest step.
- Icons inherit `currentColor`. Never `fill`.
- Decorative icons get `aria-hidden`. Icon-only controls get an `aria-label` (and a tooltip comes free on `<Button size="icon">`).

---

## 9. Components

`src/components/ui/` is the catalog. `AGENTS.md` §12 lists the full API surface; this section covers the visual contract. BEM classes such as `.app-card`, `.dash-card` and `.feed-card` are legacy: migrate toward the primitive when you touch them.

### 9.1 Button

`<Button variant size loading pressed tooltip href>`.

| Variant | Rest | Hover | Use |
|---|---|---|---|
| `primary` | `--btn-primary-bg` / `--btn-primary-fg` | `--btn-primary-bg-hover` | Main action, form submit. One per view. |
| `secondary` | transparent, `--fg-primary`, `--border-default` | border `--border-hover` | Cancel, secondary actions |
| `ghost` | transparent, `--fg-muted` | `--overlay-weak`, `--fg-primary` | Toolbar actions |
| `destructive` | `--color-error-bg`, `--color-error`, `--color-error-border` | slightly stronger tint | Delete, remove |

| Size | Height (desktop / below 800px) | Text |
|---|---|---|
| `sm` | ~30 (padding-driven, `py-1.5`) / 44 min | `text-xs` (0.75rem) |
| `md` | ~40 (padding-driven, `py-2.5`) / 44 min | `text-sm` (0.875rem) |
| `lg` | ~44 (padding-driven, `py-3`) / same | `text-sm` |
| `icon` | 40 square / 44 square | n/a; requires `aria-label` |
| `icon-sm` | 32 visual, 44 hit / same | n/a; requires `aria-label` |

The control-height scale (§6.3) is **not yet applied** to `sm` / `md` / `lg`; their heights come from padding plus line height (secondary and destructive add 2px of border). Moving them onto `h-control-*` is an open owner decision.

All buttons: `var(--radius)`, weight 500, 0 tracking, named-property transitions, `.press-scale`. `pressed` (toggle buttons) uses the selected state from §6.1. `href` renders a `next/link` with the same chrome. Filled variants disable to a sunken fill; outlined and ghost variants disable by opacity.

### 9.2 Fields: Input, Textarea, Select, Combobox

- `<Input size="sm|md|lg|bare">`: `sm|md|lg` are `h-control-sm|md|lg` (36 / 44 / 56px); `bare` has no fixed height and inherits type from its parent. `variant="default|underline|inline-edit"`; an optional `density` overrides padding and text size. Sign-in uses `size="lg"`; type-to-confirm uses `inline-edit`.
- Rest: `--bg-elevated`, 1px `--border-default`, `var(--radius)`, 16px horizontal padding. Focus: §6.2. Error: border `--color-error` + `--color-error-ring`.
- **Label:** `text-ui` (0.8125rem) / 500 / 0 tracking / `--fg-secondary`, sentence case, 6px above the control.
- **Helper text:** `text-caption` / `--fg-muted`.
- **Error text:** `text-caption` / `--color-error`, with an icon. Wired via `aria-describedby` / `aria-invalid`.
- The uppercase `text-label` step is for section eyebrows, never field labels.
- The checkbox box and the switch-off track use `--border-control` for their boundary (§2.4). `<RadioGroup>` draws no circle, so it has no control boundary to apply it to.

### 9.3 Badge

`<Badge>` is the single badge primitive. `<FeedLabelPill>` composes it for activity quality labels.

| Variant | Colors | Notes |
|---|---|---|
| `verified` | `--badge-success-*` + CheckCircle | Status, full density |
| `pending` | `--badge-warning-*` + Clock | Status, full density |
| `unverified` | `--badge-neutral-*` | Status, full density |
| `high-quality` / `draft` | `--badge-success-*` / `--badge-warning-*` | Quality, compact |
| `standard` | `--bg-sunken`, `--fg-secondary` | Quality, compact |
| `test` | `--bg-raised` (tint), `--fg-muted` | Quality, compact |
| `tag` | `--bg-sunken`, `--fg-secondary`, uppercase | Compact |
| `role` | `--bg-canvas`, `--fg-muted` | Membership role, compact |
| `count` | `--badge-count-*`; `tone="neutral"` repaints to sunken/muted | Notification count, compact, tabular |
| `count-bare` | `--fg-muted`, no chrome | Right-aligned section counts, tabular |

- Shape defaults to pill. `shape="square"` is a `var(--radius)` uppercase chip whose palette comes from `tone` (`error` / `warn` / `success` / `neutral`).
- `compact` overrides density (compact: `caption`; full: `body-sm`).
- Counts use `formatCountBadge(count, more?)`: `null` at ≤ 0, the number for 1-98, `99+` above.

### 9.4 Card

`<Card variant="row|elevated|inset" hoverable unpadded as>`.

| Variant | Surface | Edge | Hover (`hoverable`) |
|---|---|---|---|
| `row` | transparent | bottom `--border-subtle` | `--overlay-weak` fill |
| `elevated` | `--bg-elevated` | `--border-default`, `var(--radius)` | border → `--border-hover`; no shadow |
| `inset` | `--bg-canvas` | `--border-default`, `var(--radius)` | border → `--border-hover` |

The feed card is the `row` pattern: no fill, a hairline below, generous vertical padding, byline, optional 1:1 image, serif title, three-line description, meta row.

### 9.5 Avatar and IdentityRow

- `<Avatar size="xs|sm|md|lg|xl|2xl">` (20 / 32 / 48 / 64 / 96 / 240). Always a circle. Fallback: `--color-surface-container-high` with initials from `getInitials()`.
- `<IdentityRow did handle displayName avatarUrl href size loading>` is the one avatar + name + `@handle` byline. Primary line resolves `displayName` → `handle` → truncated DID, `font-medium` `--fg-primary`; the handle line shows only when a real handle exists, `--fg-muted`. Both truncate.

### 9.6 Tabs, SegmentedControl, Pagination

- `<Tabs>` / `<TabList>` / `<Tab>` / `<TabPanel>`: ARIA tablist with arrow keys. Active tab: `--fg-primary`, weight 600, underline indicator. Wrap panels in `<TabPanelTransition>` for the desktop slide.
- `<SegmentedControl>`: active segment on `--bg-elevated` with `--shadow-sm`.
- `<Pagination>`: Previous / "Page X of Y" / Next with `tabular-nums` and `aria-live="polite"`; returns `null` for one page. It is the explicit pager; `<LoadMoreSentinel>` is the infinite-scroll alternative. Pick one per surface.

### 9.7 Popover, Tooltip

- `<Popover>` + `<PopoverTrigger>` / `<PopoverContent>` / `<PopoverItem>` for menus: `role="menu"`, click-outside, Esc, focus restore. Floating level (§5).
- A panel holding form controls (filters) is a `role="dialog"` wrapper with `useClickOutsideClose`. Those are the only two popover patterns.
- `<Tooltip>` is suppressed on touch; never put essential information only in a tooltip.

### 9.8 Dialogs

All modals are `<AppDialog>`: native `<dialog>` + `showModal()`, per-layer Esc, wrapping Tab trap, focus restore, backdrop-click close (suppressible with `disableBackdropClose`), `autoFocusFirst` / `initialFocusRef`. It is `position: fixed` in the top layer; don't make it relative.

- Surface `--bg-overlay`, `--border-default`, `var(--radius)`, `--shadow-modal`, over `--scrim`. Max width 420px; full width below 800px.
- Slots: `<AppDialogHeader title onClose? disabled?>` (always left-aligned; the old `center` prop is removed), `<AppDialogBody>` (the padded region; the dialog owns scroll). The consumer provides the footer. Omit `onClose` for `alertdialog` flows whose only exits are footer buttons.
- `<ConfirmDialog>`, `<DeleteRecordDialog>`, `<FormDialog>` wrap it. `<ResponsiveDialog>` shows a dropdown or AppDialog at ≥ 800px and a bottom sheet below.

**Dialog voice:**

- The title is `font-headline text-h4` (serif), balanced, left-aligned, with the close control at the trailing edge. Sheets use the same title so `ResponsiveDialog` content doesn't change typeface at 800px.
- An eyebrow above the title, if needed, uses `text-label`.
- The title names the thing or the action ("Delete this activity?"), not "Confirm".
- Body copy is `body-sm` `--fg-secondary`, one or two sentences that state the consequence.
- The primary button repeats the verb ("Delete", "Save changes"), never "OK" / "Yes". The cancel button is `secondary` and says "Cancel".
- Destructive confirmations use the `destructive` variant; irreversible deletes of named records use `<DeleteRecordDialog>` (type to confirm).

### 9.9 Bottom sheet and drawer

- `<BottomSheet>` (< 800px): fixed bottom, `--bg-elevated`, `var(--radius)` top corners, serif `text-h4` title, drag handle, swipe down to dismiss, swipe up to expand, max 70vh, safe-area padding, over `--scrim`. Used for the account switcher and mobile feedback.
- `<Drawer>`: side panel (83.33% wide, max 320px), `--bg-elevated`, `--shadow-lg`, over `--scrim`. Used for the mobile hamburger menu.
- Both lock body scroll via `use-body-scroll-lock` (which toggles `html` overflow; `scrollbar-gutter: stable` keeps the page from shifting).

### 9.10 Feedback surfaces

| Primitive | When |
|---|---|
| `<ErrorMessage title message onRetry>` | A section failed to load. Replaces the section in place. Error-tinted surface with an icon. |
| `<Banner variant>` | Page-level degraded or info state that persists while it is true. |
| `toast` | Transient result of an action. Errors that need action stay until dismissed; others auto-dismiss. |
| `<EditBanner>` | Sticky edit-mode chrome (Cancel + Save) on profile, project and cert edit pages. |
| `<ErrorBoundaryFallback>` | A render crash. |

### 9.11 EmptyState and Skeleton

- `<EmptyState variant="rich">`: centered optional icon (40px, 1.25 stroke), serif `text-h4` title, `--fg-muted` description, action slot. `variant="inline"`: one muted line, no icon or container; it replaces the old `*__empty` BEM hints. (`compact` is a back-compat alias of `inline`.)
- `<Skeleton variant="line|box|circle|text">`: fill `--overlay-weak`, the one pulse recipe (§7.3; off under reduced motion), mirrors the final geometry (rectangles where text goes, circles where avatars go, same spacing). `aria-hidden`.

### 9.12 Distinctive patterns

- **Shapeshifting mobile navbar:** three modes (§4.2), switching instantly on route change.
- **Bottom-sheet account switcher:** a sheet on mobile, a dropdown on desktop; reflects the acting identity (`useOrg().activeOrg`).
- **Feed with evaluator filter:** tapping the active "For you" tab opens an inline filter panel; a non-default filter renames the tab "Custom" and the unfiltered state shows a caution banner.
- **Profile hero:** full-bleed banner with the avatar overlapping downward; the navbar goes transparent over it.

---

## 10. Async states and copy

### 10.1 Loading, empty, error

| Situation | Pattern |
|---|---|
| List, feed or card content loading (expected < ~2s) | `<Skeleton>` mirroring the final geometry. It appears only after 200ms, so fast loads never flash. |
| Whole-route auth or bootstrap | `<LoadingSpinner>` (Brandmark pulse), centered |
| Action in progress | Button `loading`. Never a page spinner. |
| Empty because the owner has made nothing yet | `<EmptyState variant="rich">` **with an action** (the CTA that creates the first item) |
| Empty on someone else's profile | `<EmptyState>` with plain text, no action |
| Empty because of a filter or search | `<EmptyState variant="inline">` plus a "Clear filters" action |
| A section failed to load | `<ErrorMessage onRetry>` in place of the section |
| Page-level degraded or info state | `<Banner>` |
| An action failed or succeeded | `toast` |

Don't gate the navbar on auth loading; render placeholders so the layout is stable.

### 10.2 Error messages

Errors are plain language a person can act on. Map failed responses through `toUserErrorMessage(status, message, fallback)` (`src/lib/utils/api.ts`): human-written 4xx messages pass through; expired sessions, rate limits, server errors and technical strings become a plain sentence ("Your session has expired. Sign in again to continue."). Never show status codes, stack traces, XRPC method names or raw upstream text. Say what happened and what to do next.

### 10.3 UI copy

- Sentence case everywhere: titles, buttons, labels, tabs.
- Straight apostrophes and quotes (`'`, `"`) in UI strings; no curly quotes.
- No emojis.
- Buttons are verbs ("Save changes", "Endorse"). Empty states say what is missing and how to add it.

---

## 11. Landing page system

The `/welcome` landing page has its own register, namespaced `lp-` in `src/app/styles/landing.css`, components in `src/components/landing/`. It shares the app's tokens but speaks differently: editorial, engraved, monochrome. Raw values are allowed in `landing.css` (hard rule 2); everything still flips in dark mode via the landing palette.

### 11.1 Layout grammar

- **One canvas, ruled sections.** Every section sits on `--color-off-white`; sections are separated by full-width 1px rules (`--color-light-gray`), not background tints. Content max width 1280px; section padding fluid via `clamp()`.
- **One inversion.** The organizations band (`.lp-band`) is the page's single polarity flip: `--color-navy` surface, `--color-off-white` ink. In dark mode it flips the other way; the contrast event is the constant. It remaps `--band-rule`, `--btn-primary-bg/fg` and `--focus-ring` locally. Don't add a second inversion.
- **Numbered items** (`.lp-item`): overline, mono registry numeral (`01`), serif title, sans body.
- **Asymmetric splits** (`.lp-split`): sticky header left, rows right. Hairline-divided grids instead of cards.

### 11.2 Landing type

| Role | Font | Size | Weight | Leading | Tracking |
|---|---|---|---|---|---|
| Hero title | serif | `clamp(2.625rem, 1.5rem + 4.5vw, 4.75rem)` | 300 | 1.04 | -0.03em |
| Section title (`.lp-h2`) | serif | `clamp(1.75rem, 1.25rem + 2vw, 2.75rem)` | 300 | 1.12 | -0.02em |
| Item title (`.lp-item__title`) | serif | `clamp(1.25rem, 1.125rem + 0.5vw, 1.5rem)` | 400 | 1.25 | 0 |
| Registry numeral | mono | 0.75rem | 500 | 1 | +0.08em |
| Stats figure | mono | fluid `clamp()` | 500 | 1 | 0, `tabular-nums` |

Fluid type is a landing-only exception to the fixed ramp.

### 11.3 Guilloche and motion

- **Guilloche** (`guilloche-art.tsx`): engine-turned ornament as inline SVG, one path per zone stamped as rotated/scaled `<use>` copies. Ink density does the shading: `currentColor` hairlines with `vector-effect="non-scaling-stroke"` at tiered opacities inside a wrapper set to `--color-navy`, so dark mode flips for free. No gradients, no images.
- The hero plate SMIL-morphs between shapes sampled with matching point counts, sits in a scroll-scrubbed 3D rig, and renders a second time (own `idPrefix`, since SVG ids are document-global) in the closing section.
- Wanderers are dash segments with comet-dot heads lapping the stamped outlines.
- Rows fade up and holdings glyphs animate via CSS scroll-driven animations (`animation-timeline: view()`, behind `@supports`).
- **Reduced motion needs three brakes:** the global backstop freezes CSS animations; scrubbed `view()` timelines ignore the duration trick and need explicit `animation: none`; SMIL needs `svg.pauseAnimations()` (done in `GuillocheArt`). Markup opacities are the finished state, so static rendering is correct.

### 11.4 Other notes

- Real `<button>` CTAs use `<Button>`. Link and modal CTAs styled as buttons use `.lp-btn` (+ `.lp-contact-btn`), which read the same `--btn-primary-*` tokens so the band inversion applies to both.
- "Get in touch" opens the feedback modal's `contact` variant (`useFeedback().openFeedback("contact")`).

---

## 12. Enforcement

Description alone hasn't stopped drift, so the hard rules are checked by machine.

**Stylelint (CI, failing).** `npm run lint:css` (stylelint 16, config `stylelint.config.mjs`, CI step "Lint CSS" in the verify job) runs over `src/**/*.css`:

| Rule | What passes |
|---|---|
| Colors | No hex, no `rgb()` / `rgba()` / `hsl()` / `hsla()` (or other color functions), no named colors. Use tokens. |
| Shadows | `box-shadow` is `var(--shadow-*)`, a comma list of them, or `none`. |
| Z-index | `var(--z-*)`, `calc(var(--z-*) ± n)`, `auto`, `0`. Local stacking uses `--z-local-raise`. |
| Radius | `var(--radius)`, `var(--radius-pill)`, `999px`, `50%`, `0`, `inherit` (per corner too). |
| Breakpoints | `min-width` 800 / 1100 / 1300 and `max-width` 799 / 1099 / 1299 only; `width` / `height` media features are disallowed. |

`tokens.css` and `landing.css` are exempt from the color and shadow rules only; radius, z-index and breakpoints apply everywhere. Font size, letter-spacing and transition duration are documented (§3, §7) but not enforced.

**Greps** (the `CLAUDE.md` first checks; all silent):

```bash
grep -rEn "border-radius:\s+(4|6|8|12|16|20)px" src/app/styles/
grep -rEn "@media.*?\((max|min)-width:\s*(76[08]|64[80])px\)" src/app/styles/
grep -rn "font-headline text-\(xl\|lg\|2xl\)" src/app/ src/components/
grep -rn "signin-modal__backdrop" src/components/ | grep -v "ui/sign-in-modal.tsx\|ui/feedback-modal.tsx"
grep -rEn "\[var\(--[a-z0-9-]+\)\]/[0-9]+" src/    # dead Tailwind opacity modifier on a var() color
```

Then `npm run lint:css`, `npx tsc --noEmit` and `npm run lint` (no change against main's baseline).

---

## 13. Agent prompt guide

Prompts name tokens, not hex. Look values up in `tokens.css` if you need them.

### 13.1 Example prompts

**Feed card:** "`<Card variant="row">`: no fill, hairline `--border-subtle` below, 20px vertical padding (24 on desktop). `<IdentityRow size="sm">` byline. Optional 1:1 image at `var(--radius)`. Title serif 700 at `text-h4` (1.25rem on desktop), `--fg-primary`, balanced. Description `body-sm` `--fg-secondary`, three-line clamp, `text-wrap: pretty`. Meta row `text-ui` `--fg-muted` with dot separators, `tabular-nums` timestamps, compact badges."

**Primary button:** "`<Button variant="primary">`: `--btn-primary-bg` / `--btn-primary-fg`, `body-sm` 500, 0 tracking, `var(--radius)`, about 40px on desktop and 44px minimum below 800px. Hover `--btn-primary-bg-hover` (hover devices only). Press `scale(0.98)`. Disabled: sunken fill, muted text, default border. `loading` shows a spinner and sets `aria-busy`."

**Settings card:** "`<Card variant="elevated">`, 24px padding. Eyebrow above in `text-label` `--fg-muted`. Fields with sentence-case `text-ui` 500 labels in `--fg-secondary`, 16px between fields."

**Confirm dialog:** "`<ConfirmDialog>`: serif `text-h4` title naming the action, one sentence of consequence in `body-sm` `--fg-secondary`, `secondary` Cancel and a primary (or destructive) button that repeats the verb. Actions stack below 800px."

**Bottom nav:** "Fixed bottom, `--bottom-nav-height` + safe area, opaque `--bg-elevated` with a `--border-subtle` top line. Five items, each a 24px icon over a short 0.6875rem / 500 mixed-case label, at least 44px tall. Active: `--fg-primary` and a heavier stroke (2.5). Inactive: `--fg-muted`. Press `scale(0.95)`."

**Skeleton:** "`<Skeleton>` shapes mirroring the feed card: 1:1 box, 70% title line, full and 45% description lines, a row of small pills. Fill `--overlay-weak`, the shared `animate-skeleton` recipe."

**Dark mode:** "Same structure; tokens flip on their own. Check that every text pair in the contrast table still holds and that floating surfaces are a step lighter than what's under them."

### 13.2 Common mistakes

- Copying hex values into components instead of tokens. Values change; tokens don't.
- Using `--color-primary` / `--color-white` (invariant) where a theme-aware token is needed, or `--color-off-white` / `--color-mid-gray` (landing) inside an app primitive.
- Putting a second column into the reading column. Wide layouts are explicit fullbleed opt-ins.
- Shadows on cards. Use the border shift.
- Filled icons, or active states shown by color alone.
- Wide tracking on mixed-case text, or a font size off the ramp.
- Naming a font weight outside the system (Inter 700) or one that isn't loaded (Noto Serif 500).
- `ring-[var(--x)]/20` and similar opacity modifiers on `var()` colors.
- A `hover:` style written in plain CSS without `(hover: hover)`.
- Forgetting `onError` on images.
- Using `--bg-raised` to mean "above". It's a tint.

### 13.3 Iteration checklist

1. Look in `src/components/ui/` first.
2. Use tokens; never hard-code colors, shadows, z-index or radii.
3. Mobile first; `@media (min-width: 800px)` for desktop.
4. Pick sizes from the type ramp and spacing scale.
5. Cover every state: hover, press, focus, selected, disabled, loading, empty, error.
6. Toggle `data-theme="dark"` and check.
7. Turn on reduced motion and check that nothing is lost.
8. Run the §12 checks.

---

## 14. Token appendix

Names only; values are in `tokens.css`.

| Group | Tokens |
|---|---|
| Invariant | `--color-primary`, `--color-white` |
| Accent | `--color-accent`, `--color-accent-hover`, `--accent-gold`, `--accent-gold-soft` |
| Landing | `--color-navy`, `--color-off-white`, `--color-gray-100`, `--color-light-gray`, `--color-mid-gray`, `--color-dark-gray`, `--color-surface`, `--color-surface-container-low`, `--color-surface-container-high` |
| Surfaces | `--bg-sunken`, `--bg-canvas`, `--bg-raised`, `--bg-elevated`, `--bg-overlay` |
| Foregrounds | `--fg-primary`, `--fg-secondary`, `--fg-muted` |
| Borders | `--border-subtle`, `--border-default`, `--border-hover`, `--border-control` |
| Overlays | `--overlay-weak`, `--overlay-medium`, `--scrim`, `--scrim-pill`, `--scrim-pill-hover`, `--scrim-pill-ghost`, `--media-letterbox` |
| Chrome | `--navbar-bg`, `--navbar-border`, `--sheet-bg`, `--navbar-height`, `--bottom-nav-height`, `--top-bar-row1`, `--top-bar-row2`, `--top-bar-total` |
| Shadows | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-modal`; rings and hairlines `--shadow-ring-{weak,medium,focus,error,elevated}`, `--shadow-outline-subtle`, `--shadow-inset-{subtle,hover,indicator}`, `--shadow-navbar-hairline` |
| Utility (invariant) | `--mask-opaque` (mask-image fill), `--mix-shade` (`color-mix()` darkening partner), `--confetti-0`..`--confetti-9` (group-result confetti) |
| Focus and selection | `--focus-ring`, `--selection-bg`, `--selection-fg` |
| Status | `--color-error`, `--color-error-bg`, `--color-error-border`, `--color-error-ring`, `--color-success`, `--color-success-text`, `--color-success-bg`, `--color-warning`, `--color-warning-text`, `--color-warning-bg`, `--color-warning-border` |
| Badges | `--badge-{success,warning,neutral,danger,accent}-{bg,fg,border}` (where defined), `--badge-count-bg`, `--badge-count-fg` |
| Button | `--btn-primary-bg`, `--btn-primary-fg`, `--btn-primary-bg-hover`, `--opacity-disabled` |
| Motion | `--duration-instant`, `--duration-fast`, `--duration-base`, `--duration-slow`, `--ease-out`, `--ease-emphasized`, `--ease-in-out`, `--transition-fast`, `--transition-base` |
| Geometry | `--radius`, `--radius-pill`, `--measure`, `--control-h-compact`, `--control-h-sm`, `--control-h-md`, `--control-h-lg` |
| Type | `--font-inter`, `--font-headline`, `--font-mono`, `--text-display`, `--text-h1`..`--text-h4`, `--text-body`, `--text-body-sm`, `--text-ui`, `--text-caption`, `--text-label`, `--text-micro`, `--tracking-label` |
| Breakpoints | `--bp-gt-mobile`, `--bp-gt-narrow-desktop`, `--bp-gt-desktop` |
| Z-index | §4.10 |

---

## 15. Changelog

- **2026-10-22, docs-to-code reconciliation.** Synced this file, `AGENTS.md` and `CLAUDE.md` with the shipped code. Motion: popover and toast enter at `--duration-fast`; tab panel is `--duration-base` + `--ease-emphasized`, 12px; tooltip has no fade; dialog has no exit animation; drawer and bottom-sheet exits documented; navbar hide uses `--transition-base`; `--ease-in-out` has no consumer; `--transition-slow` removed. Reduced motion: spinners keep turning (they are exempt from the backstop); dialog, toast, tab panel and popover keep 150ms fades. Button `sm` / `md` / `lg` documented at their current ~30 / 40 / 44px desktop heights, with the control-height scale marked not yet applied (owner decision pending); `icon-sm` documented. `--border-control` scoped to checkbox and switch-off (RadioGroup draws no circle). Bottom nav documented as opaque `--bg-elevated` with 0.6875rem / 500 mixed-case labels and a 2.5 active stroke. Skeleton fill is `--overlay-weak` (`--skeleton-bg` is not a defined token). Bottom sheet surface is `--bg-elevated`. Shadow hard rule reworded in all three files: elevation is `--shadow-sm/md/lg` + `--shadow-modal` (dialogs), rings and hairlines use the new `--shadow-ring-*` / `--shadow-inset-*` / `--shadow-outline-*` / `--shadow-navbar-hairline` tokens. §12 now documents the shipped stylelint config (`npm run lint:css`), also added to the `CLAUDE.md` first checks. Avatar `xs` / `2xl`, Input `bare`, removed AppDialogHeader `center` prop, `--text-*` and `--control-h-*` tokens added to the appendix. AGENTS.md token lists updated (four border tokens, motion tokens, `--scrim`, `--z-feedback-trigger`).
- **2026-10-22, polish pass** (`docs/polish-2026-10/design-md-proposals.md`). This document was rewritten as one body with `tokens.css` as the single numeric source. Added: type ramp with loaded weights (Noto Serif 600 now loaded; `ui`, `label`, `micro` steps), uppercase-only tracking, tabular numerals rule, text-wrap and measure, contrast table and badge fixes, `--border-control`, border tokens collapsed to four, `--bg-raised` redefined as a tint, `--bg-overlay`, one `--scrim`, translucent chrome derived from surfaces, interaction-state table, `hoverOnlyWhenSupported`, focus recipe and ring-color safety net, control heights and `icon-sm`, motion duration/easing tokens, reduced-motion rule, icon ladder, spacing rhythm, async-state matrix, dialog voice (serif titles), sentence-case field labels, stylelint. Removed stale content: retired rails, old dark palette, phantom tokens, the "spring overshoots" claim, the 768px iOS rule, the 4px / 16px radius exceptions.
- **2026-06, landing redesign** (PR #165). `lp-` system, guilloche, landing dark mode.
- **2026-05-28, design consolidation** (PR #108). Radius locked to 2px with no exceptions; landing dark mode; breakpoints 800/1100/1300 only; `<Card>`, `<Tabs>`, `<Skeleton>`, `<Popover>` primitives; `Button size="icon"`, `Input` sizes, `Badge` variants; z-index tokens; `AddOrgModal` and `MembershipSyncModal` moved to `<AppDialog>`. Audit: `docs/design-audit/component-audit.md`, `docs/design-audit/visual-divergence.md`. Plan and decision log: `docs/design-consolidation/plan.md`.
