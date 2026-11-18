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
| 9 | Dark mode must work. Toggle `data-theme="dark"` on `<html>` and check (and, for a token change, the experimental styles, §2.11). Landing uses the theme-aware `--color-navy` / `--color-off-white`, not the invariant `--color-primary` / `--color-white`. | Manual |
| 10 | Reach for a primitive in `src/components/ui/` before writing a component or BEM class. | `ls src/components/ui/` |

And the rules that this document adds on top:

- Never put a Tailwind `/NN` opacity modifier on a `var()` color (`ring-[var(--x)]/20`). Tailwind 3.4 compiles it to nothing. Use a pre-mixed token or `color-mix()`.
- Only sizes from the type ramp (§3.2). Positive letter-spacing only on uppercase text.
- Hover styles exist only on devices that hover (§6.1).
- Name transition properties; never `transition: all` (§7).
- Cards never carry shadows, including on hover (§5).
- At most one primary (black) button in a page's content (§9.1). There is no global New: you create from the Workspace (its sections' own New buttons).
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
- Navigation folds from desktop to phone: a left sidebar on desktop, a labeled floating pill and bottom sheets with drag-to-dismiss on phones, under a translucent top navbar; one account control shows who you act as.
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
| `--bg-sunken` | Recessed: toggle tracks, inset wells. |
| `--bg-canvas` | Page background. |
| `--bg-elevated` | Cards, inputs, popovers. Lighter than canvas in both themes. |
| `--bg-floating` | Anything that floats over the page: menus and popovers, dropdowns and suggestion lists, bottom sheets, the drawer, toasts, the walkthrough card, sticky bars content scrolls under, the phone tab bar. **Always opaque** (text over text is unreadable, however blurred): it is `--bg-elevated`, and a style whose cards are translucent (Glass) sets a solid colour (`looks.test.ts` checks every style). |
| `--bg-selected` | The current / selected item: the SideNav's current section, the sidebar's current row and the pill's current item; in dark mode also the active segment of a segmented control (light keeps the raised `--bg-elevated` segment). Light `#eeeeee`; dark `#3a3a40`, a step **above** `--bg-elevated`, because lighter reads as "on" in dark mode and `--bg-sunken` made the current item look like a hole. Never `--bg-sunken` for "current". |
| `--bg-overlay` | `<AppDialog>` and the dialogs built on it. A lifted page (it resolves to the canvas value); inputs and cards inside it sit on `--bg-elevated`. Bottom sheet and drawer paint `--bg-floating`. |
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
| `--scrim` | The one dimming layer behind every blocking surface: AppDialog `::backdrop`, Drawer, BottomSheet, FeedbackModal, the menus opened from the phone pill (and the tour backdrop). 0.5 black in light, 0.6 in dark. A dialog and a sheet showing the same content dim the page by the same amount. `--modal-backdrop` is removed. |
| `--scrim-pill`, `--scrim-pill-hover`, `--scrim-pill-ghost` | Invariant pills over user images (avatar / banner "Change"). Don't flip with the theme. |
| `--media-letterbox` | Invariant black behind embedded video. |

### 2.9 Translucent chrome

Translucent chrome is always the surface it sits on at reduced alpha, never a separate literal: `--navbar-bg` is canvas at 80% (`color-mix()` toward transparent), `--sheet-bg` is elevated at 95% (both defined once, no dark override). The phone top bar and the desktop top bar use `--navbar-bg`; the bottom tab bar is opaque (§4.3). Chrome blurs what scrolls under it (`backdrop-filter: blur(12px)`). Text over blur uses `--fg-primary` or `--fg-secondary`, never `--fg-muted`. The chrome edge is a 1px `--navbar-border` hairline (drawn with `--shadow-navbar-hairline`), not an elevation shadow.

### 2.10 Selection

`::selection` uses `--selection-bg` / `--selection-fg`: ink on paper in light, paper on ink in dark.

### 2.11 Styles (experimental)

Settings → Appearance → **Style** switches the whole app between design directions, per browser: **Neutral** (this document) and Almanac, Linen, Banknote, Wallet, Dot matrix, Glass, Shapes and Stamp, from the design-directions exploration. A style is `data-look="<id>"` on `<html>` (`src/lib/look/looks.ts`; an inline script in the root layout restores it before first paint). Each one redefines the tokens on `:root` in `src/app/styles/looks.css`, so every page changes at once and the derived tokens follow:

- **Colours**, light and dark: the surfaces, foregrounds, borders, overlays, primary button, accent / focus, selection and avatar fallback.
- **Typefaces:** `--font-inter` (UI), `--font-headline` (titles), `--font-mono`, plus `--font-numeral` (`StatRow` values) and `--font-label` (the `.text-label` step), both unset in Neutral. Faces load through next/font without preloading, so only the chosen style's download.
- **Heading weights:** `--weight-headline-strong` (display, h1) and `--weight-headline` (h2–h4), read by the Tailwind type ramp (default 700 / 600).
- **Corners:** `--radius`, which Tailwind's `rounded` now reads too. One value per style, so small controls share the card radius.
- **Shadows** (`--shadow-sm/md/lg`) and an optional `--look-backdrop` behind the page: Glass's landscape gradient, Dot matrix's dot field, Stamp's grain.

The hard rules (§0) still hold for code, and components keep using the tokens. The picker's tiles are a style's name and one line about it over a live preview (`[data-look-preview]`, the same blocks); a made style's tile ends in its version row. Own colours (a theme the account carries for visitors) is a different feature and isn't a style.

**Centerpieces.** Beyond tokens, every style redraws the same three places, and only these, so each direction shows itself where it matters most instead of in one-off spots:

| Centerpiece | Hook | What a style changes |
|---|---|---|
| The avatar | `[data-centerpiece="avatar"]` on `<Avatar>` (`data-shape`, `data-fallback` while showing initials) | Shape, frame, image treatment, the initials fallback. On every page. |
| The ID card | `[data-centerpiece="id"]` on the Overview's ID box (with `data-did`), which carries the account on top (avatar, name, bio, website) and then the ID | The account's identity object: frame, material, marks. |
| An endorsement | `[data-centerpiece="endorsement"]` on the Overview's and the profile's endorsement rows; parts `data-part="who|when|note"` | How a peer's endorsement reads. |

Neutral leaves them as designed. Per style: Almanac engraved images, a ruled ID frame and pull-quote notes; Linen squircle groups, a soft ID panel with the one gold check and gold-ruled notes; Banknote seal rings, the ID as a passport page (microtext of the DID, guilloché watermark, foil chip) and countersigned notes; Wallet gradient initials, the ID as a pass (scoped white-on-gradient tokens, grain) and endorsements as cells; Dot matrix dot-screened images, a dot-field ID with a dot-type title, mono dates and a red dot; Glass light-edged avatars, a frosted ID sheet and frosted endorsement chips; Shapes a nine-lobed cookie for groups, a tonal ID and a burst per endorsement; Stamp halftone avatars, a stamped ID and an "Endorsed" stamp per endorsement. A new style must define all three (`looks.test.ts` checks).

**Styles made from a website.** Below the picker, **Make a style from a website** lets a person build their own style with Claude, on their own Claude API key (kept in their browser, sent only to Anthropic; Anthropic bills them):

- The server reads the site (`GET /api/looks/site-design`: signed in, rate-limited, every fetch through `guardedFetch`) and returns only a digest of its design (`src/lib/look/site-design.ts`): colours by where they're used, page-level declarations, custom properties, faces, radii, shadows, design class names, and the habits a site is recognised by (gradients, uppercase and tracking, dashed or double borders, hard shadows, italics), `var()` resolved.
- The server also renders the site (`GET /api/looks/site-capture`, signed in, 10 per 10 minutes): screenshots (desktop 1280×800, its first screen and one further down; phone 390 wide), the logo, the share image, the computed styles of real elements (body, headings, links, buttons, header, nav, footer, cards, inputs) and the colours covering most of the screenshots. Headless Chromium runs `scripts/site-capture/capture.mjs` in a throwaway Vercel Sandbox VM (`src/lib/look/site-capture.ts`; snapshot from `scripts/site-capture/make-snapshot.mjs`, id in `SITE_CAPTURE_SNAPSHOT_ID`), never in Certified's own function: the site's scripts run there, the VM holds no secrets and refuses private address ranges, and it stops after the capture. In local development it uses the installed Chrome; without either, the style comes from the digest alone.
- The browser sends the screenshots (as images, each after a line saying what it is), the rendered styles and the digest to Claude Opus 5.5 (`generate-look.ts`, structured output, high effort). The prompt (cached, since it is long and the same every time) gives Claude an art director's method: look at the screenshots first and write the site's character in one sentence, name its signature (two to four things it is recognised by), name one idea that carries that character into an account app, and choose one signature piece (ID card, avatar, endorsement or backdrop) to carry it loudly while the others stay quiet; then type, colour (the brand sparingly), shape, evidence and a check of the whole, with a list of clichés to avoid unless the site uses them. A plain site gets a plain style done well. The answer records `character`, `idea` and `signaturePiece` before any lever. The ID card can also be drawn on the site's own image (`idCard.surface: image`): a texture, pattern or line art the capture found behind the site's content, its pixels taken from the capture and kept with the style (`assets.idImage`). Claude sees each such image whole and small, to tell what it shows; the card gets a separate crop, about its own shape, at the scale the site shows the image and from its most detailed part (WebP), so the grain survives. On a strong card (brand, gradient, ink, image) the avatar's fill is re-scoped with the ink (`--look-id-avatar`), so its initials read in both modes. Claude answers with the site's anchor colours (background, surface, text, muted, border, two brand colours, how buttons and the other mode's greys lean), faces from a fixed catalogue of the faces the app loads (`LOOK_FACES`; the CSP allows no other font host), weights, a radius, and one choice per design move from `MOVES`: the shadows, a page backdrop and its intensity (dots, grid, hatching, glow, mesh, band, wash, grain), and the three signature pieces: the avatar (shape, ring, initials fill and face, picture treatment), the ID card (surface, including brand, gradient and inverted ones that re-scope the card's ink as Wallet's pass does; edge; pattern; title; corner mark) and the endorsement (frame, name, note, mark).
- **Nothing invented.** The prompt asks Claude to translate, not invent: a plain site gives a plain style. Every lever starts on a plain option (`PLAIN`); any other choice needs an evidence quote copied from the rendered styles or the digest (or from the person's request, in a new version), and `groundLookSpec` checks each quote against them and resets an unsupported move to plain. Every colour is snapped to the nearest colour the site uses (`siteColoursOf`: its CSS, its rendered elements and the colours covering its screenshots); a second brand colour the site doesn't have becomes the first.
- `normalizeLookSpec` checks every value: colours must be `#RRGGBB`, faces must fit their role, moves must be on the menu, numbers are snapped. Colours are worked in OKLCH (`oklch.ts`): the site's own mode keeps its colours, the other mode is built from the same hues (or from the site's own other scheme), and text is pushed to WCAG AA by lightness only, so hues survive. `buildCustomLookCss` turns the spec into looks.css's shape (tokens on `:root[data-look="custom-<id>"]` and `[data-look-preview=…]`, light and dark, then the three pieces from fixed templates), so nothing the website wrote reaches the CSS.
- Up to eight are kept in localStorage with their compiled CSS, which the before-paint script injects as `<style id="custom-looks">` (once a page is idle, `syncCustomLooksCss` rebuilds that CSS from the stored styles if the templates have changed since it was saved); they show as tiles after the built-in ones, each marked "Made in this browser" (with its version) and carrying two buttons on that line: **Remove** and **New version** (the refresh button). There is no separate list. A new version takes an optional request ("use the green from their buttons"), and Claude reads the site again with the previous version and the request in hand. The new version takes the old one's place in its tile; every version is kept (up to 12 per style, each with the request that led to it, the site image stored once for all of them), and the tile's bottom row works on the version on show: a light picker (once there are two), delete it (asked first; the last one removes the style) and New version. "Made in this browser from <site>" sits under the description. One frame goes round the tile and its row and clips them, so the corners hold whatever the style's radius. When the browser's storage is full, the oldest versions not on show go first. After a style or a new version is made, a dialog says so and shows Claude's own notes: up to five first-person bullets on what it took from the site and where it shows (`notes`, written last in the answer). Where the app took a choice back (moves without evidence, an image the capture didn't bring), it says so in its own words (`lookCaveats`), so the notes never promise what isn't there. It sends the person to look around, and to New version on the tile for changes; after a new version it offers the way back to the one before.

---

## 3. Typography

### 3.1 Families and loaded weights

| Var | Family | Loaded weights | Role |
|---|---|---|---|
| `--font-inter` | Inter | Variable font (every weight in one file); the system uses 400 / 500 / 600 | Everything that isn't a title: section headings, buttons, nav, labels, body, meta. |
| `--font-headline` | Noto Serif (normal + italic) | 300 / 400 / 600 / 700 | Titles of named things: page titles, account names, record titles, empty-state and dialog titles. 300 is landing display only; 400 is landing item titles; 600 is app titles h2-h4 and feed card titles; 700 is display and h1. |
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
- Feed card title is serif at the `h4` step (1.125rem, `--weight-headline` 600, leading 1.35) at every width, two-line clamp, `text-wrap: pretty` (not balanced: balancing a clamped title spreads it over short lines).
- App type does not scale with the viewport. Landing display type is fluid via `clamp()` (§11).
- Two serif voices: the app speaks firm serif (600/700); the landing speaks light serif (300 display, 400 item titles). Don't mix them on one surface.

