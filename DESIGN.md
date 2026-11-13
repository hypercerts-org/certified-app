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
| 6 | Titles (page titles, account names, record titles, empty-state and dialog titles) use `font-headline` + `text-h1`..`text-h4`. Section headings inside a page use `text-section` (Inter 600, via `<SectionHeader>`). Never `text-xl` / `text-lg` / `text-2xl`. | `grep -rn "font-headline text-\(xl\|lg\|2xl\)" src/app/ src/components/` is silent |
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
- At most one primary (black) button in a page's content; the top bar's New is the global one (§9.1).
- Counts (tabs, side nav, beside headings) are muted tabular numbers; red is only for notifications (§9.6).
- A load failure is an inline block with a "Try again" button, never a warning banner (§10.1).
- Sticky elements sit at `top: var(--chrome-top, var(--navbar-height))` (§4.1).
- Anything a person needs to find is visible at rest; hover may only enhance (row checkboxes, edit).

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
- Account-centric: the signed-in home shows the account (profile, ID, records, what others gave it, apps, groups). The social feed has its own page, `/feed`, reached from Feed in the top bar.

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
| `--bg-selected` | The current / selected item: the SideNav's current section and the top bar's current destination; in dark mode also the active segment of a segmented control (light keeps the raised `--bg-elevated` segment). Light `#eeeeee`; dark `#3a3a40`, a step **above** `--bg-elevated`, because lighter reads as "on" in dark mode and `--bg-sunken` made the current item look like a hole. Never `--bg-sunken` for "current". |
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

Translucent chrome is always the surface it sits on at reduced alpha, never a separate literal: `--navbar-bg` is canvas at 80% (`color-mix()` toward transparent), `--sheet-bg` is elevated at 95% (both defined once, no dark override). The phone top bar and the desktop top bar use `--navbar-bg`; the bottom tab bar is opaque (§4.3). Chrome blurs what scrolls under it (`backdrop-filter: blur(12px)`). Text over blur uses `--fg-primary` or `--fg-secondary`, never `--fg-muted`. The chrome edge is a 1px `--navbar-border` hairline (drawn with `--shadow-navbar-hairline`), not an elevation shadow.

### 2.10 Selection

`::selection` uses `--selection-bg` / `--selection-fg`: ink on paper in light, paper on ink in dark.

---

## 3. Typography

### 3.1 Families and loaded weights

| Var | Family | Loaded weights | Role |
|---|---|---|---|
| `--font-inter` | Inter | Variable font (every weight in one file); the system uses 400 / 500 / 600 | Everything that isn't a title: section headings, buttons, nav, labels, body, meta. |
| `--font-headline` | Noto Serif (normal + italic) | 300 / 400 / 600 / 700 | Titles of named things: page titles, account names, record titles, empty-state and dialog titles. 300 is landing display only; 400 is landing item titles; 600 is app titles h2-h4; 700 is display, h1 and feed card titles. |
| `--font-mono` | System stack (`ui-monospace, SFMono-Regular, …`) | n/a | DIDs, AT URIs, code; on landing also registry numerals and stats. No web font. |

Inter and Noto Serif load via `next/font/google` with `display: swap`. A spec may only name a loaded weight: an unloaded serif weight silently renders as the nearest loaded face. Inter is loaded as a variable font, so 700 would render; the system still never uses it.

### 3.2 Type ramp

Five roles cover the app:

| Role | Style | Use |
|---|---|---|
| Title | `font-headline` + `text-h1` / `text-h2` / `text-h3` (`text-h4` for small titles) | Page titles (`<PageHeader>`), account and profile names, record titles, empty-state and dialog titles |
| Section | `text-section`: Inter 600, 1rem | Section headings inside a page (`<SectionHeader>`). Never serif. |
| Body | `text-body` / `text-body-sm` | Reading text, descriptions |
| Label | `text-ui` / `text-body-sm` at 500 | Navigation, menus, buttons, field labels |
| Meta | `text-caption` / `text-ui`, `tabular-nums` | Timestamps, counts, bylines |

`tailwind.config.ts` `fontSize` is authoritative; this table must match it. Each step carries its own leading and tracking. The sizes are mirrored as `--text-*` tokens in `tokens.css` (`--text-display` … `--text-micro`, plus `--text-section`) for CSS consumers, with `--tracking-label` (0.06em) and `--measure` (65ch).

| Utility | Size | Leading | Tracking | Weight | Font | Use |
|---|---|---|---|---|---|---|
| `text-display` | 3rem | 1.1 | -0.03em | 700 | serif | Rare app hero |
| `text-h1` | 2.25rem | 1.15 | -0.02em | 700 | serif | Wide-page title |
| `text-h2` | 1.75rem | 1.2 | -0.015em | 600 | serif | Page title (`<PageHeader>`) |
| `text-h3` | 1.375rem | 1.3 | -0.01em | 600 | serif | Profile name, record title |
| `text-h4` | 1.125rem | 1.35 | -0.005em | 600 | serif | Card title, empty-state title, dialog and sheet title |
| `text-section` | 1rem | 1.4 | 0 | 600 | Inter | Section heading inside a page (`<SectionHeader>`) |
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

Every page has exactly one `<h1>`.

- **A page with a `<PageHeader>`:** the header's title is the page's visible `<h1>`. `PageHeader` registers itself through `navbar-context` (`useRegisterPageHeader()`, ref-counted). The chrome reads `useHasPageHeader()` and, while it is true, renders no h1 of its own, visible or visually hidden. It may still show the title as plain text (a compact phone title).
- **A page without a `PageHeader` (fallback):** the chrome renders the page title (`usePageTitle`; `AuthGuard` sets it when signed out) as the `<h1>`: visually hidden in the desktop top bar, and the phone bar's compact title (centred next to the square brandmark on top-level pages, next to the back chevron on other pages). While a `PageHeader` is mounted the desktop bar renders no h1 and the phone bar shows its normal layout with no title (§4.2).
- Under the h1, section headings are `<h2>` (`<SectionHeader>`, or `as="h3"` inside an h2 section); card and empty-state titles take the next level down (the level passed via `headingLevel`).
- Visual size and DOM level are independent: pick the ramp step for the look and the element for the outline.

---

## 4. Layout

### 4.1 Shell

The app shell (`src/components/layout/app-shell.tsx`) is a single centered column; top-level pages lift it with `<PageContainer>` (§4.6). Navigation is chrome around it, and it is the same everywhere: **three destinations, in one order: Workspace | Network · Apps** (`src/lib/layout/destinations.ts`). **Workspace** is what your account holds and what you manage: the Overview (`/home`) and the Records sections and Groups (`/records?kind=…`), behind one side list (`WorkspaceShell`, §4.6). Your personal account and each of your groups is a workspace; the Workspace destination names the one you are in and opens a menu to switch (§4.4.2). **Network** is everyone's work, five pages: Feed (`/feed`), Explore (`/explore`), Graph (`/graph`, the endorsement network), Map (`/map`) and Funding (`/funding`; Map and Funding are placeholders until those views exist). The Network button opens a menu of them (`network-menu.tsx`: a `<Popover>` menu on desktop, a `<BottomSheet>` from the phone tab), the current page checked; the pages carry no tab row of their own. Feed and Explore show **"Seen as"** right after their title (`seen-as-switcher.tsx`, a secondary `sm` button: "Seen as", the avatar, "Me" or the group's name, a chevron): which account the network is shown for, and a menu (sheet on phones) to switch between you and your groups. **It is its own setting, separate from the workspace** (`useSeenAs`, `src/lib/groups/seen-as.ts`, kept per tab like the workspace): it alone decides what Feed and Explore show (the Feed's follows and endorsements; Explore's "My …", "Accounts I follow" and "Endorsed accounts"), picking here never changes the workspace, and switching workspace never changes it ("Changes what Feed and Explore show, not your workspace."). It defaults to you. Following and endorsing from those pages is still done as the workspace's account. Only for a signed-in person in at least one group. **Apps** are the other apps that work with the same account. Signed-out visitors see Network (without Feed) and Apps. Nothing lives only in a drawer, and no destination is hidden per account: a section an account can't use explains why in place (the Records sections and Groups while acting as a group).