### 3.3 Tracking and case

- Positive tracking exists only on uppercase text, one value: `+0.06em` via `text-label` / `tracking-label`. The landing mono registry numerals are the only place wider tracking appears. (`caption` and `micro` carry their small optical tracking from the ramp.)
- Mixed-case text, including button labels and field labels, has 0 tracking. Spaced-out lowercase degrades word shapes.
- Serif headings get the slight negative tracking in their ramp step. Don't add more.
- UI copy is sentence case. Uppercase is a style (`text-label`), never typed into the string.

### 3.4 Numerals and OpenType

- Any number that changes or sits in a column uses `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`): counts, badges, pagination, timestamps, funding amounts, stats, table cells. Never `font-feature-settings` for this; it replaces other features on the element.
- **Dates, one rule everywhere** (`src/lib/utils/format-date.ts`). When something happened (a post, an endorsement, a record made) is relative up to 7 days ("just now", "5m ago", "3h ago", "2d ago", `formatRelativeDate`), then the absolute date. An absolute date is "13 Nov 2026" (`formatShortDate`; month precision "Nov 2026", `formatMonthYear`), in UTC, never ISO "2026-11-13" in the UI. A label with a prefix ("Since", "Joined", "Created", "Until") and a work period use the absolute date. Dates are set in the surrounding face with tabular figures, never mono.
- `'case' 1` is part of `text-label`, not a per-class list.
- DIDs, AT URIs and wallet addresses use `slashed-zero` (`<WalletAddress>`).

### 3.5 Wrapping and measure

- `h1`-`h4` and serif titles use `text-wrap: balance`.
- Descriptions and long-form paragraphs use `text-wrap: pretty`.
- Prose caps at `--measure` (65ch) regardless of container width. 1280px pages hold grids, not paragraphs.
- Long unbroken strings (DIDs, URLs, handles) wrap via `overflow-wrap: break-word` on `body`; components that want an ellipsis set `white-space: nowrap` themselves.

### 3.6 Heading hierarchy

Every page has exactly one `<h1>`.

- **A page with a `<PageHeader>`:** the header's title is the page's visible `<h1>`. `PageHeader` registers itself through `navbar-context` (`useRegisterPageHeader()`, ref-counted). The chrome reads `useHasPageHeader()` and, while it is true, renders no h1 of its own, visible or visually hidden. On a **top-level page** (Feed, Map, a Workspace section, Apps, Settings, Help) the title moves into the phone bar: `PageHeader` passes it (`barTitle`), the bar shows it as plain text (`aria-hidden`), and the header's h1 is visually hidden below 800px (`max-[799px]:sr-only`), so there is still exactly one h1. A header with its own back link keeps its title.
- **A page without a `PageHeader` (fallback):** the chrome renders the page title (`usePageTitle`; `AuthGuard` sets it when signed out) as the `<h1>`: visually hidden in the desktop top bar, and the phone bar's compact title (centred next to the square brandmark on top-level pages, next to the back chevron on other pages). While a `PageHeader` is mounted the desktop bar renders no h1 and the phone bar shows its normal layout with no title (§4.2).
- Under the h1, section headings are `<h2>` (`<SectionHeader>`, or `as="h3"` inside an h2 section); card and empty-state titles take the next level down (the level passed via `headingLevel`).
- Visual size and DOM level are independent: pick the ramp step for the look and the element for the outline.

---

## 4. Layout

### 4.1 Shell

The app shell (`src/components/layout/app-shell.tsx`) is a single centered column; top-level pages lift it with `<PageContainer>` (§4.6). Navigation is chrome around it, and it is the same everywhere: **three destinations, in one order: Workspace | Network · Apps** (`src/lib/layout/destinations.ts`; the pages each lists are in `src/lib/layout/nav-items.ts`). **Workspace** is what your account holds and what you manage: the Overview (`/home`) and the Records sections and Groups (`/records?kind=…`). **Network** is everyone's work, five pages: Feed (`/feed`), Explore (`/explore`), Graph (`/graph`, the endorsement network), Map (`/map`) and Funding (`/funding`); the pages carry no tab row of their own. **Apps** are the other apps that work with the same account. Signed-out visitors see Network (without Feed) and Apps. Nothing lives only in a drawer, and no destination is hidden per account: a section an account can't use explains why in place (the Records sections and Groups while acting as a group).