| Viewport | Chrome | Content |
|---|---|---|
| < 800px | Phone top bar (§4.2) + bottom tab bar (§4.3) | Column up to 720px, 16px side gutter |
| ≥ 800px | Desktop top bar (§4.4) | Column 600px; `<PageContainer>` pages 720 / 1120 / 1280px; full-bleed pages up to 1280px |

`useLayoutBreakpoints()` mirrors the CSS breakpoints and JS-unmounts the components that must not exist at the other width (the phone bar, the tab bar). Everything else is CSS-only.

Profile, Settings, Help, feedback and signing out live in the **account menu** (§4.4.1), opened from the account button on desktop and the avatar on phones. Creating lives in **New** (desktop button, phone `+`).

**Acting as a group**, that is working in a group's workspace, shows in two places: Workspace (the group's square avatar and name on desktop, its avatar on the phone tab) and the Create forms' "publishing as" line. There is no acting-as banner: Workspace in the bar is the indicator. The account button and menu are always about **you**, the person signed in, whichever workspace is open (§4.4.1). It decides what you create, follow and endorse as; what Feed and Explore show is "Seen as", a separate setting (§4.1). In navigation, menus and buttons the account kind is a **group**, never "organization".

**`--chrome-top`** (tokens.css) is the bottom edge of the fixed top chrome: `--navbar-height` (64px on phones, 0 on desktop, where the top bar scrolls with the page). Every sticky element uses `top: var(--chrome-top, var(--navbar-height))`. The root's `scroll-padding-top` is `--chrome-top` and its `scroll-padding-bottom` the tab bar's height + safe area + 16px, so a control reached by Tab never sits under the fixed bars (WCAG 2.4.11); pages with a sticky form action bar add its height. A phone bar hidden on scroll comes back while it holds focus.