**Desktop is a left sidebar; the phone folds it into a floating pill.** One structure at both sizes (Vercel's in a phone browser): the sidebar (§4.4) holds the account control, search, every page and Help/Settings; on phones the top bar (§4.2) keeps the account control (whose sheet also holds Help, feedback and the legal links) and the pill (§4.3) the destinations, Workspace and Network each opening a menu of their pages above it.

| Viewport | Chrome | Content |
|---|---|---|
| < 800px | Phone top bar (§4.2) + floating pill (§4.3) | Column up to 720px, 16px side gutter |
| 800–1299px | Sidebar as an 88px rail (§4.4) | Beside the rail. Column 600px; `<PageContainer>` pages 720 / 1120 / 1280px |
| ≥ 1300px | The full 248px sidebar (§4.4), or the rail when collapsed | Beside it, as above |

Which routes get the chrome is one decision, `routeChrome()` (`src/lib/layout/chrome.ts`): the app chrome on app routes; on the legal pages the phone chrome only (desktop renders their landing top bar); none on `/welcome` (its own minimal chrome) and `/embed`. `useLayoutBreakpoints()` mirrors the CSS breakpoints and JS-unmounts the phone bar and the pill on desktop. The sidebar is never gated in JS: it always renders on the server and CSS hides it below 800px and switches rail and full list, so the content never jumps sideways. `--sidebar-width` (tokens.css: 0, 88px from 800px, 248px from 1300px unless collapsed; zeroed by `:root:not(:has(.app-sidebar))` where it isn't mounted) pads the body. There is no desktop top bar: pages start at the top.

**Who you act as** is one control, the **account control** (§4.4.1): the sidebar's top slot on desktop, the right end of the phone top bar. It shows the account you act as, drawn as one mark: your round avatar, or the group's square avatar with your round one on its corner (`ActingAvatar`); its menu holds "Act as" (you and your groups) and "Signed in as" (your profile, another sign-in, sign out). There is never a second avatar for you in the chrome. It decides everything at once, on every page: what you create, follow, endorse, like and comment as, **and what Feed and Explore show** (`useActingViewer`, `src/lib/groups/viewer.ts`: the network of the account you act as). Switching keeps you on the page you're on, unless that page only works for your personal account. There is no separate reading setting (the old "Seen as" is gone). The Create forms' "publishing as" line names the account too. In navigation, menus and buttons the account kind is a **group**, never "organization". **Creating** lives in the Workspace: Projects and activities has New activity and New project (as a group too), the Overview offers New activity while there are no records, Groups and the account menu have New group.

**`--chrome-top`** (tokens.css) is the bottom edge of the fixed top chrome: `--navbar-height` (64px on phones, 0 on desktop, which has no top bar). Every sticky element uses `top: var(--chrome-top, var(--navbar-height))`. The root's `scroll-padding-top` is `--chrome-top` and its `scroll-padding-bottom` the pill's footprint (`--bottom-nav-height`) + safe area + 16px, so a control reached by Tab never sits under the fixed bars (WCAG 2.4.11); pages with a sticky form action bar add its height. A phone bar hidden on scroll comes back while it holds focus.

**Landmarks:** the sidebar (desktop) and the phone top bar are each the page's one `<header>` (banner; the other is `display: none` or unmounted), the sidebar holding the search landmark and `<nav aria-label="Main navigation">`, as the phone pill is. A page without a `PageHeader` gets a visually hidden h1 in the sidebar (desktop) or the compact title (phone) (§3.6). The page is `<main id="main-content">` (the skip link's target; `AppShell` renders it), and the site footer follows `<main>`, so it is the contentinfo landmark on every page, including `/welcome` and the legal pages. The footer links Welcome, Help, Feedback (opens the feedback dialog), Docs, Terms, Privacy and Imprint, for everyone. The theme switch is not in the footer: Appearance (Light / Dark / System) is in Settings only. Links are 44px tall on phones.

### 4.2 Phone top bar (< 800px)

`navbar.tsx`. Fixed, `--navbar-height`, translucent chrome (§2.9). For an account with nothing to switch it hides on scroll down and returns on scroll up (compositor-only transform, `--transition-base`); for someone in a group it **stays put**, because it carries who they act as. On desktop `--navbar-height` is zeroed.

One bar on every page:

| Slot | Top-level pages: the destinations (`/home`, `/records`, `/feed`, `/explore`, `/graph`, `/map`, `/funding`, `/apps`), `/settings`, `/help`, your own profile | Every other page: a record, someone else's profile, a group page, a form, the legal pages |
|---|---|---|
| Left | The faded Certified.app wordmark (`<Wordmark variant="certified-app" faded>`, 18px letters, ".app" at 50%, no Beta pill, to Home; `/welcome` signed out); the square brandmark instead whenever a title shows | Back chevron (`<Button size="icon" aria-label="Go back">`), **whether or not a `PageHeader` is mounted**: the installed app has no browser Back, so this is the way back to where you were |
| Center | The page's title: the `PageHeader`'s (its h1 then visually hidden on phones), or the compact title as the h1 when no `PageHeader` is mounted. Nothing on a page without a title (the Overview) | The compact title as the h1 when no `PageHeader` is mounted, else nothing |
| Right | The **account control**: the acting account's mark, opening the account sheet (§4.4.1). Signed out: "Sign in". No `+`: you create from the Workspace. | Same (a page that still publishes a record menu gets it first; deprecated) |

The title is `text-section` (Inter 600, 1rem), centred, truncated to fit between the side slots. On a top-level page it is the page's title, moved up from its `PageHeader`; on other pages a `PageHeader` carries its own title (and a record page its own menu, beside the title), so the bar drops its title and keeps the back chevron. The bar is a `<header>`, not a `<nav>`. The account control sits at the right end on every page, so it is never beside the back chevron. The full-bleed profile banner starts below the bar.

### 4.3 Floating pill (< 800px)

`bottom-nav.tsx`. Shows in every phone browser, installed app or not; hidden on `/welcome`, `/embed`, and on create and edit forms (`isFormRoute`: `/create`, `/project/new`, `/groups/create`, `/groups/import`, `/settings/edit-profile`, any `…/edit`, `…/edit-profile` and `…/update/new`), which pin their own action bar to the bottom (`bottom-nav-visibility.ts`). A small pill floating `--bottom-pill-gap` (12px) above the safe area, horizontally centred: `--bottom-pill-height` (56px), opaque `--bg-floating`, 1px `--border-subtle`, `--radius-pill`, `--shadow-md`. `--bottom-nav-height` is its whole footprint (`calc(--bottom-pill-height + --bottom-pill-gap)`), zeroed on desktop and whenever it is absent, so the content padding, toasts, the records selection bar, the form action bar and `scroll-padding-bottom` clear it. Behind it a fixed fade from `--bg-canvas` (`.bottom-nav-fade`) keeps text that scrolls under it from fighting its labels.

Items: **Workspace** (`FolderOpen`; current on `/home` and `/records`; always the icon, never an avatar: who you act as is the top bar's account control) and **Network** (`Globe`; current on any of its pages) each open a **menu just above the pill** (`<Popover side="top">`, `.pill-menu`: the screen's width less the 16px gutters; touch-sized 44px rows, the current page checked; the page and the top bar fade behind them under `--scrim` (`pill-menu-scrim.tsx`), the pill staying bright): the Workspace's six sections, and Feed, Explore, Graph, Map and Funding. Then **Apps** (`LayoutGrid`, a link). Signed out: Network (without Feed) and Apps. Settings, Help, feedback and the legal links are in the account sheet (§4.4.1); signed out, Help and the legal links are in the site footer. Each item is a 22px icon over a one-word label, at least 68×44px. The label is Inter `--text-label` (0.6875rem) / 500 / leading 1, mixed case with no tracking. Current: `--fg-primary` on a `--bg-selected` pill and a heavier icon stroke (1.5 → 2.5); `aria-current="page"`. Inactive: `--fg-muted`. Press: `scale(0.97)`. Re-tapping Apps on its own page scrolls to the top. While auth resolves the pill keeps its place with no items.

### 4.4 Desktop sidebar (≥ 800px)

`app-sidebar.tsx`, mounted in the root layout before `<main>`. The app's one banner: fixed on the left, full height, `--sidebar-width` wide, `--bg-canvas` with a 1px `--border-default` right edge, `--z-rail`. Top to bottom: the brand, the account slot (48px whatever fills it: a placeholder while sign-in is checked, the account control, or Sign in), **search** (`GlobalSearch`: activities, projects and accounts across the network; `/` or Cmd/Ctrl+K reaches it), the main navigation (scrolls on its own when tall), and Help and Settings under a `--border-subtle` hairline (Expand too on the collapsed rail) (Help and Settings filled once sign-in is known; anchored at the bottom, so nothing above moves). Until sign-in is known it shows no rows, so nothing is inserted later.

- **From 1300px, the full sidebar (248px):** the faded Certified.app wordmark; the account control (the acting mark, the account's name and a second line, "@handle" for you or "Group · Owner" for a group, and a `ChevronsUpDown`; its menu opens below); the search field (its results open 400px wide, over the page); then labelled groups (`text-label`, uppercase, muted): **Workspace** (the six sections: Overview, Projects and activities, Endorsements, Followers, Lists, Groups; the current one from the path and `?kind=`, read in its own `<Suspense>` so the sidebar never waits on search params), **Network** (Feed signed in, Explore, Graph, Map, Funding) and **Ecosystem** (Apps: other apps that work with the same account; a heading of its own so the three groups read alike; the rail and the pill have no headings, so it is just Apps there). Rows: 20px icon + `text-ui` label, 32px, 4px apart, `--radius` (so the whole sidebar fits a 1440x789 laptop window; on shorter windows the list scrolls under a bottom fade); current `--bg-selected` + `--fg-primary` + a heavier stroke + a 600 label, `aria-current="page"`; hover `--overlay-weak` (hover devices only). One left edge: the wordmark, the account avatar and the row icons all start 22px in. Signed out, the account slot is a primary **Sign in** button.
- **800–1299px, the rail (88px):** the brandmark; the account control as the mark alone (its name in a right-side `<Tooltip>` on hover, suppressed while its menu is open; the menu opens to the right); **Search** (opens the search field in a menu to the right; `/` and Cmd/Ctrl+K open it); then **Workspace** and **Network** (buttons that open a menu of their sections or pages to the right, as the pill's open above it; `aria-current="true"` on one of their pages) and **Apps**, each an icon over a one-word label as in the pill (56px tall); Help and Settings likewise. The Workspace's sections stay in the page's own side list at these widths (`WorkspaceFrame`); from 1300px the page hides it (`records.css`), since the sidebar lists them. Signed out, the slot is a rail item, `LogIn` over "Sign in".
- **Collapse** (from 1300px): an icon button at the right end of the brand row (`PanelLeftClose`, "Collapse sidebar") folds the full sidebar into the rail; the collapsed rail's last item, **Expand** (`PanelLeftOpen`, labelled), unfolds it. Never styled as current. The rail, not hiding: the account control stays in view, so who you act as never disappears. Remembered in this browser (`lib/layout/sidebar-state.ts`: `data-sidebar="rail"` on `<html>`, set before first paint by `SIDEBAR_INIT_SCRIPT`; CSS scopes the full sidebar's rules to `:root:not([data-sidebar="rail"])`); Below 1300px the sidebar is always the rail and the toggle is hidden.
- The rail and full lists both render; CSS shows one. Menus opened from the chrome sit at `--z-chrome-menu`; on the rail they open 12px to the right (`<Popover side="right">`).

#### 4.4.1 Account control

`account-switcher.tsx`: `DesktopAccountSwitcher` (the sidebar) and `PhoneAccountSwitcher` (the phone top bar), one menu, `AccountMenuContent`, in two presentations: a `<Popover>` menu (`role="menu"`, 336px; focus lands on the first item, arrow keys rove, Tab or Esc closes it and returns focus to the trigger) on desktop, and a `<BottomSheet>` titled "Account" with a close button on phones. The trigger's name: "Riverbank Trust, group, signed in as Maya Lind, account menu" (or "Maya Lind, @maya, account menu").

1. **Act as** (only with something to switch to: in at least one group and not itself a group): you first (your name, "You · @handle"), then each group (name, "Owner · @handle": the role first, so the handle is what truncates), sorted accepted → owner/admin/member → name, with a check on the current one (`menuitemradio` + `aria-checked` in the menu, `aria-current` in the sheet); every row with a **settings gear** after it (`<Button size="icon-sm">`, its own menu item, so the row still only switches): yours to `/settings` ("Your settings"), a group's to `/groups/{did}/settings`. A gear acts as that account as it opens its settings. **Settings always belong to the account you act as**: the sidebar's Settings opens that account's, switching on a settings page opens the new account's (keeping the section); the account control says whose they are, so the Settings title carries no account name. Then **New group**. Picking one switches who you act as **in place**: you stay on the page (the Feed and Explore switch to that account's network), unless the page only works for your personal account (the Records sections and the group pages), which opens the Overview; a polite toast says "Now acting as …". On a create or edit form the rows stay but are inert ("Finish or cancel this form to switch."), so a draft is never lost. With nothing to switch, this block is your identity instead: avatar, name in `font-headline text-h4`, @handle, and a "Group account" tag when the signed-in account is itself a group.
2. **Signed in as** your name (the label uppercase, the name as written): **View profile** (your own), **Settings** only when there is no "Act as" (and so no gear; `/settings`), **Sign in with another account** (`openSignInAnotherAccount`: the sign-in bounce with `prompt: "login"`; it replaces the current session, and says so under the label) and **Sign out**, behind a `<ConfirmDialog>` ("Sign out of Certified?") that returns focus to the trigger.

3. **Phones only** (the sheet, as there is no sidebar): **Help**, **Send feedback**, then the legal links (Terms, Privacy, Imprint). On desktop Help is at the bottom of the sidebar, **Send feedback** is in the menu before Sign out, and the legal links are in the site footer.

Records' "Switch to personal account" and the Groups list switch through `useSwitchActor()`.

### 4.5 Breakpoints

Three, everywhere: tokens `--bp-gt-mobile`, `--bp-gt-narrow-desktop`, `--bp-gt-desktop` (informational; `@media` can't read `var()`, so CSS hard-codes the numbers). Tailwind `screens` is replaced (not extended): `md` 800, `lg` 1100, `xl` 1300, so a stray `md:` can never resolve to 768.

| Range | What changes |
|---|---|
| < 800px | Phone top bar + floating pill, bottom sheets instead of dropdowns, 16px input text (iOS zoom rule), dialog actions stack |
| ≥ 800px | The sidebar as an 88px rail beside the page; column narrows to 600px; dropdowns and centered dialogs replace sheets; tab panels slide |
| ≥ 1100px | Side lists (SideNav) become columns; profile Overview about-block and project detail go two-column |
| ≥ 1300px | The full 248px sidebar unless collapsed; grid wrapper reaches its max width; endorsement grids go to three columns |

Write mobile first: base styles, then `@media (min-width: 800px)`. "Below desktop" is `max-width: 799px`. Never 768 / 760 / 640.

### 4.6 Container widths

| Context | Width | Notes |
|---|---|---|
| Reading column, mobile | 720px max | `.app-shell__content` |
| Reading column, desktop | 600px | Pages not yet in a `<PageContainer>` (fallback). Narrower on purpose; the column is editorial, not stretched |
| **Top-level pages** | `<PageContainer width="default">`, 1120px | **One width** for the destinations (the Workspace, the Network's four tabs, Apps), Settings and Help, so the left edge doesn't jump between them. Multi-column pages (the Workspace's side list, Feed's three columns, Settings' section nav) fit inside it. |
| Forms | `<PageContainer>` | New activity and New group share `width="default"` (1120): New activity has its 296px details column beside the main column; New group's single column is capped at New activity's main column (`calc(var(--page-width-default) - 296px - 32px)`, 792px), so the header, left edge and action bar match. New project and the edit forms keep `narrow` (720) for now. An empty image slot shows one affordance, the "Add image" pill. |
| Profile | `default`, 1120px | The banner sits inside the container (`var(--radius)`, cover, 128px on phones, 192px from 800px). The Overview is a reading column plus, from 1100px, a 320px rail of fact cards; 800–1099px the rail's cards sit side by side under the content; on phones they follow it. |
| Record pages (project, activity) | `default`, 1120px | From 1100px two columns: header, tabs and content (`minmax(0, 1fr)`) and a 320px rail of FactCards, 48px apart, the rail from the top, sticky (`--chrome-top` + 24px) only when it fits the window. Below 1100px one column in source order: on Overview the funding card under the header (for an activity without gifts of its own, its Project card), the other cards after the content; other tabs show none. Without a tab strip the content keeps the strip's spacing (24px, 32px from 800px). |
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
| Record page picture (project and activity) | 2:1, at most 360px tall; a banner wider than that frame shrinks it to its own shape (up to 4:1) | `FitImage` | `--radius` | none: no frame without a picture. A project's is its banner, else its first activity's photo (`useProjectPicture`, the same rule on every project card). At the top of the main column |
| Work card photo (`WorkCard`) | 16:9 (beside the text in a wide card) | `FitImage` | the card's | `--bg-sunken` + the type icon from 800px in a grid; none on phones or in a wide card |
| Update photos | 16:9, a 3-up grid (Overview: the first three, the last "+N") | cover | `--radius` | `--bg-sunken` |
| Profile banner | free (128px phones / 192px from 800px) | cover | `--radius` | `--bg-sunken` |
| Avatar | 1:1 | cover | 50% | `--color-surface-container-high` + initials |
| Partner / app logo | 1:1 | contain, 4px inside a 44px plate | `--radius` | the plate: `--bg-sunken`; a black one-colour mark (`monochromeLogo`) inverts in dark mode |

`FitImage` (`ui/fit-image.tsx`) decides once the picture has loaded: a photo covers its frame; a picture wider than about 2:1 (a banner, a wordmark) or a logo (transparent or flat-coloured edges, read from a small canvas copy) is shown whole, 8px inside the frame's `--bg-sunken`, so its words are never cut.

Every image has `loading="lazy"` and an `onError` fallback: feed images hide their wrapper, avatars show initials, banners show the fill.

### 4.10 Z-index

Every layer is a `--z-*` token in `tokens.css`. Lowest to highest: `--z-local-raise`, `--z-rail-sticky`, `--z-popover`, `--z-navbar` / `--z-bottom-nav-fade`, `--z-pill-scrim` (dims the page and the top bar behind a pill menu), `--z-bottom-nav` (the pill, above its scrim), `--z-chrome-menu` (the account and pill menus: above the bars), `--z-portal-sheet`, `--z-modal`, `--z-skip-nav`, `--z-feedback`, `--z-feedback-above`, `--z-tour-backdrop`, `--z-tour-card`, `--z-tooltip`. A genuinely new layer gets a new token, placed in this order.

---

## 5. Depth and elevation

Depth is carried by surface lightness and hairlines, not shadows.

| Level | Surface | Edge | Shadow | Use |
|---|---|---|---|---|
| Sunken | `--bg-sunken` | none | none | Tracks, wells |
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
| Hover | bg `--overlay-weak`, text → `--fg-primary` | bg `--btn-primary-bg-hover` | border → `--border-hover`, plus the `--overlay-weak` tint on a clickable card |
| Active (press) | `.press-scale`: `scale(0.97)`, `--duration-instant` (the one press scale, also the tab bar's) | same | same |
| Selected / pressed toggle | bg `--overlay-medium` + `--fg-primary` + weight 600 | n/a | border `--fg-primary` |
| Focus-visible | §6.2 | same | same |
| Disabled | `opacity: var(--opacity-disabled)`, `cursor: not-allowed`, no hover | `--overlay-weak` wash + `--fg-muted` text + `--border-subtle`, at 70% opacity | opacity + `--bg-sunken` fill |
| Loading | Keep the fill; a spinner replaces the leading icon; `aria-busy` | same | same |

- **One hover for what you click as a whole.** A list row, a linked stat, a card or a tile takes the `--overlay-weak` tint (`.hover-tint`, layered over its own background with `background-image`, so a white card stays white underneath); a bordered one also darkens its border to `--border-hover`. Rows with no side padding add `.hover-tint--bleed`, which lets the tint reach 8px past the text so nothing moves (a `width: 100%` row grows by the bleed too); `StatRow` pads its linked stats the same way. Never an underline on a whole-block link. **Text links** in running text (a name in a byline sentence, "All activities ›", a link in prose) underline instead.
- **Row actions.** A row's primary action is a small secondary text button (Hide / Show, Revoke, Follow, Switch) in a fixed-width slot (`min-width: 5.5rem` from 800px, right-aligned), so dates line up and toggling never moves them. Everything else goes in the "…" menu (`RowMenu`), including actions that also have a shortcut. Icon-only shortcuts (Edit) and select boxes show on hover or focus with a mouse (`.records-reveal`, opacity only, kept in the Tab order) and always on touch; select boxes show on every row while anything is selected.
- **Account rows.** Full-page lists of accounts (Followers, Following, Endorsements Received and Given, Groups) use the people row: 40px avatar (square for groups), name `body`, meta `ui`. Lists inside a section (Home's Your groups) use the compact row (32px, 14px, 12px).
- **Tab-line controls.** A tab's own controls (sort, New list) sit at the end of the tab strip's line (`PaneTabBar`), not on a row of their own; below 800px they drop under the strip. With nothing yet, the rich empty state carries the create action instead.
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
- Safe-area insets: the floating pill and bottom sheets respect `env(safe-area-inset-bottom)`.
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
| 20 | chrome | 1.5, **2 current** | Sidebar rows and rail items, phone top bar (`+`) |
| 22 | phone pill | 1.5, **2.5 current** | The pill's items (current: a heavier stroke on a `--bg-selected` pill) |
| 24 | phone chrome | 1.5 | The phone back chevron |
| 40 | empty state | 1.25 | `EmptyState` rich (hard-coded in the primitive) |

- Smaller icons get heavier strokes so the rendered weight stays constant. Snap 11 / 13 / 15px to the nearest step.
- Icons inherit `currentColor`. Never `fill`.
- **Create actions:** a single create action (the account menu's "New group", the Overview's "New group", "New list") leads with `Plus`. In the New menu, where every item creates, each item shows its type icon instead: activity, project, and `Building2` for a group (the group icon everywhere).
- Decorative icons get `aria-hidden`. Icon-only controls get an `aria-label` (and a tooltip comes free on `<Button size="icon">`).

---

## 9. Components

`src/components/ui/` is the catalog. `AGENTS.md` §12 lists the full API surface; this section covers the visual contract. BEM classes such as `.app-card`, `.dash-card` and `.feed-card` are legacy: migrate toward the primitive when you touch them.

### 9.1 Button

`<Button variant size loading pressed tooltip href>`.

| Variant | Rest | Hover | Use |
|---|---|---|---|
| `primary` | `--btn-primary-bg` / `--btn-primary-fg` | `--btn-primary-bg-hover` | Main action, form submit. **At most one in a page's content.** |
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
- **Label:** `text-ui` (0.8125rem) / 500 / 0 tracking / `--fg-secondary`, sentence case, 6px above the control. Labels carry no icons.
- **Date fields:** `<Input type="date">` stays the native date input (picker, keyboard, `YYYY-MM-DD` value) in the Input frame, with a 16px lucide `Calendar` in the trailing slot. Where the WebKit picker indicator exists it is the transparent click target under the icon; Firefox keeps its own button and the lucide icon is hidden. An empty field shows the format hint in `--fg-muted`.
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

- `<Avatar size="2xs|xs|sm|md|lg|xl|2xl" shape="circle|square">` (16 / 20 / 32 / 48 / 64 / 96 / 240; `2xs` is the acting mark's corner badge, with one initial). A circle for people; `shape="square"` (the 2px `--radius`) for groups, so an organisation never reads as a person (the account control and menu use it). Fallback: `--color-surface-container-high` with initials from `getInitials()` (`xs` at `text-micro`). An image avatar is the neutral fill, without letters, for its first 300ms (`INITIALS_DELAY_MS`); if the picture is still missing then, the initials join the fill and drop when it arrives. No picture, or a failed one, shows the initials at once. `data-fallback` is set exactly while initials show, never on the blank fill. Sizes include `row` (40px), the people-row avatar. The initials are `aria-hidden` (the name is always written beside the avatar); with an `alt` the avatar is an `img` named by it.
- `<IdentityRow did handle displayName avatarUrl href size loading showHandle>` is the one avatar + name byline. **Lists show names, not handles** (donors, followers, endorsers, contributors, supported accounts). The name resolves `displayName` → a handle a person chose → "Unnamed account" (`--fg-muted`, weight 400; `[data-unnamed]` elsewhere), never a DID and never a machine handle (`isMachineHandle`: the six random characters the PDS gives at sign-up, "1ane6o.certified.one"). `showHandle` adds `@handle` under a name where accounts must be told apart (a group's members, an account picker, the Workspace's endorsements); machine handles never show. `deriveIdentity` / `accountName` (`lib/utils/identity.ts`) hold the rule for other rows. The profile's Account card keeps the handle.

### 9.6 Tabs, SegmentedControl, Pagination

- `<Tabs>` / `<TabList>` / `<Tab>` / `<TabPanel>`: ARIA tablist with arrow keys. Active tab: `--fg-primary`, weight 600, underline indicator. Wrap panels in `<TabPanelTransition>` for the desktop slide. `<Tab count>` renders the count as a **muted tabular number** after the label (weight 400, `--fg-muted`; read as "Funding 3"). Counts are never badges: the red `Badge variant="count"` is for notifications only. Use the prop rather than a hand-made span.
- Section tabs belong to the page, under its header, at every width (the profile's and record pages' strips); the chrome never carries them.
- `<TabList>` (underline) is a block-level strip: its hairline spans the content width, not just the tabs.
- Public pages (profiles, projects, activities) show only the tabs a visitor would find something on, once that is known (never while loading or after a failure), plus the open one so a shared `?tab=` link works; no page draws a strip of one tab (a lone Overview), and the content then keeps the strip's spacing, not a gap. A strip that scrolls fades (`TabStripFades`, 40px of the canvas colour) on an edge with more tabs past it. Inside a tab, a visitor sees no segment known to be empty ("Given 0", "Following 0"; one list left means no segments), and a panel heading that only repeats its tab is for screen readers (`<SectionHeader titleHidden>`; its description and action still show). The Endorsements tab counts received plus given.
- `<SegmentedControl>` and `<Tabs variant="segmented">`: active segment on `--bg-elevated` with `--shadow-sm` on the `--bg-sunken` track; in dark mode `--bg-selected` (a step lighter), so it reads as on; 44px tall below 800px.
- `<Pagination>`: Previous / "Page X of Y" / Next with `tabular-nums` and `aria-live="polite"`; returns `null` for one page. It is the explicit pager; `<LoadMoreSentinel>` is the infinite-scroll alternative. Pick one per surface.

### 9.7 Popover, Tooltip

- `<Popover>` + `<PopoverTrigger>` / `<PopoverContent>` / `<PopoverItem>` for menus: `role="menu"`, click-outside, Esc, focus restore. Floating level (§5). A menu that also has a phone presentation renders the same content in a `<BottomSheet>` below 800px (the New and account menus, §4.4.1). `side` is `top` / `bottom` or, beside the trigger, `left` / `right` (the rail's menus; `align` is then the vertical edge); each flips when there's no room.
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
- **Account control:** the acting mark; a sheet on phones, a popover menu on desktop (§4.4.1); reflects the acting identity (`useOrg().activeOrg`).
- **Likes (`comments/like-button.tsx`, `app.certified.feed.like`):** on activities, projects and updates. In a card's bar a ghost `sm` Like (heart outline; filled in the text colour and "Liked" when the acting account likes it, `aria-pressed`, the name staying "Like") before Comment, with the count joining the summary at the right ("12 likes · 3 comments"). On a project or activity page a secondary `sm` button before Share: the heart and the count ("Like" while there is none). Liked as the account you act as (the account control), on every page, the feed included ("Like as <group>" in the tooltip); pressing again takes it back; both show at once and a failed write is put back with a short error beside the button. Signed out it opens sign-in. Counts come from the indexer; until it counts likes the buttons work without numbers. Whether you liked something is read from your own repository.
- **Comments (`comments/comment-thread.tsx`):** on activities, projects and updates. The thread reads like a social feed: the latest comments, oldest of them on top, each an avatar (32px) and a `--bg-raised` bubble (name `text-ui` 600, text `body-sm` with its line breaks and its web addresses as links (`ui/linked-text.tsx`: http(s) and www only, new tab, `nofollow ugc`, shown without the scheme and cut at 48 characters), `ClampedText` at six lines, "See more") with the relative time and, for its author or a member of the group that wrote it, Delete (asks first) under it; "View N earlier comments" above them reveals ten more at a time. Two layouts. **Card** (feed cards for activities, projects and updates; each update on the Updates tab, under a hairline): a ghost `sm` Comment button (speech bubble) with the count at the right ("3 comments", `text-caption` muted), the latest two, and the field, which Comment opens and closes (the draft is kept); Escape closes an empty one. **Section** (the end of a project's or activity's Overview): a "Comments N" `SectionHeader`, the latest ten, the field always open; a visitor gets "Sign in to comment" instead. The field: the author's avatar, one bordered box holding the text (grows to ten lines) and its footer ("Commenting as <group>" when acting as a group, a count from 900 of 1,000 characters, Post, also ⌘/Ctrl+Enter). A comment comes from the account you act as, like every other action: the avatar beside the field shows it (the group's square mark when acting as a group) and there is no picker of its own; to comment as another account, switch in the account control. A comment by someone the viewer follows shows in the feed as "commented on <record>" (or "commented on an update") with its text as a quote (a 2px `--border-hover` rule), never as an update. Lists and portfolios get no thread.
- **Feed with evaluator filter:** tapping the active "For you" tab opens an inline filter panel; a non-default filter renames the tab "Custom" and the unfiltered state shows a caution banner.
- **Profile header:** the banner inside the container; the avatar (96px, 64px on phones; square for organizations) beside the serif name and one meta line ("Nonprofit · Hamilton, New Zealand · Founded 2003" / "she/her · Joined May 2026"); the lead (the bio, else the organization's description) in `ClampedText`, four lines, three on phones; the website as text, social accounts as `<Button size="icon-sm">` labelled "{handle} on {Service}"; the trust line (endorsers, followers; a visitor never sees zeros or "No endorsements yet"; one line on phones). Actions top right: Follow, `ShareLinkButton`, More (`<Button size="icon" variant="secondary">`, horizontal dots: Add to list, Copy Permanent ID, Open on Bluesky, Group settings); on phones a full-width row. The other tabs on a phone: no banner, lead, links or trust line (`compact`). Handle and Permanent ID live in the Overview's Account `FactCard`. Until the organization marker answers, the avatar and meta line are neutral placeholders, never a person first. The Overview: activities and projects as `WorkCard`s (an activity its same-titled project holds is left out: the project card stands for both), "Supports" (the accounts it endorsed: twelve, avatar and name, three a row, "All N" to the Given list; only when it endorsed someone), endorsements received with their notes; the rail: Funding (the record card, summed over the account's newest ten projects with their activities, "Across N projects"), Location, Account.
- **Record pages (project, activity):** `RecordHeader` (picture; eyebrow "Project" / "Activity · Part of <project>", the project part hidden when it repeats the title; serif h2 title; the actions in the profile's order and place, the owner's Edit, Share, More, at the top right of the eyebrow-and-title block, a full-width row on phones; byline: account (square avatar for organizations), period ("31 May – 31 Dec 2026", "Since …"), place; lead at measure, a summary stored cut short read whole from the description (`leadText`)). On phones the other tabs show the header without its picture and lead. Overview: the description in place (`ClampedText`, 12 lines, less a first paragraph or heading repeating the lead), a project's activities as `WorkCard`s (an activity with the project's own title shows what it adds instead: its work scope, contributors, own dates, "Open the activity"; a card leaves out the project's summary), the latest update as a teaser. An activity without a description shows its Details in the main column, so the Overview is never empty. Rail cards (the facts the header doesn't say): Funding (total in USD, gifts and funders, Confirmed by, "All gifts"; "1 unconfirmed gift" when nothing is confirmed; hidden when there is none; not on the Funding tab); for a project "Who's behind it" (only with the account's own words: its bio, else its description's start, three lines; no handle), Location, Details (published); for an activity Project (the project's name and "Funding, updates and the full story", or, when the project has the activity's own title, "A project of the same name gathers its funding, updates and full story." and "Open the project"; its funding total when it adds to the activity's own; on phones it leads when the activity has no gifts of its own), Contributors (avatar row, "+N", first names; not on the Contributors tab), Location, Details (work scope as sentence-case tags, rights, published). A project's funding is its receipts plus its activities'. Coordinates show rounded to two decimals with hemispheres, never raw or "Unnamed location". The Contributors tab is the list (no board). The Funding tab leads with the total and a sentence saying what "Confirmed by" shows (a labelled button), 25 receipts a page, amounts read like the total ("$50"), no "Confirmed by" column when every gift has the same confirmer, a two-line row per gift on phones; with nothing confirmed it lists the gifts marked "Unconfirmed". Updates are dated, newest first, at measure, in full; a teaser's title wraps to two lines and its text skips a sentence repeating it, photos in a 3-up 16:9 grid.

### 9.13 Page layout: PageContainer, PageHeader, SectionHeader, SideNav, StatRow

One page pattern for every top-level page (November 2026 redesign). Build a page from these before writing page-level CSS.

| Primitive | Use it for | Contract |
|---|---|---|
| `<PageContainer width as>` | The outer frame of every top-level page. `default` (1120) for the destinations, Settings and Help (one width, §4.6); `narrow` (720) for single-column forms; `wide` (1280) for the profile. | Centred, max width plus gutters (§4.6). Top space: 8px on phones (24px below the navbar in all), 32px from 800px; bottom 32px / 64px. Lifts the shell's 600px desktop column via `.page-container`. |
| `<PageHeader title description actions back visual titleAside titleId>` | The first thing in the container, once per page. | Optional back link (chevron + parent name, `text-ui` muted) above; optional `visual` (avatar or icon) beside the title; title as the `<h1>` in `font-headline text-h2`, balanced; optional `titleAside`, a small control on the title's line right after it (Feed and Explore's "Seen as"), wrapping under it when the line is too narrow and kept out of the `<h1>`; one line of description in `body-sm` `--fg-secondary`, capped at the measure; actions on the right with at most one `primary`, wrapping under the title below 800px. 16px below the block. Registers with the chrome (§3.6). |
| `<SectionHeader title description action as id titleHidden>` | The heading of a section inside a page. | Title in `text-section`, `<h2>` by default (`as="h3"` when nested); optional muted description; `action` on the right, level with the title's first line (its slot is pulled up by half the difference between a 32px control and the title's line, so a `SeeAllLink` or small button is centred on it; a taller action only grows downward). No outer margin: the section puts its content 12px below (`gap-3`). Pass `id` and point the section's `aria-labelledby` at it. `titleHidden`: a tab panel whose tab already names it keeps the title for screen readers only. |
| `<SeeAllLink href label>` | The one "See all" link, usually a `SectionHeader` action. | `text-ui` 500 `--fg-secondary` + 14px chevron-right; 32px tall with a 44px hit area. Name the destination ("All apps") when "See all" is unclear. |
| `<SideNav aria-label items sticky>` | In-page section navigation where a page still needs one. Not for a destination's pages (the navigation lists them) nor a page's own sections (tabs under its title: Settings, Endorsements, a profile); Help needs none. A vertical list beside the sidebar reads as a second menu. | Below 1100px a row of 44px pills (current = `--bg-selected` pill with a `--border-hover` edge, `--fg-primary`, weight 600 — like the top bar, never a black fill): up to six items **wrap** onto more lines, so no section is hidden off-screen; a longer list scrolls sideways (4px row padding so focus rings aren't clipped, no visible scrollbar) and scrolls the current item into view on mount and on change (the row's own `scrollLeft`, never `scrollIntoView`). From 1100px a vertical list of 40px rows (current = `--bg-selected` + `--fg-primary` + 600), sticky 32px below `--chrome-top` unless `sticky={false}`. Items: `label`, optional 16px `icon`, optional right-aligned muted tabular `count`, `href` (link, `aria-current="page"`) or `onClick` (button, `aria-current="true"`). One frame for every "side list + content" page: the page header full width, then the side list and the content, whose first heading sits level with the first nav label (`SIDE_NAV_CONTENT_OFFSET` on the content from 1100px). The Workspace builds it with `WorkspaceShell` (page container, current section) and `WorkspaceFrame({ titleId, offset })`; every state (loading, signed out, acting as a group, each section) renders the frame. The Workspace draws no page title: the current side-list item names the page, so the frame's h1 is the section's name for screen readers only (`sr-only`, registered like a `PageHeader` so the chrome adds none), and each section's actions sit in its tab row (Groups, without tabs, has a first row with its count and New group). The Overview's h1 is the account name heading its ID box (avatar, name, the bio's first line, website). Content that opens with a tab strip or a row of controls passes `offset={false}`: their labels already sit on the first nav label's line. |
| `<StatRow items aria-label>` | A quiet row of counts (Home's records, endorsements, followers; the Graph sidebar's network totals), in place of boxed count tiles. | Each stat is its value (Inter 600 at the h4 size, tabular) over a `text-ui` muted label; stats separated by 32px, wrapping on phones. Linked stats take the shared hover tint, padded so the numbers don't move (hover devices only). `loading` shows a skeleton, never "0"; a loaded `null` shows an en dash. |

**Explore list rows** (`ExploreListRow`): one geometry for activities, projects and accounts. A 40px lead (a thumbnail, or `Avatar size="row"` for an account); the title (`body-sm` 600) over a one-line meta; an author column with the avatar and name only (an account shows its own @handle there), 280px from 1100px and 180px at 800–1099px; a date column using the relative rule (an account's joined date, with "Joined" in its tooltip). Hairlines between rows end at the content edges (a pseudo-element inset by the row's side padding); the hover fill is the full row. Explore's lists (Whole network, Accounts I follow, Endorsed accounts, Recently viewed) are a "Show" `Select` with a visible label, last in the toolbar after Filters, on its own line below 800px.

---

### 9.14 FactCard, ClampedText, ShareLinkButton, WorkCard, Location card

Shared by the public pages (profiles, projects, activities), so they read as one product.

- `<FactCard title action>` + `<FactList facts>` (`ui/fact-card.tsx`): the facts beside a page's main column (place, period, money, the people behind it). A bordered `--bg-elevated` card, no shadow, a small `text-ui` 600 title and an optional action on its right, then label/value rows (label `text-caption` muted above a `text-body-sm` value). On phones it sits in the reading order, full width. A rail card says only what the header doesn't.
- `<ClampedText lines>` (`ui/clamped-text.tsx`): long text in place, cut by height to a few lines with a fade (a mask, so any backdrop shows through) and a left-aligned underlined "Read more" / "Show less" under it, shown only when the text is longer than the cut. Use it for descriptions instead of a "Read full description" button.
- `<ShareLinkButton path what>` (`ui/share-link-button.tsx`): Share for every visitor, a secondary `sm` button that copies the page's absolute link and says "Link copied" in place.
- `<WorkCard>` + `<WorkCardList>` (`ui/work-card.tsx`; `ActivityWorkCard` / `ProjectWorkCard` in `feed/work-cards.tsx`): one card for a piece of work on the profile and the record pages. The 16:9 photo (`FitImage`), the serif title (`text-h4`, two lines; `text-h3` in a wide card), a meta line ("31 May – 31 Dec 2026 · Hamilton, New Zealand", "3 activities"), the summary (three lines). Bordered `--bg-elevated`, no shadow; the edge darkens and the title underlines on hover; the whole card is one link. The layout rule: one item is a wide card (the photo beside the text, 42%, from 800px), two or more a 2-up grid (no 3-up: the main column is 752px). The profile's Activities and Projects tabs keep compact rows for long lists (search, sort), with the same picture rule and summary.
- The Location card (`LocationFactCard` / `RecordLocationCard`, `feed/cert-locations-map.tsx`): one treatment in the rail of all three pages. A 200px map, the "Larger map" button and dialog, the places named under it unless the header already names the same place. Points zoom to the town; a region shown alone is fitted with its surroundings (a one-word region, like a country, at country zoom), and a small one gets a pin at its middle. Region edges are white over the satellite tiles.

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
| A profile or record that can't be loaded | "Couldn't load this profile" (or record) with Try again; "not found" only when the resolver says the name is unknown, or the PDS answers 400 RecordNotFound / 404, and then with no retry. A DID is named as itself, never "@did:…". When every profile Overview section fails, one inline block replaces them. |
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

- The landing bar (`LandingTopBar`) shows the faded Certified.app wordmark like the app's top bars (`<Wordmark variant="certified-app" faded height={18}>`, no Beta pill) in `--color-navy`, and one control: Sign in / Open app (`.lp-topbar__btn`, Inter 500, 0.75rem, 34px; 44px below 800px). No theme switch: the theme lives in Settings.
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

**Feed card:** "`<Card variant="row">`: no fill, hairline `--border-subtle` below, 20px vertical padding (24 on desktop). `<IdentityRow size="sm">` byline. Optional 1:1 image at `var(--radius)`, the full width of the text column. Title serif at `text-h4` (all widths, 600), `--fg-primary`, `text-wrap: pretty`. Description `body-sm` `--fg-secondary`, three-line clamp, `text-wrap: pretty`. Meta row `text-ui` `--fg-muted` with dot separators, `tabular-nums` timestamps, compact badges."

**Primary button:** "`<Button variant="primary">`: `--btn-primary-bg` / `--btn-primary-fg`, `body-sm` 500, 0 tracking, `var(--radius)`, about 40px on desktop and 44px minimum below 800px. Hover `--btn-primary-bg-hover` (hover devices only). Press `scale(0.97)`. Disabled: a faint `--overlay-weak` wash, muted text, a `--border-subtle` hairline, at 70% opacity, `cursor: not-allowed` (a solid grey block read as a live secondary button). `loading` shows a spinner and sets `aria-busy`."

**Settings card:** "`<Card variant="elevated">`, 24px padding. Eyebrow above in `text-label` `--fg-muted`. Fields with sentence-case `text-ui` 500 labels in `--fg-secondary`, 16px between fields."

**Confirm dialog:** "`<ConfirmDialog>`: serif `text-h4` title naming the action, one sentence of consequence in `body-sm` `--fg-secondary`, `secondary` Cancel and a primary (or destructive) button that repeats the verb. Actions stack below 800px."

**Phone pill:** "A floating pill `--bottom-pill-gap` above the safe area, `--bottom-pill-height`, opaque `--bg-floating`, `--border-subtle`, `--radius-pill`, `--shadow-md`. Three items (Workspace and Network open a menu above it; Apps), each a 22px icon over a short 0.6875rem / 500 mixed-case label, at least 68×44px. Current: `--fg-primary` on a `--bg-selected` pill and a heavier stroke (2.5). Inactive: `--fg-muted`. Press `scale(0.97)`."

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
| Chrome | `--navbar-bg`, `--navbar-border`, `--sheet-bg`, `--navbar-height`, `--chrome-top`, `--sidebar-width`, `--bottom-pill-height`, `--bottom-pill-gap`, `--bottom-nav-height`, `--top-bar-row1`, `--top-bar-total` |
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

- **2026-11-16, Likes.** Activities, projects and updates can be liked, with the lexicon's `app.certified.feed.like` (a strong reference to the record; social feedback only, not an endorsement). Like sits before Comment on feed cards and under updates, with the count in the bar's summary, and before Share on project and activity pages with its count. Likes are written to your repository or, as a group, through `/api/groups/[groupDid]/like`, and signed like the app's other records. Counts are batched from the indexer (`LikesForSubjects`, `LikeCount`); the production indexer doesn't count likes yet (it needs a lexicon version with `app.certified.feed.like` and a `subject` filter), so until then the buttons work without numbers. Your own likes are read from your repository, so Liked is right either way.
- **2026-11-18, Groups see their own endorsements and follows in the Workspace.** Acting as a group, Workspace > Endorsements shows the group's Received (with its hidden ones), Given and Endorsement lists, and Followers shows who follows the group and whom it follows, with counts; the Overview's figures link there. Owners and admins can endorse someone, revoke, hide or show a received endorsement, and follow or unfollow, all as the group; members see the same lists read-only, under one line ("Only <Group>'s owners and admins can change its endorsements." / "... whom it follows."). Endorsement lists are read-only for groups for now ("Endorsement lists can't be made as a group yet."). Switching to a group on these sections stays there. Lists and Projects and activities keep their explanation and links to the group's profile.
- **2026-11-18, Comments come from the account you act as.** The comment field's own author picker (the avatar with a ▾ that switched between you and your groups) is gone: comments come from the account in the account control, as likes, follows and endorsements do; the avatar beside the field shows it. `AccountPicker` had no other users and is removed.
- **2026-11-18, Activity summary follows the lexicon; tighter phone footer; Next.js 16.4.6.** The activity's short description follows `org.hypercerts.claim.activity` exactly: required, up to 300 graphemes, no minimum (the app's 100-character floor is gone, on create and on edit; an empty summary shows "Add a short description." after a save attempt; the counter reads "N/300"). The title keeps its 5-character product floor. The phone footer's links are 32px rows (were 44px) with 12px between its parts, and its feedback link reads "Feedback". Next.js and eslint-config-next 16.4.6 (two moderate advisories in 16.2.0-16.4.4).
- **2026-11-18, Review round 4: final check.** Two reviewers looked for regressions after round 3: none in the journeys; fixed what they found. A field in error now shows focus: `--shadow-ring-error` is a second red pixel plus a soft halo, drawn with `shadow-[shadow:var(...)]` (Tailwind 3.4 compiles `shadow-[var(...)]` to a shadow colour, so eight token shadows had never drawn: toasts, the drawer, segmented tabs, the theme toggle, the style picker, the avatar upload button and the error focus ring; all fixed). Profile edit's Cancel asks before discarding; the end-date error waits until the field is left and is linked to it; tabbing through an empty field doesn't arm its error; the endorse dialog keeps a typed reason or picked accounts on a backdrop click; the profile editor's Bio, Website and Founded and the project forms' Description and Location say "(optional)". Phone action rows (profile, record) keep icons at full size (`[&_svg]:shrink-0` on Button), size buttons from their content with 12px side padding, and keep More at 44px, so Follow, Endorse, Share and More fit one row down to 360px; a profile's hidden "(opens in new tab)" no longer widens the page; Graph's totals wait for the shown graph's stats (no larger raw-network numbers first); IdentityRow's loading skeleton is one line per row; a bottom sheet's title is at most two lines.
- **2026-11-18, Review round 3: whole-app journeys, forms, consistency.** **Forms (§9.2):** one validation rule everywhere (/create, activity and project edit, /project/new, update forms, /groups/create, /groups/import): errors show on blur or submit, then update live; counters stay grey until then (over the limit they turn red at once); Save is disabled only while saving, and a click lists the problems ("Before publishing: ...") and focuses the first. A field in error has a solid `--color-error` border that stays red on focus (`--shadow-ring-error`); `--color-error-border` is for tints only, never a field edge. A caller's `aria-invalid` draws the error chrome and its `aria-describedby` is merged with the field's own ids. Optional fields say "(optional)" in their label; counters announce only near the limit. No autofocus on page forms. Every edit form is guarded (activity, project, update, own profile): in-app navigation, the phone bar's back and browser back/forward ask in one `<ConfirmDialog>` ("Discard your changes?", Keep editing / Discard changes); closing the tab keeps the browser's prompt; note dialogs don't close on a backdrop click once text is typed. Edit pages say "not found" only for a deleted record, else "Couldn't load this ..." with Try again. Below 800px "Publishing as ..." sits above the form's buttons; at 800-1099px the create/edit form is one column. The own-profile edit bar uses `<Button size="sm">` and "Save changes". **Shell:** `main` is at least a screen tall (the footer never fills the first screen while a page loads); top-level phone bar titles come from the route until the page header mounts (no wordmark-to-title swap); "by <owner>" lines keep their height while loading; dialog and sheet Close are 44px on phones, underline tabs at least 44px wide with an inset focus ring, link tabs without `aria-controls`; the phone account sheet opens tall (`BottomSheet tall`); one "Now acting as" toast at a time (toast `id`); search clears its highlight when the query changes or the list closes, and the sidebar field empties after handing off to Explore; the rail's search popover is one surface; on /welcome and legal pages the footer follows the landing top bar's edges. **Records and profiles:** record and profile "More actions" are bottom sheets below 800px (`MoreActionsMenu`), Delete last with a red icon; Unfollow is a one-tap toggle everywhere (the row stays, a second tap undoes it; red stays for delete and revoke); record pages put the side column after the content in the DOM, and at 800-1099px the facts cards sit two to a row. **Overview and Network:** the empty Overview offers "Find accounts" beside New activity / New project, and a "Following" figure; the Lists figure counts all four list kinds; Graph's first load matches Map and Funding and holds the controls column; 24px between a tab strip and its content on Explore, Map and Funding; Funding's ledger stacks day over time at 800-1099; "All receipts ›". **Wording:** errors through `caughtErrorMessage`; "Permanent ID" in detail dialogs; "groups" not "organizations" in navigation copy; "organization" spelling; straight quotes; one empty-search line, `Nothing matches "x".`; "Save changes".
- **2026-11-18, Review round 2.** A second review pass checked round 1 and found what was still wrong. **Shell:** while sign-in is checked the phone bar shows the mark and title (right side empty), the pill stays hidden, and the full sidebar's placeholder has the control's shape; the phone search panel closes with a text "Cancel" and Explore has no top-bar Search (its own field is there); the desktop search dropdown grows to the window (`100svh - 160px`), says when nothing matches, and names owners ("by <name>"); the space above the phone footer is counted once; a hydration mismatch is fixed (a server component must not import plain values from `"use client"` modules: the head scripts now come from `look-data.ts` and `sidebar-init-script.ts`). **Network:** Explore never renders "No ... yet" before loading; its phone tabs share one row; Back puts the tapped row back in place; Graph uses the compact pattern (stats line, Find, Filters) below 1100px and holds its layout while loading, with the phone account card under the graph; Graph, Map and Funding share one phone order (three figures, the Filters/view row, the visual); Funding's picked project opens in a sheet (a dialog from 800px) with the other projects as rows; Flow is stacked share bars on phones; Map opens on the data's latitude band on phones and says "Accounts' bases". **Workspace:** a dirty form asks before the top bar's back or the browser's back/forward leaves it; Enter in the contributor field takes the first suggestion, errors sit under the field; the create form's main column comes first in keyboard order; the Overview has New activity in Your records, keeps its three stats on one phone row and puts the ID box before Your groups; Lists' tabs show counts and open on the first with lists; acting as a group, explanations name the group; Groups says "Act as"; "Hide from profile" / "Show on profile"; new project and group forms have visible labels. **Profiles and records:** a failed owner lookup says "Couldn't load this activity/project" with Try again (never "not found"); a failed list keeps its segment, a lone list gets a visible heading, zero counts are hidden, and the Endorsements count is distinct endorsers; activities get "Who's behind it" (also without a bio) with a compact trust line; lists with no pictures drop the frames; record actions sit under the lead at every width; the phone trust line keeps its count ("Endorsed by X +2"); endorser avatars follow the account kind; one failure line per section; "Some details couldn't load." with Try again; an empty profile explains itself and shows whom it follows; follow and revoke failures are toasts; Share sends the handle link. **Settings and first visits:** Edit on email or password first says where the code goes ([Send code] [Cancel]); every Settings and group-settings error reads as a sentence (`src/lib/utils/user-error.ts`); Group account offers "Create a new group" as the alternative; group "Danger zone" is "Group status" without type-to-confirm; Help leads with two donor questions; the walk-through skips the Settings step while acting as a group; the sign-in dialog's label is a field label, the handle view has its own title, and it keeps its top edge; the signed-out contact form needs an email; tab labels reserve their bold width; the landing fits 375x553, its phone Sign in sits in a bar once you scroll, and its desktop wordmark and Sign in align with the content column.
- **2026-11-18, Review round 1: navigation, Workspace, records, settings.** From a five-area UI/UX review (phone and desktop, light and dark). **Navigation:** full-sidebar rows are 32px (the sidebar fits a 1440x789 laptop window; shorter windows scroll the list under a bottom fade); Collapse is an icon at the end of the brand row, Expand the collapsed rail's last item; the current row's label is 600; the full sidebar's search field shows its shortcut (Cmd K / Ctrl K); Enter in search opens the row you arrowed to (otherwise it searches Explore; no row is pre-picked). Phones get **Search** in the top bar (top-level pages, before the account control) opening a full-width search panel (`phone-search.tsx`, on `<AppDialog>`); the title fits "Projects and activities" at 375px; Sign in sits on the 16px gutter; a pill item whose menu is open looks current. The desktop account menu has **Send feedback** before Sign out. **Workspace:** acting as a group, each section explains itself and links to the matching tab of the group's profile (switching to a group on a section stays there); below 1100px the Overview runs Your records, Endorsements and followers, Your groups, the ID card, Apps (also the DOM order); Apps on the Overview are compact rows plus "All apps"; the empty Projects and activities offers New activity (primary) and New project; after creating a group you act as it, with a toast; editing a record applies the summary minimum only once the summary changes; the contributor field checks on blur/Enter; the phone location dialog keeps its buttons in view; form back links name their destination ("Projects and activities", "Groups"); the Endorse panel says "accounts". **Profiles and records:** a failed account lookup shows "Couldn't load this account. Try again" (never "Unnamed account" or a person shape while the kind is unknown; retries honour Retry-After); record actions sit in a row under the lead below 1300px (always, with the owner's four); below 1100px comments come after the facts cards; your own profile shows the visitor's tabs; known-empty segments are hidden; profile tab panels are capped at 752px; signed-out visitors see Endorse (it opens sign-in); Share uses the phone's share sheet on touch devices; failed follow/unfollow/revoke show a short error; "Copy Permanent ID"; wide work-card titles get three lines; a funder's section is "Endorses N"; an empty profile says "No public records yet." **Settings and first visits:** the sign-in dialog has a title ("Sign in or create an account"), a line that a new email creates the account, and a Terms/Privacy line; upstream errors read as sentences; Appearance shows Theme first and the experimental styles behind a "Show styles" disclosure; turning into a group asks to confirm, and the reverse is "Turn back into a regular account" (no trash icon); the walk-through is nine steps; the theme defaults to the device's; the feedback dialog is sentence case and doesn't ask a signed-in account for its email; legal contents links are 44px rows on phones and /dsa has contents; the settings tab strip matches the section width; the landing hero offers "Explore the network" and its buttons sit in the first phone screen. **Network:** Explore covers activities, projects and accounts (its Funding tab and section are gone; receipts live on /funding, `?show=funding` redirects there); phone rows show thumbnail, a two-line title, "by <owner>", then period · scope (work scopes as words, never slugs); Back restores Explore's scroll; Map's and Funding's views are the underline tab strip under the title; on phones Graph, Map and Funding show one stats line and a **Filters** bottom sheet (`network-filters-sheet.tsx`) before the visual, with the side column from 1100px flowing with the page; tapping a Graph ranking on a phone scrolls to the graph with the card open; Graph's "View profile" stays in the tab; names: "Accounts" (not People), Graph's Show "Trusted endorsers | Everyone"; search groups Activities, Projects, Accounts (Certified accounts before Bluesky-only ones), then "Search Explore for ..."; Map and Funding reserve their final layout while loading; failed Funding images fall back to the avatar mark; a failed Like is a toast; the feed has one column below 1100px, two from 1100px and the News column from 1300px only when it has posts; acting as a group, the feed says "accounts this group follows".
- **2026-11-17, Structure: pages in the navigation, a page's sections as tabs.** One rule for where things are: a destination's pages are listed by the navigation (the sidebar, the rail's menus, the pill's menus); a page's own sections are an underline tab strip under its title (Settings, Endorsements, Followers, Lists, profiles, record pages). **Settings** drops its side list (a second menu next to the sidebar on desktop, three rows of wrapped pills on phones) for that tab strip: the title, the tabs (sideways-scrolling on phones, with a fade where more are), then the open section at a 48rem reading width with its one-line description; the section name stays as a visually hidden h2. Group settings share it. **Help** drops its contents list: one reading column at every width. **The Overview** gets its title like every Workspace page ("Overview", in the phone bar on phones); the account name heading the ID box is an h2. Smaller fixes: the handle's edit pencil stays inside its field on touch screens (it lost its position with the Tooltip's wrapper); the account avatar shows its plain fill, not "?", until the name loads; a Workspace list right under its tab strip draws no second hairline; group settings say "You're the owner."
- **2026-11-17, Navigation spacing; the phone footer.** Sidebar rows sit 4px apart everywhere (the full list was 2px, the bottom block 4px), and the first group's heading sits 16px under the search field, as the groups sit 16px apart; on the rail, Search sits 4px above Workspace like the other items (was 12px). Phone top bar: the avatar's edge on the 16px gutter like the brandmark (the bar's right padding is 10px). A top-level page whose title moved into the bar starts 24px under it (an otherwise empty `PageHeader` takes no room on phones; the description loses its 4px top margin). The pill's menus open 8px above the pill. The phone footer is one left-aligned column on the gutter: the wordmark, the links in two columns at `--text-ui` with 44px rows (Welcome, Help, Feedback, Docs; Terms, Privacy, Imprint, quieter), then the copyright; Docs carries an outward arrow at every width.
- **2026-11-17, Graph starts with endorsements and awards.** The Lines checkboxes start with only Endorsements and Awards on; Recognitions, Certifications and Participation start off.
- **2026-11-17, Phone top bar carries the page title.** On top-level pages (Feed, Map, the Workspace sections, Apps, Settings, Help) the page's title moves from its `PageHeader` into the phone top bar, beside the brandmark (which replaces the wordmark whenever a title shows). The header's h1 stays, visually hidden below 800px. The Overview has no title, so it keeps the wordmark.
- **2026-11-17, The Workspace is listed by the navigation, like the Network; pill menus dim the page.** The Workspace pages no longer list their sections (the side list and the pills are gone at every width): the full sidebar's Workspace group lists them, the rail's Workspace opens a menu of them to the right (like Network's), the pill's opens above it. Each section shows its name as the page title (`<PageHeader>`, as the Network's pages do; the Overview's h1 stays the account name). On phones the page and the top bar fade behind the pill's menus (`--scrim`, `--z-pill-scrim` between the bars and the pill); light `--scrim` is now 0.5 (was 0.4), for every overlay.
- **2026-11-17, Apps under "Ecosystem".** In the full sidebar Apps sits under its own heading, **Ecosystem**, like Workspace and Network, instead of alone after them. The rail and the phone pill are unchanged.
- **2026-11-17, Settings follow the account you act as; Workspace on phones.** Settings' "for ▾" picker is gone (the title carries no account name): the account control decides, and shows, whose settings you see. The sidebar's Settings opens the acting account's, switching on a settings page opens the new account's (keeping the section), and a gear in "Act as" acts as that account as it opens its settings. On phones the Workspace drops its row of section pills (the pill's Workspace menu lists the sections) and draws the section's name as the page title (`text-h2`); from 800px it stays screen-reader only. The pill's menus are the screen's width less the gutters. Collapse no longer looks selected while the sidebar is open.
- **2026-11-17, One account decides everything; no global New; search in the sidebar; collapsible sidebar.** "Seen as" is gone: Feed and Explore show the network of the account you act as (`useActingViewer`, `lib/groups/viewer.ts`), and switching keeps you on the page (only the personal-only Records sections and group pages fall back to the Overview). There is no global New (no desktop New, no phone `+`): you create from the Workspace, whose Projects and activities offers New activity and New project for a group too. The content strip is gone: search sits in the sidebar (the field from 1300px, a Search item on the rail; `/` and Cmd/Ctrl+K reach both), pages start at the top, and the fallback h1 moved into the sidebar. From 1300px **Collapse** folds the sidebar into the rail (remembered, `data-sidebar="rail"`, set before paint). On phones the pill is Workspace, Network, Apps: Workspace and Network open a menu of their pages just above it (`Popover side="top"`), and More is gone, its Help, feedback and legal links now in the account sheet. In "Act as" your own row has the settings gear like the groups'; Settings is a separate row only without groups. The own-profile bar drops "Back to Workspace".
- **2026-11-17, Sidebar on desktop, floating pill on phones; one account control.** The desktop top bar's destinations and the phone tab bar give way to one structure that folds (§4.1): a left **sidebar** (`app-sidebar.tsx`; an 88px labelled rail at 800–1299px, the full 248px sidebar from 1300px listing every Workspace section and Network page, Apps, then Help and Settings) with a slim **content strip** for search and New (`desktop-top-bar.tsx`), and on phones a floating **pill** (`bottom-nav.tsx`: Workspace, Network, Apps, More) under a top bar that keeps `+` and the account control. The Workspace menu and the account menu merge into the **account control** (`account-switcher.tsx`, §4.4.1): one mark for who you act as (a group's square avatar with yours on its corner, `ActingAvatar`), and one menu with "Act as" (you first, then your groups; "Now acting as …" toast; inert on forms) and "Signed in as" (profile, Settings, another sign-in, sign out). "My workspace" is gone as a label. The phone top bar stays put for anyone who can switch. Likes and comments start from the account you act as on the feed too; "Seen as" only changes what the feed shows. New: `lib/layout/chrome.ts` (which routes get the chrome), `lib/layout/nav-items.ts` (the section lists), `--sidebar-width`, `--bottom-pill-height`, `--bottom-pill-gap`, `--shadow-ring-canvas`, `Avatar size="2xs"`, `Popover side="left|right"` and `className`, `Tooltip side="right"` and `suppressed`. The Workspace's in-page side list hides from 1300px. `/dev/preview/shell` previews the chrome signed in.
- **2026-11-16, Comments on updates and on the record pages; links; who comments.** Updates take comments too: under each update card in the feed and each update on a record's Updates tab. A project's or activity's Overview ends with a Comments section (heading with the count, the latest ten, the field always open, "Sign in to comment" for visitors). Web addresses in comments are links, and are saved as Leaflet link facets so other clients link them too. Comment now opens and closes the field, keeping the draft. With groups, the avatar beside the field picks who the comment is from (you or a group, the shared `AccountPicker` with an avatar trigger); it starts on the feed's "Seen as" account in /feed and on the open workspace on the record pages. The thread moved to `components/comments/comment-thread.tsx`, its styles to `comments.css`.
- **2026-11-16, Comments on activities and projects in the feed.** Each activity and project card in /feed has a Comment button, its comment count, the latest two comments and "View earlier comments" for the rest, and a field to write one (§9.12). A comment is an `org.hypercerts.context.attachment` record with `contentType: "comment"` and the record in `subjects`, written to the commenter's repository (or the group's): the text as a Leaflet document in `description`, and on one line, cut to 256 bytes, in the required `title`, the same shape other clients already write. Threads are read from the indexer by subject (`subjectUri`), one request for all the cards on a page (`CommentsForSubjects`), a thread paging on its own when it has more (`CommentsForSubject`); a posted or deleted comment shows at once, ahead of the indexer. A followed account's comment reads "commented on <record>" in the feed instead of "posted an update".
- **2026-11-15, Map.** `/map` shows where the work happens, in three views (`?view=places|countries|sites`), each on a flat map or a globe (`?projection=globe`, as on /funding). The data comes from `/api/map/dataset` (`src/lib/map/build-dataset.ts`): every place the network can show, read from all six location formats in use (most keep their coordinates in an attached file the server downloads) and graded **exact point**, **drawn area**, **approximate** (generated 10 km circles, rounded coordinates) or **country only** (a country's name or code, whole degrees). Places are drawn as recorded: an exact point is a mark, a drawn area its outline once it is 12 px across, an approximate place a soft disc at its true radius (fainter as it grows), and a country-only place hatches its country instead of inventing a spot. Each layer has its own hue and shape (`--map-activity` dot, `--map-project` ring, `--map-org` square, `--map-unused` hollow circle; checked for colour-blind separation), and a project with its activities at one spot is one ringed dot. **Places** puts a list of what is in view beside the map (one row per spot, opening into the chain of project, activities and organization; layer chips in `?layers=`); **Countries** shades countries by activities, projects or organizations based there, with a ranked table; **Sites** shows the drawn outlines as a gallery. The canvas map is `world-map.tsx` (d3-geo and Natural Earth 1:110m outlines from world-atlas; satellite imagery fades in close up on the flat map) and reuses the /funding gestures, zoom buttons and drag-taller bar.
- **2026-11-15, Public pages polished: one family.** One `WorkCard` for activities and projects on the profile and the project page (16:9 photo, serif title, meta line, summary; one item wide, more a 2-up grid), and one picture rule for a project everywhere (its banner, else its first activity's photo). The same work shows once: an activity its same-titled project holds is left off the profile; a project's same-titled activity shows what it adds; the activity's rail has a Project card with the project's funding total instead of a "Part of" card repeating the title. Facts show once: rail cards say only what the header doesn't, "Who's behind it" only with the account's own words, no map caption repeating the byline. One Location card (200px, larger-map dialog) in the rail on all three pages; a region alone is framed with its surroundings. Money where a donor looks: a Funding card on the profile (across its projects), the Project card's total on an activity, "1 unconfirmed gift" listed and marked rather than an empty tab, gift amounts read like the total, no "Confirmed by" column that says one thing, two-line gift rows on phones. Lists show names, never machine handles ("Unnamed account" when there is none). The same header actions everywhere (Edit, Share, More with horizontal dots, top right; a row on phones), a compact header on phones for the other tabs, tab strips that fade where they scroll, no lone Overview tab, no empty segments for visitors, panel headings that repeat their tab for screen readers only, Endorsements counted received plus given. A funder's profile leads with "Supports". Logos and wide banners show whole (`FitImage`); one 2:1 record picture (at most 360px). An activity's Overview is never empty; the Contributors tab is the list. Work scope as sentence-case tags; summaries stored cut read whole; update teasers wrap their title and show photos in a 3-up grid.
- **2026-11-15, Public pages redesigned: profile, project, activity.** The three pages now read as one product: the page's picture on top, an eyebrow or meta line, the serif title, a short byline of who / when / where, the lead in place, Share for every visitor, tabs that hide when a visitor would find them empty, and from 1100px a 320px rail of `FactCard`s. **Profile:** the organization's own description and place finally show (long descriptions stored as `descriptionString` and locations whose coordinates sit in a blob are read; saving a profile no longer drops either), type labels instead of slugs, the website and social icons, the handle and Permanent ID in an Account card, activities as image cards, a map, inline errors instead of zeros, no person-first flash for organizations. **Records:** one layout for projects and activities; projects show their funding (their receipts plus their activities', with a Funding tab and card); the activity Funding tab leads with the total and a labelled "Confirmed by"; the description in place; a project's activities as image cards; updates dated and in full; contributors list before the board (no shadow); work scope as tags; rounded coordinates; not found told apart from couldn't load; `?tab=` kept through the handle redirect.
- **2026-11-15, Funding note beside the totals.** The note is now a short card at the right end of the totals row (under it below 1100px): "Note: most receipts so far come from one funding round, run by Ma Earth. As other programs run theirs with Certified, they'll show here too. Running a funding program? Get in touch" (the contact form). It is small enough to stay, so the Hide toggle and its remembered state are gone.
- **2026-11-15, Funding map: finer land up close.** Land on the flat map and the globe now comes from a 0.25° grid (Natural Earth 1:50m via world-atlas, rasterised by `scripts/funding/make-land-mask.mjs` into `land-mask-fine.ts`, about 11 KB gzipped, loaded once a map shows). Zooming in switches to a finer spacing (1.5°, 0.75°, 0.5°, then 0.25°) as soon as the dots would be about 4px apart on the map, 6px on the globe, so coastlines gain dots instead of the dots spreading out; New Zealand reads as its islands. Only the cells in view are drawn (`land-grid.ts`).
- **2026-11-15, Funding note folds.** The note under the Funding title starts "Note: most of this comes from one funding round." and folds to that line with Hide (open by default; this browser remembers it, `certified.funding.noteHidden`). Get in touch now follows the invitation's text instead of sitting at the box's far edge.
- **2026-11-15, Graph: every main badge type.** Lines now cover recognitions (`--graph-recognition`, blue), certifications (`--graph-certification`, violet) and participation (dashed grey) besides endorsements and awards, one checkbox each in Lines with its line as a swatch, one per row. All on by default but Participation: its badges mostly come from a couple of programs to many projects (about 600 more accounts), which would turn the graph into a few big stars. A participation badge on a project draws a line to the project's owner. The node numbers and rankings stay endorsement-only; the totals' "Awards" becomes "Other badges". System and grant-process badges, and follows and funding, are left out for now.
- **2026-11-15, Graph controls beside the graph.** The controls panel (find, Layout, Show, Lines and the key) no longer floats over the graph's top-left: from 1100px it heads the column to the graph's right, above the totals and rankings, and below 1100px it sits above the graph. Same panel, on `--bg-elevated` without a shadow. The graph component renders it into a slot in `visualization.tsx` (`controlsHost`); without one it still floats. The zoom buttons and the account card stay on the graph.
- **2026-11-15, Funding map and globe: zoom, move, drag taller.** Both sit in a frame with Zoom in, Zoom out and "Back to the whole world/globe" in the top-right corner (in a row under the map on phones), and a bar underneath that drags the drawing taller; a taller flat map is a closer one, so dragging down zooms in. Drag (or the arrow keys) to move the map, which wraps east and west with the seam in the Pacific so New Zealand, Fiji and Tonga sit together, or to turn the globe; zoom with a pinch, Ctrl or ⌘ and the scroll wheel, a double-click, or the plus and minus keys. A plain scroll wheel still scrolls the page. Closer in, land is a finer grid of small dots (the land grid is 1.5 degrees, too coarse to draw large), circles grow a little, and more projects get names where they fit. Gestures live in `use-pan-zoom.ts`, the buttons and the bar in `map-controls.tsx`, the flat map in `funding-flat-map.tsx`.
- **2026-11-15, Funding: smaller regions, where Flow ends, your own gift sizes, and a note on the data.** Regions are worked out in the browser from each project's point (`src/lib/funding/geo.ts`): thirteen, a little smaller than continents (the Americas as the US and Canada, Central America and the Caribbean, and South America; Africa as the Middle East and North Africa, West and Central, East and Southern; Oceania as Australia and New Zealand, and the Pacific Islands), plus six continents with North and South America apart. Flow's right side switches between Regions, Continents and Projects (`?to=`; the twelve largest projects, then "Other projects", then "No project"), and each label now sits beside its own bar however many there are. **Gift sizes** on Flow's bar opens an editor for where each size starts (up to seven sizes, `?sizes=10-50-250`); Receipts filters by the same sizes. The Map's region totals use the new regions, largest first. Under the page title, a note says most receipts so far come from Ma Earth's round and invites other funding programs to get in touch (the shared contact form).
- **2026-11-14, Workspace: no page titles.** The Workspace sections no longer draw a title and a line of description over the side list: the current item in the side list names the page, and every section now starts on the same line as the Overview. The h1 stays, for screen readers only. Endorse someone and Find accounts move into the tab row; Groups gets a first row with its count and New group (the empty state's own action when there are none). Of the descriptions, "one activity can sit in several projects" moves into the Projects and activities empty state; the rest only restated the page.
- **2026-11-14, Style tiles: name first.** Each tile in Settings → Appearance → Style reads top to bottom: the style's name and description, the preview, and for a made style its version row.
- **2026-11-14, Made styles: the page and the ID card's edge.** The prompt makes the page around the content its own step, decided every time: carry what the site puts behind its content into the backdrop (a wash or glow of its own colour is almost always open, with that colour as the evidence), none only for a plain white site. The ID card's hairline in made styles is a step stronger than the site's own borders (`--look-id-edge`); strong surfaces keep no line. Saved made-style CSS is rebuilt once a page is idle when it predates a template change, so fixes reach styles made earlier.
- **2026-11-14, Made style tiles, redesigned.** The bottom row holds only the version controls, on one line even on a 276px tile: a light version picker, delete this version (asked first; the last one removes the style), New version. "Made in this browser from <site>" moves under the description. One clipping frame fixes the bottom corners under styles with a larger radius. The result of making a style is a dialog of its own (Claude's notes, what the app took back, a pointer to New version), without the inline request field.
- **2026-11-14, Made styles keep every version.** The browser keeps each version of a made style (up to 12, with the request behind it; a site image is stored once per style), and the tile's bottom row, now beside the radio rather than inside it, has a version picker next to "Made in this browser", New version and Remove. The tiles lose a strip of background between the preview and its divider (the radio's own gap). Claude is told to give the page the site's own ground, white only for a white site.
- **2026-11-14, Made styles say what they did.** After a style or a new version is made: the success line, Claude's notes (up to five bullets on what it took from the website and where it shows), the app's word on anything it took back (unsupported moves left plain, a site image that wasn't there), and a field to ask for a new version in the person's own words. `generateLookSpec` returns `{ spec, caveats }`; progress and results show where the run was started (`Slot`).
- **2026-11-14, Made styles keep the site image's grain.** The capture kept only a 640px, heavily compressed copy of a whole site image, which the ID card blew up and cropped, so a texture such as Viva con Agua's painted blue lost its streaks and halftone dots. It now keeps the whole image small for Claude and, for the card, a crop at the site's own scale from the image's most detailed part, as WebP. On a strong ID card the avatar's fill follows the card's ink, so its initials read in dark mode too. Site captures run on staging (`SITE_CAPTURE_SNAPSHOT_ID`); the VM's deny list is IPv4 only, since the Sandbox API rejects a policy with an IPv6 CIDR (which had failed every capture), and the capture script still refuses private IPv6 addresses itself.
- **2026-11-14, Made styles are managed in the gallery.** The separate "Made in this browser" list under **Make a style from a website** is gone: each made style's tile says "Made in this browser" and carries **New version** and **Remove**, laid over the tile beside its radio. A new version's progress, its way back and its errors show under the gallery; the maker's form waits meanwhile. The gallery and the maker share one run and the key (`LookRunProvider`, `look-run.tsx`).
- **2026-11-13, styles: Neutral, live previews, polish.** The default style is **Neutral** (was Today). Picker tiles are a miniature Overview drawn in each style, centerpieces included: every centerpiece rule exists for the page (`:not([data-look-preview] *)`, so the active style never restyles another tile) and for its own preview. "Seen as" and "for" are a 28px chip (`AccountPicker`). Partner logos lose their outline. Glass menus are near-opaque. The Graph fits the window height. Every `backdrop-filter` puts the unprefixed property after `-webkit-backdrop-filter`: the production minifier keeps only the last of the pair, which had dropped the blur of the form action bars.
- **2026-11-13, Workspace (audit X9, X3, X8, X11, PA2-PA4, EN1-EN4, FO1, LI1, LI2, GR1).** The Workspace uses the Settings frame (header full width above the side list); account rows at the people size; one row-action pattern; tab-line controls; Lists empty states with their action; the whole-row hover tint in the Records panes.
- **2026-11-13, Made styles can use the site's own image.** The capture finds the large images a site lays behind its content (decorative images and CSS backgrounds in the first two screens), re-draws each as a small JPEG with its average colour and how busy it is, and shows them to Claude by id. A new ID card surface, `image`, draws the card on one of them (textures, patterns, line art; never photographs or pictures of people), under a veil of its own tone leaning to the brand, with the ink chosen for that tone. The pixels come from the capture (`withSiteImage`), never from Claude, and only a base64 JPEG, PNG or WebP data URL of at most 100,000 characters reaches the CSS (`cleanSiteImage`).
- **2026-11-13, Overview: the account heads the ID box.** The Overview has no page header: the avatar, the name (the page's h1, `font-headline text-h3`), the bio's first line and the website are the top part of the ID box, above a hairline and the ID. The frame's header is optional (`WorkspaceFrame`); the picker tiles' miniature Overview matches.
- **2026-11-13, Made styles start from an idea.** The prompt works as an art director would: the site's character in a sentence, one idea carried from it, one loud signature piece and everything else quiet, the brand colour used sparingly, and a list of clichés to avoid. Specs record `character`, `idea` and `signaturePiece`; the system prompt is cached.
- **2026-11-13, Made styles see the website.** Certified's server renders the site in headless Chromium inside a throwaway Vercel Sandbox VM and Claude gets its screenshots, logo, share image, the computed styles of its real elements and its visible colours, alongside the CSS digest (§2.11).
- **2026-11-13, Made styles invent nothing.** Every design move other than a plain one needs a quote from the website's digest (or the person's request) that the app finds there, else it falls back to plain; colours snap to the site's own palette.
- **2026-11-13, Styles made from a website, second version.** Claude now names the site's signature and carries it into a page backdrop and the three signature pieces (avatar, ID card, endorsement), chosen from fixed design moves (`MOVES`) the app turns into CSS; colours come as the site's anchors and are built for both modes in OKLCH, keeping hue when pushed for contrast; a made style can be made again with a request, and the previous version brought back.
- **2026-11-13, Home without "All" links.** The Overview's Records, Endorsements and Apps sections drop their "All records" / "All endorsements" / "All apps" links (the side list is the way to each whole list), and Apps shows every app.
- **2026-11-13, Endorsement rows match the records rows.** The endorsement row (Overview and profile) draws like the Overview's "Latest" records: 32px avatar, the endorser's name over the date in the same type (14px 500 / 12px muted), the note, if any, under them.
- **2026-11-13, One hover for blocks.** Rows, linked stats, cards and tiles take the same `--overlay-weak` tint on hover (`.hover-tint`, with an 8px bleed on rows), bordered ones also darken their border; their titles no longer underline. Text links keep the underline. Applied to the Overview, the profile, Feed, Explore, Lists and the graph; Records rows follow with the Workspace changes.
- **2026-11-13, Graph frame and controls (audit GP1, GP3).** On `/graph` the graph and its sidebar have no gutter of their own, so they line up with the page header. The graph's controls are one floating panel (`--bg-floating`, 300px) of labelled rows: find, Layout, Show, Lines (Endorsements, Awards, Mutual only), with the colour key as one line at its foot.
- **2026-11-13, Map and Funding placeholders (audit FM1).** The empty state sits in a tinted `--bg-sunken` panel the width of the content, so the page reads as intentional.
- **2026-11-13, Graph, forms, avatars (audit X10, GP4, GP5, X12, FR2-FR5, X13).** The Graph sidebar's totals are a `StatRow` and its rankings sit under `SectionHeader`s; it fades its bottom 48px while more is below (a `--mask-opaque` mask); Mutual only is a checkbox in the filters card. New group's fields are the `Input` primitive (44px, like New activity and Settings) and the form shares New activity's frame; field labels have no icons; date fields keep the native input with a lucide calendar; an empty image slot shows only the "Add image" pill. Avatars wait 300ms before showing initials for a loading picture.
- **2026-11-13, Record pages (audit AC1-AC4).** Record header actions (Edit, ⋯) sit at the page's right edge on every tab. On the activity Overview, Funding and Locations run the full width below the summary and details, with a hairline above. The full description lives on Overview behind "Read full description" (`RecordDescription`), never on its own tab; `?tab=description` opens Overview with it showing. Tab counts appear on every list tab and only there. In the byline, name over @handle uses 1.3 leading, and the Project field shows the title only.
- **2026-11-13, Landing bar, 404 copy, endorse dialog (audit LA1, LA2, NF1, DL1-DL3).** `/welcome`'s bar shows the faded Certified.app wordmark (as in the app bars), Sign in / Open app is set in Inter, and the bar's theme switch is removed (Settings only). An unknown top-level path is "Profile not found" only when it reads as an account (a dotted handle or a DID); anything else is "Page not found" with Go home; a handle in running text stays on one line (`whitespace-nowrap`; `EmptyState`'s `description` accepts markup). The endorse dialog's note and list fields are the `Textarea` / `Select` primitives (standard field focus), labelled "Why do you endorse them? (optional)" with no placeholder.
- **2026-11-13, Explore (audit X7, EX1, EX3-EX6).** The top bar keeps its search slot on Explore; the list side nav became a Show select, so results are full width; one row geometry for accounts; the author column shows names only and is wider; hairlines inset to the content edges.
- **2026-11-13, Overview, apps and profile (audit OV1-OV5, AP1-AP2, PR2-PR3).** Your groups rows open the group's profile (`profileUrl`), with no Switch button (Workspace → Groups keeps it). SectionHeader actions sit level with the title. The Overview's apps are one per row; app tiles top-align, arrow included; taglines are balanced; every partner logo sits on one 44px `--bg-sunken` plate (`monochromeLogo` marks invert in dark mode; `transparentLogo` removed). Latest-record thumbnails are 32px, the compact row. The profile Overview's endorsements use the Workspace Overview's row and show "All endorsements" whenever there is one.
- **2026-11-13, Settings (audit ST1-ST6, X9).** No second "Settings for" line. The handle has Edit beside its value like email and password (one value width); its options open as secondary buttons (no dashed buttons). Label column ~300px. Group account is a settings row. A disabled filled button is a faint wash with a hairline at 70% opacity. Settings and Help start their content level with the first side-list label (`SIDE_NAV_CONTENT_OFFSET`).
- **2026-11-13, Feed polish (audit FE1-FE4).** Feed images and titles take the full text column; card titles are the h4 step (18px, 600) at every width with `text-wrap: pretty`. From 1100px the columns are filters 240 | feed up to 576 | News 256; the filters column fades its bottom 48px while more is below (`useMoreBelow`, `data-more-below`, a mask so it fades into the canvas). News's "More" sits left-aligned on the posts' edge.
- **2026-11-13, Floating layers are always opaque.** New token `--bg-floating` (`--bg-elevated`, or a solid colour in a style with translucent cards) for menus, dropdowns, sheets, the drawer, toasts, the walkthrough card, sticky bars and the phone tab bar. In Glass these were see-through (the walkthrough card most of all); now only its cards and the blurred top bar are.
- **2026-11-13, Styles made from a website (experimental).** Settings → Appearance → **Make a style from a website**: a person's own Claude API key and a website address give a new style, made by Claude from the site's design digest, checked and compiled in the browser, kept there and applied (§2.11).
- **2026-11-13, Style centerpieces.** Every style redraws the same three places: the avatar, the Overview's ID card and an endorsement (`data-centerpiece` hooks on `<Avatar>`, the ID box and the endorsement rows; §2.11).
- **2026-11-13, Styles (experimental).** Settings → Appearance → **Style**: Neutral (the default) plus eight design directions (Almanac, Linen, Banknote, Wallet, Dot matrix, Glass, Shapes, Stamp), each a token set in `looks.css` on `html[data-look]`, light and dark (§2.11). The next/font variables move from `<body>` to `<html>` (`--font-inter-face`, `--font-noto-serif`, plus twelve non-preloaded faces), `--font-inter` / `--font-headline` are named in tokens.css, Tailwind's `rounded` reads `var(--radius)` and the heading weights read `--weight-headline(-strong)`. stylelint exempts `looks.css` from the colour and shadow rules, like tokens.css.
- **2026-11-13, Settings "for"; settings gears in the Workspace menu.** After the Settings title, **for [avatar] Me ▾** switches between your settings (`/settings`) and each group's (`/groups/{did}/settings`), on both pages. The Workspace menu drops its "Group settings" item; instead every workspace row has a settings gear. "Seen as" and "for" share one component, `AccountPicker` (`layout/account-picker.tsx`); `accountSettingsHref()` (`lib/groups/navigation.ts`) says where an account's settings live.
- **2026-11-13, "Seen as" apart from the workspace; Overview column from 1100px.** "Seen as" is its own setting (`useSeenAs`, `lib/groups/seen-as.ts`, per tab, default you): it alone decides what Feed and Explore show, and neither it nor the Workspace menu changes the other. Explore's "Accounts I follow" now follows it too (it used to stay on your personal follows). The Overview's ID and Your groups column is back on the right from 1100px (280px with a 32px gap; 300px and 48px from 1300px), not only from 1300px.
- **2026-11-13, "Seen as" on Feed and Explore.** Right after the Feed and Explore titles, **Seen as [avatar] Me ▾** shows which account the network is shown for and switches between you and your groups (`seen-as-switcher.tsx`; `<Popover>` menu on desktop, `<BottomSheet>` on phones). Same app-wide switch as the Workspace menu; hidden without groups. `<PageHeader>` gains `titleAside` for it.
- **2026-11-13, the account menu is always you; "My workspace".** The account button (desktop and phone) and the account menu show the signed-in person whichever workspace is open: no group avatar, no "as @you", View profile is your profile. Workspace calls yours **My workspace** (with `FolderOpen`, not your name and avatar, which the account button shows) and a group's by its name and square avatar, in a **fixed-width** pill sized to "My workspace" (128px at 800–1099px, 162px from 1100px). The phone tab shows `FolderOpen` in yours and the group's avatar in a group's. `/settings` is always yours (only a signed-in group account still gets its group settings there); a group's settings are **Group settings** in the Workspace menu, and the Overview's handle pencil in a group's workspace leads to `/groups/{did}/settings#account`.
- **2026-11-13, Workspace menu; Funding; endorsements in one place.** **Workspace** names the workspace you are in (avatar and name on desktop, the avatar on the phone tab) and opens a menu (desktop) or sheet (phones) to switch between your personal workspace and your groups' (`workspace-menu.tsx`, §4.4.2); picking one opens it. With one workspace it stays a plain link. The account menu loses Switch account and New group, and the acting-as bar is removed (`--acting-as-height` and `html.has-acting-as-bar` with it; the phone top bar now hides on scroll while acting as a group too). Network gains **Funding** (`/funding`, a placeholder like Map). The Overview shows endorsements received and given side by side in one section, "Endorsements and followers" (was "From others", with given under Your records). Lists: **Paste many** is a labelled button in an open list (was a bare icon). `<Wordmark>` paints past its box (`overflow: visible`): the "p" descenders end on the SVG's edge, and some zoom levels clipped a sliver off.
- **2026-11-13, Network pages without tabs.** Feed, Explore, Graph and Map drop the tab row (`NetworkNav` is removed, with `SideNav`'s horizontal orientation and per-item tour anchors). The Network menu is the way between them: the desktop button's `<Popover>` menu, and on phones the Network tab now opens the same list as a `<BottomSheet>`. The tour anchors Feed, Explore and Graph on the pages themselves (`feed`, `explore-category`, `graph`).
- **2026-11-13, Network menu; plain faded wordmark.** The desktop top bar's **Network** is a button that opens a menu of its four pages (Feed, Explore, Graph, Map; no Feed signed out), the current one checked; it shows as current on any Network page (`DesktopNetworkMenu`, a `<Popover>` menu like New). The pages keep their tab row; the phone tab bar's Network still goes straight to Feed (Explore signed out). Both top bars now show the faded Certified.app **without** the Beta pill (`<Wordmark variant="certified-app" faded>`), like the footer.
- **2026-11-13, Network: Feed, Explore, Graph, Map.** The navigation is **Workspace | Network · Apps** (three destinations; three tabs on phones). **Network** groups four views of everyone's work as a row of tabs at the top of each page (`NetworkNav`: `SideNav orientation="horizontal"`, words only on phones): Feed, Explore, **Graph** (new `/graph`: the endorsement network, `<Visualization embedded>` in the page container; `/endorsement-graph` redirects there, and Help's "Open the endorsement network" links there instead of opening a pop-up) and **Map** (new `/map`: a placeholder saying the map is coming). Network opens on Feed, or Explore when signed out. `SideNav` gains `orientation="horizontal"` and per-item `tour` anchors. The tour adds Network and Graph steps.
- **2026-11-13, Beta in the wordmark.** Both top bars show the faded Beta wordmark (`<Wordmark variant="certified-app" beta faded>`): the artwork's own thin pill over "app" (exactly as wide as "app", in the space above its x-height, "BETA" cut out; it adds no size), and ".app" at 50% opacity. The separate Beta tag beside the wordmark is gone. The footer shows the faded Certified.app without the pill.
- **2026-11-13, Certified.app wordmark in the chrome.** Both top bars and the site footer show **Certified.app** (`<Wordmark variant="certified-app">`: the wordmark plus ".app" in Switzer 450; `height` is the letter height, and the "p" descenders hang below the layout box). The footer's `<img>` and its dark-mode `filter: invert(1)` are gone; it uses `currentColor` like the top bars. `/welcome` kept the plain Certified wordmark until the landing-bar entry above.
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