**Landmarks:** the top bars are `<header>`s (banner), the page is `<main id="main-content">` (the skip link's target; `AppShell` renders it), and the site footer follows `<main>`, so it is the contentinfo landmark on every page, including `/welcome` and the legal pages. The footer links Welcome, Help, Feedback (opens the feedback dialog; the only Feedback button on the page, there is no floating one), Docs, Terms, Privacy and Imprint, for everyone: signed-out visitors have no account menu. The theme switch is not in the footer: Appearance (Light / Dark / System) is in Settings only. Links are 44px tall on phones.

### 4.2 Phone top bar (< 800px)

`navbar.tsx`. Fixed, `--navbar-height`, translucent chrome (§2.9). Hides on scroll down and returns on scroll up (compositor-only transform, `--transition-base`). On desktop `--navbar-height` is zeroed.

One bar on every page:

| Slot | Top-level pages: the destinations (`/home`, `/records`, `/feed`, `/explore`, `/graph`, `/map`, `/funding`, `/apps`), `/settings`, `/help`, your own profile | Every other page: a record, someone else's profile, a group page, a form, the legal pages |
|---|---|---|
| Left | The faded Certified.app wordmark (`<Wordmark variant="certified-app" faded>`, 18px letters, ".app" at 50%, no Beta pill, to Home; `/welcome` signed out); the square brandmark instead while the compact title shows | Back chevron (`<Button size="icon" aria-label="Go back">`), **whether or not a `PageHeader` is mounted**: the installed app has no browser Back, so this is the way back to where you were |
| Center | The compact title as the h1 when no `PageHeader` is mounted, else nothing | Same |
| Right | `+` (`<Button size="icon" aria-label="New">`, opens the New sheet) and the avatar (opens the account sheet). Signed out: "Sign in". | Same (a page that still publishes a record menu gets it first; deprecated) |

The compact title is `text-section` (Inter 600, 1rem), truncated to fit between the side slots. A page with a `PageHeader` carries its own title (and a record page its own menu, beside the title), so the bar drops its title; it keeps the back chevron. The bar is a `<header>`, not a `<nav>`. The avatar is always yours, whichever workspace is open. The full-bleed profile banner starts below the bar.

### 4.3 Bottom tab bar (< 800px)

`bottom-nav.tsx`. Shows in every phone browser, installed app or not; hidden on `/welcome`, `/embed`, and on create and edit forms (`isFormRoute`: `/create`, `/project/new`, `/groups/create`, `/groups/import`, `/settings/edit-profile`, any `…/edit`, `…/edit-profile` and `…/update/new`), which pin their own action bar to the bottom (`bottom-nav-visibility.ts`). Fixed bottom, `--bottom-nav-height` + `env(safe-area-inset-bottom)`; zeroed on desktop and whenever the bar is absent. Opaque `--bg-elevated` surface with a 1px `--border-subtle` top line (not translucent).

Items: Workspace (`FolderOpen` in your own workspace; the group's 20px square avatar in a group's, so the tab shows when you act as a group; current on `/home` and `/records`; with groups to switch to, a button that opens the Workspace sheet (§4.4.2), otherwise a link to the Overview), Network (`Globe`; a button that opens a sheet of Feed, Explore, Graph, Map and Funding; current on any of them), Apps (`LayoutGrid`); signed out, Network (without Feed) and Apps. Tabs are destinations only (Network's sheet lists its pages, Workspace's your workspaces): no Create, no Feedback. Each item is a 24px icon over a one-word label, at least 44px tall. The label is Inter 0.6875rem (the `label` size) / 500 / leading 1, mixed case with no tracking. Active: `--fg-primary` and a heavier icon stroke (1.5 → 2.5; the Workspace avatar gets a 1.5px `currentColor` ring instead), never a fill or tint pill; `aria-current="page"`. Inactive: `--fg-muted`. Press: `scale(0.97)`. Re-tapping the current tab on its own page scrolls to the top. While auth resolves the bar keeps its height with no tabs.

### 4.4 Desktop top bar (≥ 800px)

`desktop-top-bar.tsx`, mounted in the root layout before `<main>`. Translucent chrome with a 1px bottom line; scrolls with the page (so `--chrome-top` is 0 on desktop). **One row** (`--top-bar-row1`, 52px), the same on every page: nothing page-specific lives in the chrome. Pages carry their own back link and title (`PageHeader`) and their own section tabs, in the page, at every width.

- Left: the faded Certified.app wordmark (`<Wordmark variant="certified-app" faded>`, 18px letters, ".app" at 50%, no Beta pill, to Home; `/welcome` signed out), then the destinations, with a 1px `--border-default` divider between Workspace and the network. Workspace is a **fixed-width** pill naming the workspace you are in: "My workspace" in yours (not your name: the account button beside it shows that), the group's name in a group's (truncated). Sized to "My workspace": 128px at 800–1099px (words only, like the other destinations), 162px from 1100px with `FolderOpen` or the group's 20px square avatar; a chevron when it opens the Workspace menu (§4.4.2). The fixed width keeps the row from shifting when you switch. The others are 20px icon + word (word only at 800–1099px, so everything fits on one row); `text-ui` / 500, 36px tall. Current: `--bg-selected` pill (`--radius-pill`) + `--fg-primary`; others `--fg-secondary`; hover `--overlay-weak` (hover devices only); never a weight change; `aria-current="page"`.
- Right: the search field (placeholder "Search"; `/` or Cmd/Ctrl+K focuses it; up to 300px, shrinking to 120px (96px below 1100px) so the destinations never clip; not shown on `/explore`, which has its own search), **New** (`<Button variant="primary" size="sm">` with a Plus icon; a `<Popover>` menu: New activity, New project, New group), and the **account button** (your avatar, then your name and @handle from 1100px, capped at 200px until 1300px; always you, whichever workspace is open). Signed out: search, **Help** (styled like a destination link) and "Sign in".
- No page title; a page without a `PageHeader` gets a visually hidden h1 here (§3.6).

There is no floating Feedback button: Feedback is in the site footer and "Send feedback" in the account menu.

#### 4.4.1 Account menu

`account-menu.tsx`. One component, two presentations: a `<Popover>` menu (`role="menu"`, 336px; focus lands on the first item, arrow keys rove, Tab or Esc closes it and returns focus to the button) on desktop, and a `<BottomSheet>` titled "Account" with a close button on phones. In order:

The menu is always about **you**, the person signed in, whichever workspace is open: a group's profile and settings are reached from the Workspace (§4.4.2).

1. **You:** avatar, name in `font-headline text-h4`, @handle, a tag ("Personal", or "Group account" when the signed-in account is itself a group), then **View profile** (your own profile).
2. **Settings** (`/settings`, always yours; a signed-in group account's are its group settings), **Help** and **Send feedback** (opens the feedback modal). Appearance (Light / Dark / System) is not in the menu; it is in Settings only.
3. **Sign in with another account** (`openSignInAnotherAccount`: the sign-in bounce with `prompt: "login"`, so the PDS asks who is signing in instead of returning the same account; it replaces the current session, and says so under the label) and **Sign out**, behind a `<ConfirmDialog>` ("Sign out of Certified?") that returns focus to the account button (`returnFocusRef`).

The sheet ends with the legal links (Terms, Privacy, Imprint); the desktop keeps them in the site footer. Menus opened from the top bar sit at `--z-chrome-menu`, above the navbar. Switching between your account and your groups is not in this menu: it is the Workspace menu (§4.4.2).

#### 4.4.2 Workspace menu

`workspace-menu.tsx`. Workspace in the desktop top bar and the phone tab bar names the workspace you are in, and opens your workspaces: a `<Popover>` menu labelled "Workspaces" on desktop (same behaviour as the account menu's), a `<BottomSheet>` titled "Workspace" on phones. Your own first ("My workspace", your avatar and @handle), then each group's (name, @handle, role badge), sorted accepted → owner/admin/member → name, with a check on the current one (`menuitemradio` + `aria-checked` in the menu, `aria-current` in the sheet); then, after a separator, **Group settings** (`/groups/{did}/settings`, in a group's workspace only) and **New group**.

Picking a workspace switches who you act as (not what Feed and Explore show: that is "Seen as") and opens it: from outside the Workspace, its Overview; inside, the same section when it works for that account (the Records sections and Groups are personal, so a group opens on its Overview). An account in no group, or that is itself a group, has one workspace: Workspace is then a plain link to the Overview, without chevron or menu. Records' "Switch to personal account" and the Groups list switch through `useSwitchActor()`.

### 4.5 Breakpoints

Three, everywhere: tokens `--bp-gt-mobile`, `--bp-gt-narrow-desktop`, `--bp-gt-desktop` (informational; `@media` can't read `var()`, so CSS hard-codes the numbers). Tailwind `screens` is replaced (not extended): `md` 800, `lg` 1100, `xl` 1300, so a stray `md:` can never resolve to 768.

| Range | What changes |
|---|---|
| < 800px | Phone top bar + bottom tab bar, bottom sheets instead of dropdowns, 16px input text (iOS zoom rule), dialog actions stack |
| ≥ 800px | Desktop top bar; column narrows to 600px; dropdowns and centered dialogs replace sheets; tab panels slide; top-bar destinations are words only until 1100px |
| ≥ 1100px | Account button shows its name and handle; destination links get their icons and 12px padding; profile Overview about-block and project detail go two-column |
| ≥ 1300px | Grid wrapper reaches its max width; endorsement grids go to three columns |

Write mobile first: base styles, then `@media (min-width: 800px)`. "Below desktop" is `max-width: 799px`. Never 768 / 760 / 640.

### 4.6 Container widths

| Context | Width | Notes |
|---|---|---|
| Reading column, mobile | 720px max | `.app-shell__content` |
| Reading column, desktop | 600px | Pages not yet in a `<PageContainer>` (fallback). Narrower on purpose; the column is editorial, not stretched |
| **Top-level pages** | `<PageContainer width="default">`, 1120px | **One width** for the destinations (the Workspace, the Network's four tabs, Apps), Settings and Help, so the left edge doesn't jump between them. Multi-column pages (the Workspace's side list, Feed's three columns, Explore's list nav, Settings' section nav) fit inside it. |
| Forms | `<PageContainer>` at the width each form has today | Create and edit forms keep their widths (`narrow` 720px for single-column forms). |
| Profile | `wide`, 1280px, full-bleed banner (`.app-shell--fullbleed`) | The banner runs edge to edge; the content under it uses the wide container. |
| `<PageContainer>` | `narrow` 720px / `default` 1120px / `wide` 1280px content (`--page-width-*`) | Gutters sit outside the width: the shell's 16px below 800px, 24px from 800px, 32px from 1100px. Its `.page-container` class opts into the page-frame shell layout. |
| Grid wrapper | 1300px | Ultra-wide screens get passive gutters |

Multi-column layouts are explicit opt-ins on wide pages (the profile Overview is an intentional two-column layout). The reading column never gets a second column.

### 4.7 Spacing and rhythm

Scale (Tailwind steps): **4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64** (`1 2 3 4 5 6 8 12 16`). 2 / 6 / 10 are allowed only inside controls (for example a chip's `py-0.5`), never between elements. Control heights come from §6.3, not from padding.

| Relationship | Space |
|---|---|
| Label → its control | 6 (`mb-1.5`, the one in-control exception) |
| Field → field, paragraph → paragraph | 16 |
| Heading → its content | 8 (h4) / 12 (h3, `text-section`) / 16 (h2 and up, `<PageHeader>`) |
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

Every layer is a `--z-*` token in `tokens.css`. Lowest to highest: `--z-local-raise`, `--z-rail-sticky`, `--z-popover`, `--z-navbar` / `--z-bottom-nav`, `--z-chrome-menu` (the New and account menus: above the nav bars), `--z-portal-sheet`, `--z-modal`, `--z-skip-nav`, `--z-feedback`, `--z-feedback-above`, `--z-tour-backdrop`, `--z-tour-card`, `--z-tooltip`. A genuinely new layer gets a new token, placed in this order.

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
| `--shadow-md` | Popover, tooltip, toast |
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
| Active (press) | `.press-scale`: `scale(0.97)`, `--duration-instant` (the one press scale, also the tab bar's) | same | same |
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
| 32 | `h-control-compact` | `<Button size="sm">` on desktop; compact dismiss/close controls at any width (`icon-sm` visual; 44px hit area via ::after) |
| 36 | `h-control-sm` | `<Input size="sm">`, `<Button size="md">` and `<Button size="icon">` on desktop |
| 44 | `h-control-md` | `<Input size="md">`, `<Button size="lg">`; every control's minimum below 800px |
| 56 | `h-control-lg` | `<Input size="lg">` (sign-in field) |

- `<Button size="icon">` is 44 on mobile, 36 on desktop (the same as `md`).
- `<Button size="icon-sm">` is 32 visual, with its hit area expanded to 44 by a transparent `::after` (inset -6px).
- Dismiss and close controls in Dialog, Sheet, Banner and Toast are `<Button size="icon-sm" variant="ghost" aria-label="Close">`, never hand-rolled.
- Button heights are `min-h-control-*` (not padding): `sm` 32 / `md` 36 / `lg` 44 on desktop, every size 44 below 800px. `min-h` rather than `h`, so a wrapped label grows instead of clipping. Borders sit inside the height, so outlined and filled buttons of one size match.
- `<SegmentedControl>` / `<ToggleGroup>` are off the scale on desktop (`sm` 28px, `md` 32px) and 44px tall below 800px (icon-only segments 44px wide).

### 6.4 Touch

- Inputs are at least 16px font size below 800px, or iOS Safari zooms on focus. Tailwind `md:text-sm` on fields flips at 800, not 768.
- Safe-area insets: the bottom tab bar and bottom sheets respect `env(safe-area-inset-bottom)`.
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
| Button / card press | `scale(0.97)`, instant, `--ease-out` | eases back on release |
| Bottom-nav press | `scale(0.97)` (the same press scale) | eases back |
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
| 20 | chrome | 1.5 | Desktop top-bar destinations, phone top bar (`+`) |
| 24 | bottom nav | 1.5, **2.5 active** | Bottom tab bar (active is a heavier stroke, never a fill); the phone back chevron |
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
| `primary` | `--btn-primary-bg` / `--btn-primary-fg` | `--btn-primary-bg-hover` | Main action, form submit. **At most one in a page's content**; the top bar's New is the global one, so a page's own "New" menu is `secondary`. |
| `secondary` | transparent, `--fg-primary`, `--border-default` | border `--border-hover` | Cancel, secondary actions |
| `ghost` | transparent, `--fg-muted` | `--overlay-weak`, `--fg-primary` | Toolbar actions |
| `destructive` | `--color-error-bg`, `--color-error`, `--color-error-border` | slightly stronger tint | Delete, remove |

| Size | Height (desktop / below 800px) | Text |
|---|---|---|
| `sm` | 32 (`control-compact`) / 44 | `text-xs` (0.75rem) |
| `md` | 36 (`control-sm`) / 44 | `text-sm` (0.875rem) |
| `lg` | 44 (`control-md`) / 44 | `text-sm` |
| `icon` | 36 square / 44 square | n/a; requires `aria-label` |
| `icon-sm` | 32 visual, 44 hit / same | n/a; requires `aria-label` |

Heights come from the control-height scale (§6.3) as `min-h-control-*`; padding sets only the horizontal inset.

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

- `<Avatar size="xs|sm|md|lg|xl|2xl" shape="circle|square">` (20 / 32 / 48 / 64 / 96 / 240). A circle for people; `shape="square"` (the 2px `--radius`) for groups, so an organisation never reads as a person (the account button and menu use it). Fallback: `--color-surface-container-high` with initials from `getInitials()` (`xs` at `text-micro`). An image avatar shows the same initials until its image has loaded, never a blank circle. The initials are `aria-hidden` (the name is always written beside the avatar); with an `alt` the avatar is an `img` named by it.
- `<IdentityRow did handle displayName avatarUrl href size loading>` is the one avatar + name + `@handle` byline. Primary line resolves `displayName` → `handle` → truncated DID, `font-medium` `--fg-primary`; the handle line shows only when a real handle exists, `--fg-muted`. Both truncate.

### 9.6 Tabs, SegmentedControl, Pagination

- `<Tabs>` / `<TabList>` / `<Tab>` / `<TabPanel>`: ARIA tablist with arrow keys. Active tab: `--fg-primary`, weight 600, underline indicator. Wrap panels in `<TabPanelTransition>` for the desktop slide. `<Tab count>` renders the count as a **muted tabular number** after the label (weight 400, `--fg-muted`; read as "Funding 3"). Counts are never badges: the red `Badge variant="count"` is for notifications only. Use the prop rather than a hand-made span.
- Section tabs belong to the page, under its header, at every width (the profile's and record pages' strips); the chrome never carries them.
- `<TabList>` (underline) is a block-level strip: its hairline spans the content width, not just the tabs.
- `<SegmentedControl>` and `<Tabs variant="segmented">`: active segment on `--bg-elevated` with `--shadow-sm` on the `--bg-sunken` track; in dark mode `--bg-selected` (a step lighter), so it reads as on; 44px tall below 800px.
- `<Pagination>`: Previous / "Page X of Y" / Next with `tabular-nums` and `aria-live="polite"`; returns `null` for one page. It is the explicit pager; `<LoadMoreSentinel>` is the infinite-scroll alternative. Pick one per surface.

### 9.7 Popover, Tooltip

- `<Popover>` + `<PopoverTrigger>` / `<PopoverContent>` / `<PopoverItem>` for menus: `role="menu"`, click-outside, Esc, focus restore. Floating level (§5). A menu that also has a phone presentation renders the same content in a `<BottomSheet>` below 800px (the New and account menus, §4.4.1).
- Keyboard (in-flow and `portal` alike): opening moves focus to the first item (a portaled menu waits until it is positioned), arrows / Home / End rove, Tab or Esc closes it and returns focus to the trigger, and choosing an item returns focus to the trigger rather than `<body>`. A ref on the trigger child is kept, so a menu item that opens a dialog can pass the trigger as the dialog's `returnFocusRef`.
- A panel holding form controls (filters) is a `role="dialog"` wrapper with `useClickOutsideClose`. Those are the only two popover patterns.
- `<Tooltip>` is suppressed on touch; never put essential information only in a tooltip.

### 9.8 Dialogs

All modals are `<AppDialog>`: native `<dialog>` + `showModal()`, per-layer Esc, wrapping Tab trap, focus restore, backdrop-click close (suppressible with `disableBackdropClose`), `autoFocusFirst` / `initialFocusRef`. It is `position: fixed` in the top layer; don't make it relative.

- **Focus:** put focus on a field with `initialFocusRef` (+ `autoFocusFirst`), never React's `autoFocus` inside a dialog. The dialog records its opener during its first render; on close focus goes to `returnFocusRef` if given, else that opener, else what had focus when it opened, skipping anything no longer in the page. A dialog opened from a menu item passes the menu's trigger as `returnFocusRef` (the item unmounts with the menu). `ConfirmDialog`, `DeleteRecordDialog`, `FormDialog` and `ResponsiveDialog` forward it.

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

- `<BottomSheet>` (< 800px): fixed bottom, `--bg-elevated`, `var(--radius)` top corners, serif `text-h4` title with a close button, drag handle, swipe down to dismiss, swipe up to expand, max 70vh, safe-area padding, over `--scrim`. Used for the account sheet, the New sheet and mobile feedback. Never stack one sheet on another. It is modal: on open focus moves in (`initialFocusRef`, else the first control that isn't a text field so the keyboard doesn't jump up, else the sheet; `autoFocusFirst` takes the very first control), the page behind is `inert` (`useInertOutside`; the toast region carries `data-inert-exempt`, so an Undo stays tappable and new toasts are announced), Tab is trapped, and on close focus returns to the trigger (or `returnFocusRef`).
- `<Drawer>`: side panel (83.33% wide, max 320px), `--bg-elevated`, `--shadow-lg`, over `--scrim`. The app has no drawer navigation (the hamburger and site drawer were removed); the primitive stays for future side panels.
- Both lock body scroll via `use-body-scroll-lock` (which toggles `html` overflow; `scrollbar-gutter: stable` keeps the page from shifting).

### 9.10 Feedback surfaces

| Primitive | When |
|---|---|
| `<ErrorMessage title message onRetry>` | A section failed to load. Replaces the section in place. Error-tinted surface with an icon. |
| `<Banner variant>` | Page-level degraded or info state that persists while it is true. Never for a load failure (that is the inline block with "Try again", §10.1). |
| `toast` | Transient result of an action. Errors that need action stay until dismissed; others auto-dismiss. |
| `<EditBanner>` | Sticky edit-mode chrome (Cancel + Save) on profile, project and cert edit pages. |
| `<ErrorBoundaryFallback>` | A render crash. |

### 9.11 EmptyState and Skeleton

- `<EmptyState variant="rich">`: centered optional icon (40px, 1.25 stroke), serif `text-h4` title, `--fg-muted` description, action slot. `variant="inline"`: one muted line, no icon or container; it replaces the old `*__empty` BEM hints. (`compact` is a back-compat alias of `inline`.)
- `<Skeleton variant="line|box|circle|text">`: fill `--overlay-weak`, the one pulse recipe (§7.3; off under reduced motion), mirrors the final geometry (rectangles where text goes, circles where avatars go, same spacing). `aria-hidden`.

### 9.12 Distinctive patterns

- **Phone top bar:** the normal bar (the faded Certified.app, `+`, avatar) almost everywhere, and a fallback back-chevron bar only on titled pages without a `PageHeader` (§4.2), switching instantly on route change.
- **Account menu:** a sheet on phones, a popover menu on desktop (§4.4.1); reflects the acting identity (`useOrg().activeOrg`).
- **Feed with evaluator filter:** tapping the active "For you" tab opens an inline filter panel; a non-default filter renames the tab "Custom" and the unfiltered state shows a caution banner.
- **Profile hero:** full-bleed banner below the top bar, with the avatar overlapping downward.

### 9.13 Page layout: PageContainer, PageHeader, SectionHeader, SideNav, StatRow

One page pattern for every top-level page (November 2026 redesign). Build a page from these before writing page-level CSS.

| Primitive | Use it for | Contract |
|---|---|---|
| `<PageContainer width as>` | The outer frame of every top-level page. `default` (1120) for the destinations, Settings and Help (one width, §4.6); `narrow` (720) for single-column forms; `wide` (1280) for the profile. | Centred, max width plus gutters (§4.6). Top space: 8px on phones (24px below the navbar in all), 32px from 800px; bottom 32px / 64px. Lifts the shell's 600px desktop column via `.page-container`. |
| `<PageHeader title description actions back visual titleAside titleId>` | The first thing in the container, once per page. | Optional back link (chevron + parent name, `text-ui` muted) above; optional `visual` (avatar or icon) beside the title; title as the `<h1>` in `font-headline text-h2`, balanced; optional `titleAside`, a small control on the title's line right after it (Feed and Explore's "Seen as"), wrapping under it when the line is too narrow and kept out of the `<h1>`; one line of description in `body-sm` `--fg-secondary`, capped at the measure; actions on the right with at most one `primary`, wrapping under the title below 800px. 16px below the block. Registers with the chrome (§3.6). |
| `<SectionHeader title description action as id>` | The heading of a section inside a page. | Title in `text-section`, `<h2>` by default (`as="h3"` when nested); optional muted description; `action` on the right. No outer margin: the section puts its content 12px below (`gap-3`). Pass `id` and point the section's `aria-labelledby` at it. |
| `<SeeAllLink href label>` | The one "See all" link, usually a `SectionHeader` action. | `text-ui` 500 `--fg-secondary` + 14px chevron-right; 32px tall with a 44px hit area. Name the destination ("All apps") when "See all" is unclear. |
| `<SideNav aria-label items sticky>` | Navigation between the sections of one page: Records kinds, Settings sections, Help contents, Explore lists. | Below 1100px a row of 44px pills (current = `--bg-selected` pill with a `--border-hover` edge, `--fg-primary`, weight 600 — like the top bar, never a black fill): up to six items **wrap** onto more lines, so no section is hidden off-screen; a longer list scrolls sideways (4px row padding so focus rings aren't clipped, no visible scrollbar) and scrolls the current item into view on mount and on change (the row's own `scrollLeft`, never `scrollIntoView`). From 1100px a vertical list of 40px rows (current = `--bg-selected` + `--fg-primary` + 600), sticky 32px below `--chrome-top` unless `sticky={false}`. Items: `label`, optional 16px `icon`, optional right-aligned muted tabular `count`, `href` (link, `aria-current="page"`) or `onClick` (button, `aria-current="true"`). |
| `<StatRow items aria-label>` | A quiet row of counts (Home's records, endorsements, followers), in place of boxed count tiles. | Each stat is its value (Inter 600 at the h4 size, tabular) over a `text-ui` muted label; stats separated by 32px, wrapping on phones. Linked stats underline on hover (hover devices only). `loading` shows a skeleton, never "0"; a loaded `null` shows an en dash. |

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
| A page or section failed to load | **One pattern:** an inline block in place of the content — `<EmptyState>`-style (title, one sentence) or `<ErrorMessage>` — with a "Try again" button. Never a warning `<Banner>` for a load error. |
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

**Primary button:** "`<Button variant="primary">`: `--btn-primary-bg` / `--btn-primary-fg`, `body-sm` 500, 0 tracking, `var(--radius)`, about 40px on desktop and 44px minimum below 800px. Hover `--btn-primary-bg-hover` (hover devices only). Press `scale(0.97)`. Disabled: sunken fill, muted text, default border. `loading` shows a spinner and sets `aria-busy`."

**Settings card:** "`<Card variant="elevated">`, 24px padding. Eyebrow above in `text-label` `--fg-muted`. Fields with sentence-case `text-ui` 500 labels in `--fg-secondary`, 16px between fields."

**Confirm dialog:** "`<ConfirmDialog>`: serif `text-h4` title naming the action, one sentence of consequence in `body-sm` `--fg-secondary`, `secondary` Cancel and a primary (or destructive) button that repeats the verb. Actions stack below 800px."

**Bottom nav:** "Fixed bottom, `--bottom-nav-height` + safe area, opaque `--bg-elevated` with a `--border-subtle` top line. Five items, each a 24px icon over a short 0.6875rem / 500 mixed-case label, at least 44px tall. Active: `--fg-primary` and a heavier stroke (2.5). Inactive: `--fg-muted`. Press `scale(0.97)`."

**Skeleton:** "`<Skeleton>` shapes mirroring the feed card: 1:1 box, 70% title line, full and 45% description lines, a row of small pills. Fill `--overlay-weak`, the shared `animate-skeleton` recipe."

**Dark mode:** "Same structure; tokens flip on their own. Check that every text pair in the contrast table still holds and that floating surfaces are a step lighter than what's under them."

### 13.2 Common mistakes

- Copying hex values into components instead of tokens. Values change; tokens don't.
- Using `--color-primary` / `--color-white` (invariant) where a theme-aware token is needed, or `--color-off-white` / `--color-mid-gray` (landing) inside an app primitive.
- Putting a second column into the reading column. Wide layouts are explicit fullbleed opt-ins.
- Shadows on cards. Use the border shift.
- Filled icons, or active states shown by color alone.
- Wide tracking on mixed-case text, or a font size off the ramp.
- A serif section heading. Serif is for titles; sections use `text-section` (`<SectionHeader>`).
- A page-level `<h1>` outside `<PageHeader>`, or two `PageHeader`s on one page.
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
| Chrome | `--navbar-bg`, `--navbar-border`, `--sheet-bg`, `--navbar-height`, `--chrome-top`, `--bottom-nav-height`, `--top-bar-row1`, `--top-bar-total` |
| Shadows | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-modal`; rings and hairlines `--shadow-ring-{weak,medium,focus,error,elevated}`, `--shadow-outline-subtle`, `--shadow-inset-{subtle,hover,indicator}`, `--shadow-navbar-hairline` |
| Utility (invariant) | `--mask-opaque` (mask-image fill), `--mix-shade` (`color-mix()` darkening partner), `--confetti-0`..`--confetti-9` (group-result confetti) |
| Focus and selection | `--focus-ring`, `--selection-bg`, `--selection-fg` |
| Status | `--color-error`, `--color-error-bg`, `--color-error-border`, `--color-error-ring`, `--color-success`, `--color-success-text`, `--color-success-bg`, `--color-warning`, `--color-warning-text`, `--color-warning-bg`, `--color-warning-border` |
| Badges | `--badge-{success,warning,neutral,danger,accent}-{bg,fg,border}` (where defined), `--badge-count-bg`, `--badge-count-fg` |
| Button | `--btn-primary-bg`, `--btn-primary-fg`, `--btn-primary-bg-hover`, `--opacity-disabled` |
| Motion | `--duration-instant`, `--duration-fast`, `--duration-base`, `--duration-slow`, `--ease-out`, `--ease-emphasized`, `--ease-in-out`, `--transition-fast`, `--transition-base` |
| Geometry | `--radius`, `--radius-pill`, `--measure`, `--page-width-narrow`, `--page-width-default`, `--page-width-wide`, `--control-h-compact`, `--control-h-sm`, `--control-h-md`, `--control-h-lg` |
| Type | `--font-inter`, `--font-headline`, `--font-mono`, `--text-display`, `--text-h1`..`--text-h4`, `--text-section`, `--text-body`, `--text-body-sm`, `--text-ui`, `--text-caption`, `--text-label`, `--text-micro`, `--tracking-label` |
| Breakpoints | `--bp-gt-mobile`, `--bp-gt-narrow-desktop`, `--bp-gt-desktop` |
| Z-index | §4.10 |

---

## 15. Changelog

- **2026-11-13, "Seen as" apart from the workspace; Overview column from 1100px.** "Seen as" is its own setting (`useSeenAs`, `lib/groups/seen-as.ts`, per tab, default you): it alone decides what Feed and Explore show, and neither it nor the Workspace menu changes the other. Explore's "Accounts I follow" now follows it too (it used to stay on your personal follows). The Overview's ID and Your groups column is back on the right from 1100px (280px with a 32px gap; 300px and 48px from 1300px), not only from 1300px.
- **2026-11-13, "Seen as" on Feed and Explore.** Right after the Feed and Explore titles, **Seen as [avatar] Me ▾** shows which account the network is shown for and switches between you and your groups (`seen-as-switcher.tsx`; `<Popover>` menu on desktop, `<BottomSheet>` on phones). Same app-wide switch as the Workspace menu; hidden without groups. `<PageHeader>` gains `titleAside` for it.
- **2026-11-13, the account menu is always you; "My workspace".** The account button (desktop and phone) and the account menu show the signed-in person whichever workspace is open: no group avatar, no "as @you", View profile is your profile. Workspace calls yours **My workspace** (with `FolderOpen`, not your name and avatar, which the account button shows) and a group's by its name and square avatar, in a **fixed-width** pill sized to "My workspace" (128px at 800–1099px, 162px from 1100px). The phone tab shows `FolderOpen` in yours and the group's avatar in a group's. `/settings` is always yours (only a signed-in group account still gets its group settings there); a group's settings are **Group settings** in the Workspace menu, and the Overview's handle pencil in a group's workspace leads to `/groups/{did}/settings#account`.
- **2026-11-13, Workspace menu; Funding; endorsements in one place.** **Workspace** names the workspace you are in (avatar and name on desktop, the avatar on the phone tab) and opens a menu (desktop) or sheet (phones) to switch between your personal workspace and your groups' (`workspace-menu.tsx`, §4.4.2); picking one opens it. With one workspace it stays a plain link. The account menu loses Switch account and New group, and the acting-as bar is removed (`--acting-as-height` and `html.has-acting-as-bar` with it; the phone top bar now hides on scroll while acting as a group too). Network gains **Funding** (`/funding`, a placeholder like Map). The Overview shows endorsements received and given side by side in one section, "Endorsements and followers" (was "From others", with given under Your records). Lists: **Paste many** is a labelled button in an open list (was a bare icon). `<Wordmark>` paints past its box (`overflow: visible`): the "p" descenders end on the SVG's edge, and some zoom levels clipped a sliver off.
- **2026-11-13, Network pages without tabs.** Feed, Explore, Graph and Map drop the tab row (`NetworkNav` is removed, with `SideNav`'s horizontal orientation and per-item tour anchors). The Network menu is the way between them: the desktop button's `<Popover>` menu, and on phones the Network tab now opens the same list as a `<BottomSheet>`. The tour anchors Feed, Explore and Graph on the pages themselves (`feed`, `explore-category`, `graph`).
- **2026-11-13, Network menu; plain faded wordmark.** The desktop top bar's **Network** is a button that opens a menu of its four pages (Feed, Explore, Graph, Map; no Feed signed out), the current one checked; it shows as current on any Network page (`DesktopNetworkMenu`, a `<Popover>` menu like New). The pages keep their tab row; the phone tab bar's Network still goes straight to Feed (Explore signed out). Both top bars now show the faded Certified.app **without** the Beta pill (`<Wordmark variant="certified-app" faded>`), like the footer.
- **2026-11-13, Network: Feed, Explore, Graph, Map.** The navigation is **Workspace | Network · Apps** (three destinations; three tabs on phones). **Network** groups four views of everyone's work as a row of tabs at the top of each page (`NetworkNav`: `SideNav orientation="horizontal"`, words only on phones): Feed, Explore, **Graph** (new `/graph`: the endorsement network, `<Visualization embedded>` in the page container; `/endorsement-graph` redirects there, and Help's "Open the endorsement network" links there instead of opening a pop-up) and **Map** (new `/map`: a placeholder saying the map is coming). Network opens on Feed, or Explore when signed out. `SideNav` gains `orientation="horizontal"` and per-item `tour` anchors. The tour adds Network and Graph steps.
- **2026-11-13, Beta in the wordmark.** Both top bars show the faded Beta wordmark (`<Wordmark variant="certified-app" beta faded>`): the artwork's own thin pill over "app" (exactly as wide as "app", in the space above its x-height, "BETA" cut out; it adds no size), and ".app" at 50% opacity. The separate Beta tag beside the wordmark is gone. The footer shows the faded Certified.app without the pill.
- **2026-11-13, Certified.app wordmark in the chrome.** Both top bars and the site footer show **Certified.app** (`<Wordmark variant="certified-app">`: the wordmark plus ".app" in Switzer 450; `height` is the letter height, and the "p" descenders hang below the layout box). The footer's `<img>` and its dark-mode `filter: invert(1)` are gone; it uses `currentColor` like the top bars. `/welcome` keeps the plain Certified wordmark.
- **2026-11-13, Workspace and the network.** The navigation is two groups: **Workspace** | **Feed · Explore · Apps** (four destinations instead of five; a divider between the groups on desktop, four tabs on phones). Workspace replaces Home and Records: one `WorkspaceShell` (a `SideNav` of Overview, Projects and activities, Endorsements, Followers, Lists and Groups; one scrolling pill row below 1100px, `overflow="scroll"`) frames `/home` (Overview) and `/records?kind=…`; the URLs are unchanged and `/workspace` redirects to `/home`. Each section's head is now the page's `<PageHeader>` (h1); the Overview keeps the identity header and moves its ID and groups column to ≥1300px (300px). New **Groups** section: every group with your role, Switch and New group (Home's "All N groups" links there). Back links and copy say Workspace; the tour has one Workspace step.
- **2026-11-13, Settings: Social graph; Appearance only in Settings.** The settings section is **Social graph** again (personal and group; `#bluesky-follows` still lands there), with a **Sync with Bluesky** block under it that says what the sync does. The account menu no longer has the Light / Dark / System row; Settings → Appearance is the one place.
- **2026-11-13, Records: Followers and Lists as tabs.** Following and Followers merge into one **Followers** kind with two tabs, Followers first (like Endorsements: what others gave you first); `?kind=following` redirects to `?kind=followers&tab=following`. **Lists** gets a tab per kind (Activities, Projects, Accounts, Endorsements), so the kinds are no longer four same-sized headings under the pane title; endorsement lists show both here and under Endorsements. Each list tab has its own "New … list" button (`<ProfileLists only>`; `<EndorsementLists hideTitle>` drops its inner "Lists" heading under a tab). The side list has no counts; the tabs carry them where a count is cheap.
- **2026-11-13, wordmark, Beta tag, one Feedback button, Home boxes.** Both top bars show the full **wordmark** (new `<Wordmark>` primitive: inline SVG in `currentColor`, so it flips with the theme) with a **Beta** tag (`<Badge variant="tag" compact>`) instead of the square brandmark; the phone bar keeps the brandmark only while its compact title shows. The desktop destinations are words only at 800–1099px so the row fits. The **floating Feedback button is removed** (with `--z-feedback-trigger` and `isFeedbackTriggerVisible`); Feedback stays in the site footer and the account menu. The footer drops its theme switch, and so does the account menu: Appearance is in Settings only. **Home**: the header has no buttons (the name, and the @handle when it stands in for a bio, link to the profile, which has Edit); the ID and Your groups are white boxes (`<Card>` elevated, 16px padding) in a right-hand column level with the header from 1100px, and under the header on phones. The handle's copy box has a pencil (`<Button size="icon-sm">`, left of the copy icon) to Settings → Account, for your own account or a group you own or admin.
- **2026-11-13, redesign review round 2: shell and primitives.** **Phone top bar** keeps a back chevron on every page that isn't top-level (records, other people's profiles, group pages, forms), with or without a `PageHeader`; only the compact title drops when a `PageHeader` is mounted; New and the account button (or Sign in) are on the right on every page (§4.2). New **`--bg-selected`** token for the current item (SideNav, the top bar's current destination; the active segment of segmented controls in dark mode): in dark mode it is a step above `--bg-elevated`, so the current item no longer reads as a hole (§2.2). **SideNav on phones** wraps up to six items onto more lines; longer lists scroll the current item into view (§9.13). The underline `TabList` spans the full width (§9.6). The desktop search placeholder is "Search" (it clipped at 800–1099px). The **floating Feedback button** is hidden on Records and record pages as well as forms; the **site footer** gains Feedback and a compact theme switch, for everyone (§4.1, §4.4). "Sign in with another account" asks the PDS who is signing in (`prompt: "login"`) instead of bouncing back into the same account (§4.4.1). Toasts stay live while a bottom sheet is open (§9.9). Groups can create: `/create` is no longer personal-only, so switching to a group there keeps the form. `/endorsements?tab=…` keeps its tab when it redirects to Records.
- **2026-11-13, redesign review fixes: shell, primitives, accessibility.** **`--chrome-top`** (navbar height + the phone acting-as bar) is the one top edge for sticky elements and the root's `scroll-padding-top`; `scroll-padding-bottom` clears the tab bar, so focused controls never land under fixed chrome (§4.1). The **desktop top bar is one row**: row 2 (record tabs + Back, Back on create pages) and `--top-bar-row2` are gone, pages carry their own back link and tabs; signed-out visitors get Help there; the search steps aside on `/explore` (§4.4). On phones a page with a `PageHeader` gets the **normal bar**, with no second back link or title (§4.2). The tab bar is hidden on create and edit forms (§4.3), and Records uses `FolderOpen`. The site footer sits after `<main>` (contentinfo), links Help for everyone and has 44px links on phones. **Counts are neutral:** `<Tab count>` is a muted tabular number, never the red badge (§9.6). **One error pattern:** a load failure is an inline block with "Try again", never a warning banner (§10.1). **One primary per page:** at most one black button in a page's content; the top bar's New is the global one (§9.1). **Page widths:** the five destinations, Settings and Help share `PageContainer width="default"` (1120); forms keep theirs (§4.6). SideNav's current item on phones is a sunken pill (not black). Card hover is a border change only. SegmentedControl / ToggleGroup and `Input size="sm"` are 44px / 16px below 800px. Avatar initials are `aria-hidden` and show while an image loads. **Focus:** portaled menus focus their first item once positioned, close on Tab and return focus to the trigger; bottom sheets move focus in, make the page inert and trap Tab; dialogs record their opener at first render and take `returnFocusRef`; use `initialFocusRef`, not `autoFocus`, in dialogs (§9.7–§9.9). Acting as a group reads "Acting as {Group} · {Role}" with "Switch to personal account"; "New group" sits after its own separator in the account menu. The floating Feedback button is secondary and hidden on forms. **Docs reconciled with code:** the one press scale is `0.97` (buttons via `.press-scale` and the tab bar; the plan's value); the EmptyState icon is 40px (the code's value, now also in the plan).
- **2026-11-13, redesign foundation: the shell and navigation.** One set of five destinations everywhere: Home, Feed, Explore, Records, Apps (signed out: Explore, Apps). **Desktop top bar** row 1 is now brandmark + the destinations (20px icon + word; current = sunken pill, no weight change) on the left, and search (`/` focuses it), a primary **New** button (New activity / project / group) and the **account button** on the right; the page title, the Profile / Settings / Help links and the dormant hamburger + site drawer are gone; a page without a `PageHeader` keeps a visually hidden h1 there (§3.6). **Phone top bar**: brandmark, `+` and avatar on top-level pages; back chevron + compact `text-section` title on detail pages; no hamburger, no profile overlay (profile pages get the normal bar and the banner starts below it). **Bottom tab bar** in every phone browser (not only the installed app) with the five destinations; Create and Feedback left it. **Account menu** (§4.4.1), one component as a desktop popover and a phone sheet: current account + View profile, Switch account (personal, groups with handle and role, New group), Settings, Help, Send feedback, Appearance, Sign in with another account (labelled as replacing the session) and Sign out behind a confirmation. Groups draw square avatars (`<Avatar shape="square">`). The floating Feedback button is desktop-only. New `--z-chrome-menu` layer for the top-bar menus. Records stays in the navigation while acting as a group and explains itself. `/endorsements` → `/records?kind=endorsements` and `/workspace` → `/records`. `/create` and `/project/new` show a Sign in button when signed out. The Help graph pop-up no longer blanks the page title or widens the Help page.
- **2026-11-13, redesign foundation: page primitives and type roles.** New `text-section` type role (Inter 600, 1rem, leading 1.4; `--text-section`) for section headings inside a page. Serif `font-headline` + `text-h1`..`text-h4` is kept for titles of named things: page titles, account names, record titles, empty-state and dialog titles. New primitives (§9.13): `<PageContainer>` (narrow 720 / default 1120 / wide 1280, `--page-width-*`, joins the page-frame shell layout via `.page-container`), `<PageHeader>` (the page's visible `<h1>`), `<SectionHeader>` + `<SeeAllLink>`, `<SideNav>` (the Records kinds nav, generalised) and `<StatRow>` (replaces boxed count tiles). The chrome h1 contract (§3.6): `PageHeader` registers through `navbar-context` (`useRegisterPageHeader`), and the chrome reads `useHasPageHeader()` to skip its own h1; the chrome starts reading it in the shell step that follows, so pages adopt `PageHeader` after that. Rule 6 (§0 and `CLAUDE.md`) allows `text-section` for section headings.
- **2026-11-13, Records.** New `/records` page (Records, a `Library` icon, between Apps and Profile in the top bar; personal account only) where the signed-in person manages what their account holds. Kinds: Projects / Activities (each project a folder of its activities, plus "Without a project"; search, open, edit, delete with the type-the-name dialog), Endorsements (tabs: Given, with "Endorse someone" and remove; Received, with show/hide; Lists, the endorsement lists), Following (unfollow, kept as a Follow row until you leave), Followers (read-only, follow back) and Lists (lists of activities, projects and accounts). Kinds sit in a sticky column from 1100px and a scrolling row of pills below; `?kind=` picks the pane.
- **2026-11-13, feed on its own page.** The follow feed moves from `/home` to `/feed` (Feed between Home and Apps in the desktop top bar, and in both menus), starting straight with the feed (no page header). From 1100px the feed is three columns: the filters in a sticky box on the left, the feed (600px) in the middle, News from Certified on the right; below 1100px the filters stay behind the "For you" disclosure. Home drops the news panel; "Your groups" becomes a box under the account card with "New group" in its corner, shown even when empty. The account card has no banner strip when there is no banner. Home shows four apps; the rest are under "All apps".
- **2026-11-12, account-centred home.** `/home` now leads with the account the viewer is acting as: an account card (profile and ID, with the handle and permanent ID click-to-copy), then Records, From others (endorsements, followers), Apps and Your groups, with the follow feed as the last section. The old sidebar ("My groups / projects / activities") and the feed-first layout are gone. The bottom-nav Home icon is a house instead of a newspaper.
- **2026-10-22, Button sizes on the control-height scale.** Owner decision: Button `sm` / `md` / `lg` are 32 / 36 / 44 on desktop (`min-h-control-compact` / `-sm` / `-md`), `icon` is 36 on desktop to match `md`; all stay 44 below 800px. Replaces the padding-driven ~30 / 40 / 44 and the 40px icon square.
- **2026-10-22, docs-to-code reconciliation.** Synced this file, `AGENTS.md` and `CLAUDE.md` with the shipped code. Motion: popover and toast enter at `--duration-fast`; tab panel is `--duration-base` + `--ease-emphasized`, 12px; tooltip has no fade; dialog has no exit animation; drawer and bottom-sheet exits documented; navbar hide uses `--transition-base`; `--ease-in-out` has no consumer; `--transition-slow` removed. Reduced motion: spinners keep turning (they are exempt from the backstop); dialog, toast, tab panel and popover keep 150ms fades. Button `sm` / `md` / `lg` documented at their current ~30 / 40 / 44px desktop heights, with the control-height scale marked not yet applied (owner decision pending); `icon-sm` documented. `--border-control` scoped to checkbox and switch-off (RadioGroup draws no circle). Bottom nav documented as opaque `--bg-elevated` with 0.6875rem / 500 mixed-case labels and a 2.5 active stroke. Skeleton fill is `--overlay-weak` (`--skeleton-bg` is not a defined token). Bottom sheet surface is `--bg-elevated`. Shadow hard rule reworded in all three files: elevation is `--shadow-sm/md/lg` + `--shadow-modal` (dialogs), rings and hairlines use the new `--shadow-ring-*` / `--shadow-inset-*` / `--shadow-outline-*` / `--shadow-navbar-hairline` tokens. §12 now documents the shipped stylelint config (`npm run lint:css`), also added to the `CLAUDE.md` first checks. Avatar `xs` / `2xl`, Input `bare`, removed AppDialogHeader `center` prop, `--text-*` and `--control-h-*` tokens added to the appendix. AGENTS.md token lists updated (four border tokens, motion tokens, `--scrim`, `--z-feedback-trigger`).
- **2026-10-22, polish pass** (`docs/polish-2026-10/design-md-proposals.md`). This document was rewritten as one body with `tokens.css` as the single numeric source. Added: type ramp with loaded weights (Noto Serif 600 now loaded; `ui`, `label`, `micro` steps), uppercase-only tracking, tabular numerals rule, text-wrap and measure, contrast table and badge fixes, `--border-control`, border tokens collapsed to four, `--bg-raised` redefined as a tint, `--bg-overlay`, one `--scrim`, translucent chrome derived from surfaces, interaction-state table, `hoverOnlyWhenSupported`, focus recipe and ring-color safety net, control heights and `icon-sm`, motion duration/easing tokens, reduced-motion rule, icon ladder, spacing rhythm, async-state matrix, dialog voice (serif titles), sentence-case field labels, stylelint. Removed stale content: retired rails, old dark palette, phantom tokens, the "spring overshoots" claim, the 768px iOS rule, the 4px / 16px radius exceptions.
- **2026-06, landing redesign** (PR #165). `lp-` system, guilloche, landing dark mode.
- **2026-05-28, design consolidation** (PR #108). Radius locked to 2px with no exceptions; landing dark mode; breakpoints 800/1100/1300 only; `<Card>`, `<Tabs>`, `<Skeleton>`, `<Popover>` primitives; `Button size="icon"`, `Input` sizes, `Badge` variants; z-index tokens; `AddOrgModal` and `MembershipSyncModal` moved to `<AppDialog>`. Audit: `docs/design-audit/component-audit.md`, `docs/design-audit/visual-divergence.md`. Plan and decision log: `docs/design-consolidation/plan.md`.
