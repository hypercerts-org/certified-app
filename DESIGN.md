---
name: Certified
description: A passwordless AT Protocol identity, designed like a notary's ledger.
register: mixed (product-led; brand register on /welcome, /about, /terms, /privacy, /dsa)
theme: light-only

# `colors`, `typography`, `rounded`, `spacing`, and `components` below are the
# human-friendly swatch index (used by tools that render previews).
# `cssTokens`, `containers`, `breakpoints`, `shadows`, `transitions`, and `fonts`
# mirror the live CSS custom properties in src/app/globals.css and are the
# agent-readable index. The body of this file is the authoritative reference.

colors:
  ink: "#111111"
  paper: "#ffffff"
  slate: "#5e5e5e"
  bg-canvas: "#f9f9f9"
  bg-sunken: "#eeeeee"
  bg-raised: "#f3f3f3"
  bg-elevated: "#ffffff"
  fg-primary: "#111111"
  fg-secondary: "#4c4546"
  fg-muted: "#7e7576"
  ledger-rule: "#cfc4c5"
  light-divider: "#e2e2e2"
  annotation-green: "#94bb51"
  badge-success-bg: "#e8f5e9"
  badge-success-fg: "#1b7a3d"
  badge-warning-bg: "#fff3e0"
  badge-warning-fg: "#b37100"
  success-leaf: "#2ecc71"
  caution-amber: "#f5a623"
  error-vermilion: "#ba1a1a"

cssTokens:
  primitives:
    color-primary: "#111111"
    color-white: "#ffffff"
    color-accent: "#5e5e5e"
    color-off-white: "#f9f9f9"
    color-gray-100: "#eeeeee"
    color-light-gray: "#e2e2e2"
    color-mid-gray: "#7e7576"
    color-dark-gray: "#4c4546"
    color-outline-variant: "#cfc4c5"
  surfaces:
    bg-canvas: "#f9f9f9"
    bg-sunken: "#eeeeee"
    bg-raised: "#f3f3f3"
    bg-elevated: "#ffffff"
  foregrounds:
    fg-primary: "#111111"
    fg-secondary: "#4c4546"
    fg-muted: "#7e7576"
  borders:
    border-subtle: "rgba(0, 0, 0, 0.04)"
    border-light: "rgba(0, 0, 0, 0.06)"
    border-default: "rgba(0, 0, 0, 0.08)"
    border-medium: "rgba(0, 0, 0, 0.10)"
    border-hover-soft: "rgba(0, 0, 0, 0.12)"
    border-hover: "rgba(0, 0, 0, 0.15)"
    border-strong: "rgba(0, 0, 0, 0.20)"
  semantic:
    color-focus-green: "#94bb51"
    color-error: "#ba1a1a"
    color-success: "#2ecc71"
    color-success-text: "#047857"
    color-warning: "#f5a623"
    color-warning-text: "#7a6420"
    color-warning-bg: "#fef9e7"
    badge-success-bg: "#e8f5e9"
    badge-success-fg: "#1b7a3d"
    badge-warning-bg: "#fff3e0"
    badge-warning-fg: "#b37100"
  button:
    btn-primary-bg: "#111111"
    btn-primary-fg: "#ffffff"
    btn-primary-bg-hover: "#2a2a2a"

shadows:
  shadow-sm: "0 1px 2px rgba(0, 0, 0, 0.05)"
  shadow-md: "0 4px 12px rgba(0, 0, 0, 0.08)"
  shadow-lg: "0 12px 32px rgba(0, 0, 0, 0.12)"

transitions:
  transition-fast: "150ms ease-out"
  transition-base: "250ms ease-out"
  transition-slow: "400ms cubic-bezier(0.16, 1, 0.3, 1)"

fonts:
  font-headline: "Noto Serif, Georgia, serif"
  font-serif-alt: "Instrument Serif, Georgia, serif"
  font-inter: "Inter, system-ui, -apple-system, sans-serif"

containers:
  brand-max: "1536px"
  app-shell: "1024px"
  settings-stack: "720px"
  reading-band: "640px"
  modal-narrow: "480px"

breakpoints:
  mobile: "max-width: 768px"

navbar:
  navbar-height: "64px"

typography:
  display:
    fontFamily: "Noto Serif, Georgia, serif"
    fontSize: "clamp(5rem, 7vw + 1rem, 7rem)"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.02em"
  display-italic:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(5rem, 7vw + 1rem, 7rem)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Noto Serif, Georgia, serif"
    fontSize: "clamp(2rem, 3vw + 0.5rem, 3rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  card-title:
    fontFamily: "Noto Serif, Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.2em"
    fontFeature: "'tnum' 1, 'case' 1"
  nav-label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.15em"
    fontFeature: "'case' 1"

rounded:
  default: "2px"
  card-image: "4px"
  pill: "999px"
  circle: "50%"

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "96px"

components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.default}"
    padding: "10px 24px"
    height: "auto"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.fg-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.default}"
    padding: "10px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.default}"
    padding: "10px 24px"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.error-vermilion}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.default}"
    padding: "10px 24px"
  input-default:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.fg-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.default}"
    padding: "0 16px"
    height: "44px"
  input-signin:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.fg-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.default}"
    padding: "0 20px"
    height: "56px"
  card-app:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.default}"
    padding: "24px"
  card-dash:
    backgroundColor: "transparent"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.default}"
    padding: "20px 0"
  badge-verified:
    backgroundColor: "{colors.badge-success-bg}"
    textColor: "{colors.badge-success-fg}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  badge-pending:
    backgroundColor: "{colors.badge-warning-bg}"
    textColor: "{colors.badge-warning-fg}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.fg-muted}"
    typography: "{typography.nav-label}"
    padding: "4px 0"
---

# Design System: Certified

## 1. Overview

**Creative North Star: "The Notary's Ledger"**

Certified feels like a notary's ledger reimagined as a mobile app: austere, monochrome, and quietly authoritative. The near-absence of color forces attention onto the content. Serif headlines anchor each card like a document title, while the surrounding chrome recedes into warm grays. The interface is deliberately under-decorated. No gradients, no brand accent hue, no playful illustrations. The restraint is the brand.

The system is two-toned at the surface level: an off-white "paper" canvas and a near-black "ink", separated by a small library of warm-tinted neutrals that carry meta-text, dividers, and structural surfaces. Headlines are set in Noto Serif at heavy weight; signature accents lean on Instrument Serif italic, the closest thing the system has to a flourish. Body and UI labels are Inter, in restrained weights. Edges are nearly square (2px), borders are 1px and hairline, and shadows are absent except on overlay elements that genuinely need to detach from the page.

This system explicitly rejects the **crypto-wallet aesthetic** named in PRODUCT.md (neon accents, gradient meshes, glassmorphism), the **SaaS-cream auth-as-a-service** lane (cream and warm-orange, illustrated heroes), the **Bluesky / consumer-social** look (rounded cards, friendly blue, app-store hero), and the **generic foundation / NGO** look (navy-and-gold credibility palette, stock photography). Where competitors perform, Certified records.

### Two-Register Layout Doctrine

Certified is a mixed surface. The layout doctrine differs by register, and DESIGN.md treats both as canonical:

- **Brand register** (`/welcome`, `/about`, `/terms`, `/privacy`, `/dsa`): full-bleed hero, multi-column landing sections, the 4-column partner-network grid. Display Noto Serif and Instrument Serif italic accents speak at full volume. Container widths up to 1536px. This register's job is to make Certified feel like durable infrastructure on first contact.
- **Product register** (`/`, `/profile/[did]`, `/settings`, `/settings/edit-profile`, `/settings/wallet`, `/connected-apps`, `/groups`, `/groups/*`): a centered narrow column. The app shell caps content at ~1024px; settings stacks at ~720px. No desktop sidebar, no multi-column dashboard. The product register's job is quiet competence; settings, groups, and profiles are tools, not surfaces to perform on.

A page is in one register or the other; never mix. Brand-register treatments do not appear inside the gated app, and product-register chrome does not appear on the marketing surface.

### Light-Only

The current visual system is light-mode-only. There is no dark mode. The token system below is structured so that adding `[data-theme="dark"]` later requires only a value-flip, not a refactor; until then, DESIGN.md describes the light theme.

**Key Characteristics:**

- Two-tone monochrome: warm-tinted neutrals, ink-black ink, no brand accent hue.
- Serif-led typographic identity: Noto Serif for authority, Instrument Serif italic for the single accent voice, Inter for everything else.
- Near-square edges (2px default; 999px reserved for pills; 50% reserved for circles).
- Flat by default. A three-step shadow vocabulary, reserved for floating elements only.
- Two-layer token system: invariant primitives (`--color-primary`, `--color-white`) plus semantic tokens (`--bg-canvas`, `--fg-primary`, `--border-default`).
- Component library is canonical: `<Button>`, `<Badge>`, `<Avatar>`, `<Input>`, `<Textarea>` in `src/components/ui/` are the source of truth; BEM-style CSS classes in `globals.css` (`.signin-modal__submit`, `.hero__btn-primary`, `.feedback-modal__submit`) are legacy and should migrate to the components.
- Spring easing (`cubic-bezier(0.16, 1, 0.3, 1)`) for layout shifts; ease-out for micro-interactions.
- Restraint is the affordance. If a flourish exists only to impress, remove it.

## 2. Colors: The Civic Palette

A monochrome system named in civic vocabulary. There is no primary brand hue; the "primary" color is ink. Color appears in three places only: focus state, semantic status, and partner-app logos at hover. Everywhere else, the system is grayscale with warm-tinted neutrals.

The system has two layers: **invariant primitives** that never change between themes, and **semantic tokens** that describe a role. All component CSS should reference semantic tokens, never primitives or raw hex.

### Core Primitives

| Name | Token | Value | Role |
|---|---|---|---|
| Ink | `--color-primary` | `#111111` | Theme-invariant primary (skip-nav, focus outline) |
| Paper | `--color-white` | `#ffffff` | Theme-invariant pure white |
| Slate | `--color-accent` | `#5e5e5e` | Secondary text, muted interactive (legacy alias) |

### Surfaces (elevation ramp)

Background is the primary signal of elevation. Surfaces step in luminance, not in shadow.

| Name | Token | Value | Role |
|---|---|---|---|
| Canvas | `--bg-canvas` | `#f9f9f9` | Page background. The "paper" of the ledger. |
| Sunken | `--bg-sunken` | `#eeeeee` | Recessed areas (toggle tracks, partner-grid background) |
| Raised | `--bg-raised` | `#f3f3f3` | Slightly elevated inset surfaces inside cards |
| Elevated | `--bg-elevated` | `#ffffff` | Cards, modals, inputs (highest elevation) |

### Foregrounds

| Name | Token | Value | Role |
|---|---|---|---|
| Primary | `--fg-primary` | `#111111` | Headings, primary interactive text |
| Secondary | `--fg-secondary` | `#4c4546` | Body text default. Sits one step softer than ink so headlines stay dominant. |
| Muted | `--fg-muted` | `#7e7576` | Placeholders, navigation labels, timestamps, meta copy |

### Borders

Borders use transparent black overlays so they adapt naturally if a dark theme is ever added.

| Name | Token | Value | Use |
|---|---|---|---|
| Whisper | `--border-subtle` | `rgba(0, 0, 0, 0.04)` | Card separators, list dividers |
| Default | `--border-default` | `rgba(0, 0, 0, 0.08)` | Input borders, app-card borders |
| Medium | `--border-medium` | `rgba(0, 0, 0, 0.10)` | Emphasized dividers |
| Hover | `--border-hover` | `rgba(0, 0, 0, 0.15)` | Hover state on bordered elements |
| Strong | `--border-strong` | `rgba(0, 0, 0, 0.20)` | Final-emphasis edge (rare) |

### Tertiary (single deliberate accent)

| Name | Token | Value | Role |
|---|---|---|---|
| Annotation Green | `--color-focus-green` | `#94bb51` | Focus rings on form inputs and a small set of confirmation icons. The only chromatic color in the everyday interface. |

The annotation green is a margin-note green, the color of someone's pen approving a line in a ledger.

### Semantic

| Name | Token | Value | Role |
|---|---|---|---|
| Error | `--color-error` | `#ba1a1a` | Error text, validation copy, destructive-action confirmation |
| Success | `--color-success` | `#2ecc71` | Success dots, success badges (paired with text in `#047857`) |
| Warning | `--color-warning` | `#f5a623` | Warning icons (paired with text in `#7a6420` on `#fef9e7` tint) |
| Verified bg | `--badge-success-bg` | `#e8f5e9` | "High quality" / verified badge background |
| Verified fg | `--badge-success-fg` | `#1b7a3d` | Verified badge text |
| Pending bg | `--badge-warning-bg` | `#fff3e0` | Pending badge background |
| Pending fg | `--badge-warning-fg` | `#b37100` | Pending badge text |

### Primary Button Tokens

| Token | Value |
|---|---|
| `--btn-primary-bg` | `#111111` |
| `--btn-primary-fg` | `#ffffff` |
| `--btn-primary-bg-hover` | `#2a2a2a` |

When a future `[data-theme="dark"]` is added, only the values in this section flip. The structure of the system stays identical.

### Named Rules

**The No-Brand-Hue Rule.** Certified has no brand color. Do not introduce one. If a screen needs visual interest, it needs better typography or better information architecture, not a hue.

**The Warm-Neutral Rule.** Every gray is warm. Cool grays (chroma toward blue) are forbidden; they read as web2 SaaS. Pulling a neutral from outside this list requires changing the list, not the screen.

**The One-Voice-of-Color Rule.** Annotation Green is the only non-semantic color in the interface. It appears on focus rings and confirmation icons, nowhere else. If you find yourself wanting a second non-semantic color, the answer is restraint, not addition.

**The Semantic-Token Rule.** Component CSS must reference semantic tokens (`--bg-canvas`, `--fg-primary`, `--border-default`), never primitives (`--color-primary`, `#111111`). The semantic layer is the migration path; raw hex in component CSS is the migration target.

## 3. Typography

**Display Font:** Noto Serif (with Georgia, serif fallback)
**Display Accent:** Instrument Serif italic (with Georgia italic fallback)
**Body / UI Font:** Inter (with system-ui, -apple-system fallback)

All three are loaded via `next/font/google` with `display: swap` and exposed as CSS custom properties (`--font-headline`, `--font-serif-alt`, `--font-inter`).

**Character:** Noto Serif anchors the system with foundation-letter authority; it carries the weight of a notarized document. Instrument Serif italic is the single flourish in the system, used for short accent phrases inside hero titles ("yours, everywhere") and editorial callouts. Inter handles every other surface in three weights: 400 for body, 500 for navigation and labels, 600 for emphasized UI text. Inter never reaches 700; that weight is reserved for Noto Serif headlines.

### OpenType Features

Inter supports several features that should be enabled where appropriate:

| Feature | Code | Use |
|---|---|---|
| Tabular numerals | `tnum` | Stats, counts, timestamps. Anywhere numbers should align vertically. |
| Slashed zero | `zero` | DID strings, AT URIs, monospace-adjacent contexts |
| Case-sensitive forms | `case` | Uppercase labels. Adjusts punctuation and brackets for cap height. |

Apply via `font-feature-settings: 'tnum' 1, 'case' 1;` on the relevant elements. Treat `tnum` as a default for any numeric UI; treat `case` as a default for any uppercase label.

### Type Scale

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Display | Noto Serif | `clamp(5rem, 7vw + 1rem, 7rem)` | 700 | 0.9 | -0.02em | Hero title on `/welcome` only. One per page. |
| Display Italic | Instrument Serif | inherits Display size | 400 italic | 0.9 | -0.02em | Accent words inside the display title. |
| Headline | Noto Serif | `clamp(2rem, 3vw + 0.5rem, 3rem)` | 700 | 1.1 | -0.02em | Landing-section headlines, settings-page titles |
| Card title | Noto Serif | 1.375rem | 700 | 1.3 | -0.01em | App-card titles, dash-card titles. Single-line, ellipsis overflow. |
| Sign-in heading | Inter | 1.125rem | 700 | 1.3 | -0.01em | Modal heading (the one place a sans-serif heading is allowed) |
| Body | Inter | 1rem (16px) | 400 | 1.6 | normal | Default running copy. Color `--fg-secondary`. Cap at 65 to 75ch. |
| Body small | Inter | 0.875rem | 400 to 500 | 1.5 | normal | Helper text, descriptions, captions inside cards |
| Label | Inter | 0.6875rem (11px) | 500 to 600 | 1.4 | 0.08 to 0.20em | Eyebrows above headlines, card labels. Uppercase. Color `--fg-muted`. |
| Nav label | Inter | 0.75rem (12px) | 500 | 1.4 | 0.15em | Authenticated top-nav links. Uppercase. |
| Tiny | Inter | 0.625rem (10px) | 500 | 1.0 | 0.05em | Beta badge in navbar. Uppercase. |

### Named Rules

**The Serif-Authority Rule.** Headlines on landing surfaces and content pages are always Noto Serif. Sans-serif headlines exist in exactly one place (the sign-in modal heading), where the modal context calls for a tighter UI register. If a sans-serif "headline" feels needed elsewhere, it is a label or a title in disguise; set it accordingly.

**The One-Italic Rule.** Italic appears in exactly one place: as Instrument Serif accent words inside a serif headline. There is no italic body, no italic UI label, no italic emphasis. The italic is the brand's signature; spreading it weakens it.

**The 65-75ch Rule.** Body copy is capped at 65 to 75 characters per line. Edge-to-edge prose is forbidden; long lines are uncomfortable on an instrument that already asks for trust.

**The Weight-Ceiling-on-Inter Rule.** Inter caps at weight 600. Weight 700 is reserved exclusively for Noto Serif headlines. Bold sans-serif body or labels are forbidden; they pull eye weight from the serif and undermine the typographic hierarchy.

**The Uppercase-Plus-Tracking Rule.** Section labels, card labels, and navigation use `text-transform: uppercase` with letter-spacing in the 0.08 to 0.20em range. This creates hierarchy without size increase.

## 4. Layout Principles

Layout in Certified is **vertical and centered**. There is one canonical column per page, sized by register. There is no desktop sidebar in the product register; there is no multi-column dashboard. Information density comes from typographic hierarchy and tonal layering, not from spatial competition.

### Container Widths

The system uses five canonical widths. Pick the nearest before inventing a new one.

| Width | Conceptual name | Use |
|---|---|---|
| 1536px | `brand-max` | `/welcome`, `/about`, `/terms`, `/privacy`, `/dsa`. The navbar inner-shell, full-bleed hero, and 4-column landing sections. |
| 1024px | `app-shell` | Default cap inside the gated app (`/`, `/connected-apps`, `/groups/*`, `/profile/[did]`). |
| 720px | `settings-stack` | `/settings` and `/settings/*` form columns. Narrower than the app shell because forms read better narrow. |
| 640px | `reading-band` | Long-form copy on `/about` and `/terms`. The 65 to 75ch ceiling on body copy lands here. |
| 480px | `modal-narrow` | Standard modal max width. Sign-in modal, feedback modal, confirmation dialogs. |

If a screen needs a width not in this list, prefer the nearest canonical width over inventing a new one. New widths fragment rhythm.

### Spacing Scale

A 7-step scale, 4 to 96px. The same scale serves both registers; the brand register reaches the upper steps more often.

| Token | Value | Default use |
|---|---|---|
| `xs` | 4px | Inline gaps inside chips, icon-to-label gaps inside buttons |
| `sm` | 8px | Tight stacks (label above input), checkbox-to-text gaps |
| `md` | 16px | Default in-card gaps; mobile page padding |
| `lg` | 24px | Card internal padding; desktop section gaps inside a card |
| `xl` | 32px | Page padding on desktop; gap between top-level sections in a settings stack |
| `2xl` | 48px | Breathing space between major content blocks on landing pages |
| `3xl` | 96px | Hero-to-next-section gap on `/welcome`; brand-register section breathing |

**Rhythm.** Vary spacing across a page. A page that uses only `lg` between every block reads as monotonous; reach for `xl` or `2xl` between conceptually distinct sections, and `sm` or `md` inside a tight group.

### Grid Behavior

The system has two grids and no third. Both collapse at 768px.

- **4-column partner grid** (`/welcome`). 4 cells across at >=768px, 2 cells across below. 1px gaps in `--bg-sunken`. Each cell is identical width; the metaphor is the ledger's columns made literal.
- **2-column landing sections** (`/about`, mid-page blocks on `/welcome`). 2 columns at >=768px, stacks below.

Inside the product register: **single column, always**. No 2-column settings, no side-by-side cards. The card stack scrolls vertically.

### Page Padding

| Viewport | Padding |
|---|---|
| Desktop (>=768px) | `xl` (32px) horizontal |
| Mobile (<768px) | `md` (16px) horizontal |

Page padding applies at the page edges only; container widths take over inside.

### Named Rules

**The Centered-Column Rule.** Every product-register page is a centered column at every viewport. The app shell is `1024px` max; settings is `720px` max; both are horizontally centered. This is the strongest layout commitment in the system. If a screen wants a sidebar, the answer is to redesign the IA, not to add a sidebar.

**The No-Nested-Card Rule.** A card inside a card is forbidden. Use tonal layering (`--bg-canvas` to `--bg-elevated` for the outer card, then `--bg-raised` or `--bg-sunken` for an inset region inside it) or a 1px hairline divider. Two outlined cards stacked inside a third is a structural failure.

**The Five-Widths Rule.** The five canonical widths above are the system. Pick the nearest before inventing a new one. New widths fragment rhythm and undermine the register doctrine.

**The One-Hero-Per-Page Rule.** Display Noto Serif at the full clamp size appears at most once per page, and only on `/welcome`. Every other page leads with `Headline` (Noto Serif `clamp(2rem, 3vw + 0.5rem, 3rem)`), not `Display`.

## 5. Elevation

The system is **flat by default**. Surfaces are organized by warm-tinted tonal layering (`--bg-canvas` to `--bg-sunken` to `--bg-raised` to `--bg-elevated`) and 1px hairline borders. Cards do not float at rest. Buttons do not pop. Navigation does not drop a shadow.

There is a small shadow vocabulary, and it lives on **floating elements only**: dropdowns, modals, and the floating feedback trigger. Hover states change opacity, scale (very slightly: `scale(0.97)` on active, `scale(0.98)` via `.press-scale`), or border color, never elevation.

### Surface Ramp

| Level | Background | Use |
|---|---|---|
| Sunken | `--bg-sunken` (`#eeeeee`) | Toggle tracks, recessed panels, the partner-network grid background |
| Canvas | `--bg-canvas` (`#f9f9f9`) | Page background |
| Raised | `--bg-raised` (`#f3f3f3`) | Inset surfaces inside cards, code blocks |
| Elevated | `--bg-elevated` (`#ffffff`) | Cards, modals, inputs, navbar opaque background |
| Floating | `--bg-elevated` + `--shadow-md` | Dropdowns, the floating feedback trigger |
| Modal | `--bg-elevated` + `--shadow-lg` + backdrop | Sign-in modal, feedback modal, bottom sheets |

### Shadow Vocabulary

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Subtle lift on small floating elements |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.08)` | Dropdowns, the feedback trigger |
| `--shadow-lg` | `0 12px 32px rgba(0, 0, 0, 0.12)` | Modals, bottom sheets |

The navbar uses a 1px border-bottom plus `backdrop-filter: blur(12px)` instead of a shadow for its floating effect; the border keeps the chrome from feeling heavy.

### Overlays

| Token | Value | Use |
|---|---|---|
| `--overlay-weak` | `rgba(0, 0, 0, 0.04)` | Ghost button hover background |
| `--overlay-medium` | `rgba(0, 0, 0, 0.08)` | Focus ring glow |
| Backdrop | `rgba(0, 0, 0, 0.7)` | Modal and bottom-sheet backdrop |

### Named Rules

**The Flat-By-Default Rule.** Pages, sections, cards, navigation, and buttons are flat. Shadows do not signal hover, focus, or interactivity on these surfaces.

**The Floating-Only-Shadow Rule.** A `box-shadow` value is allowed only on elements that are physically detached from the page (modals, dropdowns, the floating feedback trigger, bottom sheets). If the element scrolls with the page, it is flat.

**The Hairline Rule.** Borders are 1px (or 1.5px on inputs to signal a write-here surface) and use the `--border-*` ramp. 2px or thicker accent borders, side stripes, and colored gutters are forbidden; they are the absolute ban from the impeccable design laws.

## 6. Components

The components in `src/components/ui/` are the source of truth. CSS classes in `globals.css` for sign-in, feedback, hero, and dashboard buttons (`.signin-modal__submit`, `.hero__btn-primary`, `.feedback-modal__submit`, `.landing-cta__btn`) are **legacy** and should migrate to the components over time.

### Buttons (`<Button>`)

`src/components/ui/button.tsx` defines four variants and three sizes. It is the canonical button system.

| Variant | Background | Text | Border | Hover | Use |
|---|---|---|---|---|---|
| **Primary** | `--btn-primary-bg` | `--btn-primary-fg` | none | opacity 0.9 | Main CTAs, form submits |
| **Secondary** | transparent | `--fg-primary` | 1px `rgba(0, 0, 0, 0.15)` | border to `rgba(0, 0, 0, 0.40)` | Cancel, secondary actions |
| **Ghost** | transparent | `--fg-muted` | none | bg `--overlay-weak`, text to `--fg-primary` | Toolbar actions, less emphasis |
| **Destructive** | `error / 0.10` | `--color-error` | 1px `error / 0.20` | bg `error / 0.15`, border `error / 0.35` | Delete, remove, leave-group actions |

| Size | Padding | Font Size |
|---|---|---|
| `sm` | 6px 16px | 0.75rem |
| `md` | 10px 24px | 0.875rem |
| `lg` | 12px 32px | 0.875rem |

All buttons: `border-radius: var(--radius)` (2px), Inter weight 500, `letter-spacing: 0.05em`, 150ms ease-out transition. Active state uses `transform: scale(0.97)`. Disabled drops to opacity 0.5 with `cursor: not-allowed`.

**State matrix.**

| State | Visual change |
|---|---|
| Default | Variant background and border as listed above |
| Hover | Variant-specific (opacity 0.9 primary; border deepen secondary; bg `--overlay-weak` ghost; bg + border deepen destructive) |
| Focus-visible | `outline: 2px solid var(--color-primary); outline-offset: 2px` (all variants) |
| Active | `transform: scale(0.97)` (disabled under `prefers-reduced-motion`) |
| Disabled | `opacity: 0.5; cursor: not-allowed`; `aria-disabled="true"` |
| Loading | Same as disabled, plus inline `<LoadingSpinner>` to the left of the label; original label stays visible |

The hero CTAs on `/welcome` are an exception today (`.hero__btn-primary` uses 4px radius and 18px 40px padding). Prefer `<Button variant="primary" size="lg">` in new code; treat the hero CSS as legacy.

### Inputs (`<Input>`, `<Textarea>`)

| Variant | Height | Padding | Border | Radius |
|---|---|---|---|---|
| App input (`<Input>`) | 44px | 0 16px | 1px `--border-default` | `var(--radius)` (2px) |
| Sign-in input (legacy CSS) | 48px | 0 16px | 1.5px `--color-light-gray` | `var(--radius)` (2px) |
| Textarea (`<Textarea>`) | auto | 12px 16px | 1px `--border-default` | `var(--radius)` (2px) |

All inputs use `--bg-elevated` background, `--fg-primary` text, Inter 1rem, placeholder in `--fg-muted`. The 1.5px sign-in border is intentional; it signals a write-here surface that's slightly thicker than page hairlines.

**State matrix.**

| State | Visual change |
|---|---|
| Default | Background `--bg-elevated`, border `--border-default`, text `--fg-primary`, placeholder `--fg-muted` |
| Hover | Border deepens to `--border-hover` |
| Focus-visible | Border shifts to `--color-focus-green`; 3px ring at `rgba(148, 187, 81, 0.15)` |
| Disabled | `opacity: 0.5`, `cursor: not-allowed`, no hover or focus paint |
| Error | Border `--color-error`; helper text below in `--color-error` Inter 0.8125rem; `aria-invalid="true"` |
| Read-only | Background `--bg-canvas`, no focus paint; cursor `text` for selection |

**iOS auto-zoom rule.** Any focusable `<input>` or `<textarea>` must have **font-size at least 16px on mobile** (`@media (max-width: 768px)`). Below 16px, iOS Safari auto-zooms on focus and overflows the viewport. Desktop can stay at 14 to 15px for visual density, but mobile must override to 16px.

### Cards

| Variant | Background | Border | Radius | Padding | Use |
|---|---|---|---|---|---|
| **App card** (`.app-card`) | `--bg-elevated` | 1px `--border-default` | `var(--radius)` (2px) | 24px | Default settings/groups card. Hover deepens border to `--border-hover-soft`. |
| **Dashboard card** (`.dash-card`) | transparent | `border-bottom: 1px solid --border-light` only | none | 20px 0 | Stacked content blocks (org-settings, dash-card titles). Separator-style. |
| **Modal card** | `--bg-elevated` | 1px `--border-default` | `var(--radius)` (2px) | 32px | Sign-in modal, feedback modal. Adds `--shadow-lg`. |

No nested cards. A card inside a card is forbidden; use tonal layering or hairline borders for hierarchy. Cards do not get a default shadow; elevation is communicated by background luminance, not box-shadow.

### Badges (`<Badge>`)

`src/components/ui/badge.tsx` defines three variants:

| Variant | Background | Text | Icon |
|---|---|---|---|
| `verified` | `--badge-success-bg` (`#e8f5e9`) | `--badge-success-fg` (`#1b7a3d`) | CheckCircle (Lucide, 16px) |
| `pending` | `--badge-warning-bg` (`#fff3e0`) | `--badge-warning-fg` (`#b37100`) | Clock (Lucide, 16px) |
| `unverified` | `--bg-canvas` | `--fg-muted` with 1px `--border-default` | none |

All badges: `border-radius: 999px` (pill), `padding: 4px 12px`, Inter 0.875rem weight 500, inline-flex with 6px gap to icon.

In-app status pills (settings 2FA badge, wallet badge, org-sync badge) use a tighter `border-radius: var(--radius)` (2px) variant at Inter 0.75rem. Both shapes are sanctioned: pills for verification status, 2px chips for binary toggles inside dashboard rows.

### Avatars (`<Avatar>`)

`src/components/ui/avatar.tsx` defines four sizes:

| Size | Pixel | Use |
|---|---|---|
| `sm` | 32px | Inline mentions, navbar avatar, list rows |
| `md` | 48px | Default in cards, sign-in confirmation |
| `lg` | 64px | Group profile thumbnails |
| `xl` | 96px | Profile hero |

All circular (`border-radius: 50%`). Fallback renders the first two characters of `fallbackInitials` on a `--bg-sunken` background in Inter weight 600, color `--fg-secondary`.

### Modals

**Standard modal** (sign-in, feedback): centered on desktop, full-width with 16px page padding on mobile. `--bg-elevated` background, 1px `--border-default`, `--shadow-lg`. Backdrop is `rgba(0, 0, 0, 0.7)`. Entry: backdrop fade-in 200ms linear; content slides up 16px and scales from 0.98 to 1 over 300ms with the spring easing curve `cubic-bezier(0.16, 1, 0.3, 1)`.

**Bottom sheet** (mobile feedback, future mobile account switcher): fixed to the bottom edge, 16px top corners, drag handle at the top. Swipe-down-to-dismiss with momentum-based physics (drag past 80px down dismisses). Respects `env(safe-area-inset-bottom)`.

### Hero on `/welcome` (signature surface)

The hero is the one place the design speaks at full volume. Display Noto Serif at `clamp(5rem, 7vw + 1rem, 7rem)` carries the headline; an Instrument Serif italic span carries one or two accent words inline. Subtitle is Inter at `clamp(1.125rem, 1.5vw + 0.5rem, 1.5rem)` in `--fg-secondary`, capped at 640px. Actions are stacked vertically on small screens, horizontal above 768px.

A staggered fade-up animation on initial load (`fadeUp` keyframes, 500ms with the spring easing curve, 0/50/150ms delays). Disabled under `prefers-reduced-motion`.

### Partner Network Grid (signature component)

A 4-column grid with 1px gaps in `--bg-sunken`, each cell padded `40px 24px` on a `--bg-canvas` background. Logo is grayscale-100% at rest, opacity 0.7. Partner name is Noto Serif 1.125rem in `--ledger-rule` gray (`#cfc4c5`). On hover: logo loses grayscale, name shifts to `--fg-primary`, an Inter 0.75rem description fades in. The grid itself is the metaphor; the ledger's columns made literal. Collapses to 2 columns below 768px.

### Navbar

Fixed at top, `--navbar-height` (64px). Three-zone layout: left (logo plus optional beta badge) | center (empty by default; reserved for future titled-page mode) | right (top-nav links and avatar switcher, or sign-in button when unauthenticated).

Frosted glass: `rgba(255, 255, 255, 0.8)` background plus `backdrop-filter: blur(12px)` and a 1px hairline below.

Two modes:
1. **Default** (`navbar--default`): opaque-frosted background. The standard mode for every gated page and most marketing pages.
2. **Transparent** (`navbar--transparent`): used on `/welcome` while above the fold. Background is fully transparent; on scroll it switches to the default frosted treatment.

Authenticated top-nav links (`.navbar__app-link`): Inter 500 0.75rem, letter-spacing 0.15em, uppercase, `--fg-muted` at rest. Hover and active shift to `--fg-primary`; active also adds a 1.5px `--fg-primary` bottom border.

Mobile (below 768px): the right zone collapses to a hamburger trigger plus the avatar. The hamburger opens a dropdown rendered below the navbar with a 1px hairline and a 0.97 alpha background. There is no off-canvas drawer and no bottom nav; the product is too thin in IA to justify either.

### Icons

All icons from **Lucide React**. Conventions:

| Context | Size | Stroke Width |
|---|---|---|
| Inline actions (Pencil, Copy, ChevronDown, Trash2) | 14px | default (2) |
| Modal close, header (X, Globe) | 18px | default |
| Navigation chrome (back, menu, hamburger) | 20 to 22px | default |
| Status callouts (AlertCircle, CheckCircle in badges) | 14 to 16px | default |
| Large success states (CheckCircle2 on verification) | 40px | 1.2 |

Stroke icons only. Active states use heavier `strokeWidth`, never fill.

### Motion

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `150ms ease-out` | Micro-interactions: hover, focus, color shifts |
| `--transition-base` | `250ms ease-out` | Medium transitions: navbar state, dropdown entry |
| `--transition-slow` | `400ms cubic-bezier(0.16, 1, 0.3, 1)` | Layout shifts: modal slide, bottom-sheet entry, hero reveal |

The slow curve is the **signature spring easing** of the system. It overshoots slightly before settling, giving motion a physical, weighted feel. Used for any transition that moves an element across the layout.

**Animation patterns:**

- **Press scale** (target: `.press-scale` class, currently inline on hero buttons): `transform: scale(0.97)` on `:active`. Disabled under `prefers-reduced-motion`.
- **Hero reveal**: `fadeUp` keyframes with spring easing, staggered 0/50/150ms delays.
- **Loading screen logo pulse**: `opacity: 0.3 to 1`, `scale: 0.95 to 1` over 2s, infinite. Slow and calming.
- **Modal entry**: backdrop fades in (200ms linear) while content slides up 16px and scales from 0.98 to 1 (300ms spring).

`prefers-reduced-motion` disables all animations. Elements render at their final state with `opacity: 1` and no transform.

### Border Radius Scale

| Value | Token / Literal | Use |
|---|---|---|
| `2px` | `var(--radius)` | Default: cards, buttons, inputs, modals, in-app status chips |
| `4px` | literal | Hero CTAs on `/welcome` (legacy; intentional breath at marketing scale) |
| `16px` | literal | Bottom-sheet top corners; signals "draggable" on mobile |
| `999px` | literal | Pill shapes: badges, verification labels, avatar |
| `50%` | literal | Circles: avatars, dots, step numbers |

## 7. Responsive Behavior

The system has a **single breakpoint at 768px**. There is no tablet break, no XL desktop break, no four-step ladder. The product is too narrow in IA to justify a denser breakpoint scheme, and a single break forces a clear mobile and a clear desktop layout instead of a soft middle.

### Breakpoints

| Range | Layout |
|---|---|
| `< 768px` | Mobile. Single column, hamburger nav, inputs at 16px font-size to prevent iOS auto-zoom, page padding `md` (16px), hero actions stack vertically, partner grid collapses to 2 columns. |
| `>= 768px` | Desktop. Top nav with horizontal links, page padding `xl` (32px), hero actions horizontal, partner grid 4 columns, settings cap at 720px, app shell cap at 1024px. |

CSS expression: `@media (max-width: 768px)`. It is the only media query in `globals.css`.

### Touch Targets

| Element | Minimum |
|---|---|
| Any tappable control | **44 x 44px** (WCAG 2.2 AA target size minimum) |
| Primary CTAs | 48 x 48px (Button `lg` size) |
| Inline icon-only actions | 44 x 44px hit area, even if the visible icon is 14 to 22px (use padding to expand the hit area) |
| Hamburger button, mobile avatar trigger | 44 x 44px (already enforced in `globals.css`) |

Padding, not visible size, is the lever. A 14px Pencil icon should sit inside a 44px button-shaped tap region.

### Collapsing Strategy

What happens at 768px, by component:

| Component | Desktop (>=768px) | Mobile (<768px) |
|---|---|---|
| Navbar links | Horizontal row, right-aligned | Hidden; replaced by hamburger trigger |
| User chip | Visible in right zone | Replaced by 44 x 44 avatar trigger |
| Hamburger menu | Hidden | Visible; opens dropdown panel below navbar |
| Hero | Display headline at full clamp size, actions horizontal | Same clamp self-scales; actions stack vertically |
| Partner grid | 4 columns | 2 columns |
| Settings cards | 720px centered column | Full-width minus `md` page padding |
| Modals | Centered, max-width 480px | Full-width with `md` page padding |
| Mobile feedback | Centered modal | Bottom sheet with safe-area-inset-bottom |

### iOS-specific Rules

- **16px input minimum.** Any `<input>` or `<textarea>` must have `font-size: 16px` at `< 768px`. Below 16px, iOS Safari auto-zooms on focus and the viewport scrolls horizontally. Desktop can be 14 to 15px for density; mobile must override.
- **Safe-area insets.** Bottom sheets, mobile-fixed action bars, and any element flush to the bottom edge must respect `env(safe-area-inset-bottom)`.
- **Backdrop-filter.** The frosted navbar uses `backdrop-filter: blur(12px)`. iOS supports it; the fallback is the 0.8-alpha white background already in place.

### Reduced Motion

`@media (prefers-reduced-motion: reduce)` zeroes every animation and transition (`globals.css`). Component-level animations (hero `fadeUp`, loading-screen pulse, modal slide) all check this preference explicitly. Motion is decoration, never load-bearing. A user who turns off motion must see every state and outcome the same as a user who didn't.

### Reduced Contrast / Forced Colors

Not yet honored. **TBD:** add `prefers-contrast: more` overrides for borders and focus rings; add `forced-colors` mode handling for Windows High Contrast.

### Named Rules

**The One-Breakpoint Rule.** 768px is the only breakpoint. If a screen needs a third layout step, the IA is wrong. Fix the IA, not the breakpoints.

**The Hit-Area Rule.** Visible icon size is decorative; hit area is the contract. Every tappable element passes 44 x 44 regardless of the icon inside it.

## 8. Accessibility

The floor is **WCAG 2.2 AA**, layered with **atproto-fluency on-ramps** so an atproto-novice and an atproto-fluent user can both orient on the same screen. Accessibility here is a cognitive on-ramp, not just a contrast check (see PRODUCT.md, "Accessibility & Inclusion").

### Contrast

All running text passes AA against its surface. The pairings below are the system's sanctioned combinations; verify any new pairing with a contrast checker before shipping. Ratios are approximate; do not quote them as test thresholds without re-measuring.

| Foreground | Surface | Approx ratio | Verdict | Use |
|---|---|---|---|---|
| `--fg-primary` (`#111111`) | `--bg-canvas` (`#f9f9f9`) | ~17.7 : 1 | AA / AAA | Headings, primary text |
| `--fg-primary` (`#111111`) | `--bg-elevated` (`#ffffff`) | ~18.9 : 1 | AA / AAA | Card titles, modal headings |
| `--fg-secondary` (`#4c4546`) | `--bg-canvas` (`#f9f9f9`) | ~8.5 : 1 | AA / AAA | Default body text |
| `--fg-muted` (`#7e7576`) | `--bg-elevated` (`#ffffff`) | ~4.6 : 1 | AA (normal) | Meta text, placeholders, nav labels on white |
| `--fg-muted` (`#7e7576`) | `--bg-canvas` (`#f9f9f9`) | ~4.2 : 1 | AA-large only | UI labels >=14px-bold or >=18px only; never body |
| `--badge-success-fg` (`#1b7a3d`) | `--badge-success-bg` (`#e8f5e9`) | ~4.8 : 1 | AA | Verified badge |
| `--badge-warning-fg` (`#b37100`) | `--badge-warning-bg` (`#fff3e0`) | ~4.6 : 1 | AA | Pending badge |
| `--color-error` (`#ba1a1a`) | `--bg-canvas` (`#f9f9f9`) | ~6.8 : 1 | AA | Error text and validation copy |

The `--fg-muted` on `--bg-canvas` pairing is the one to watch: it passes AA-large only. Use it for UI labels and meta text at >=14px-bold or >=18px, never for body copy.

### Focus Rings

| Element | Ring style |
|---|---|
| Button (any variant) | `outline: 2px solid var(--color-primary); outline-offset: 2px` |
| Input, Textarea | `border-color: var(--color-focus-green)`; `box-shadow: 0 0 0 3px rgba(148, 187, 81, 0.15)` |
| Link | `outline: 2px solid var(--color-accent); outline-offset: 2px` (default in `globals.css`) |
| Card with click handler | Inherits link or button focus depending on the underlying element |
| Skip-nav | Visible only `:focus`, top-left, navy background, white text |

`:focus-visible` is used everywhere; mouse clicks do not paint the ring. Keyboard focus always paints.

### Keyboard

- Every flow completable by keyboard alone, including the OAuth callback (`/oauth/callback`) and group-management screens.
- Tab order matches DOM order. No `tabindex > 0`.
- Modals trap focus on open and restore focus to the trigger on close.
- The skip-to-main link in `layout.tsx` stays.
- Hamburger dropdown is keyboard-navigable; the trigger toggles `aria-expanded`.

### Semantic Structure

- One `<h1>` per page. Subsequent levels descend without skipping.
- Landmark elements: `<header>`, `<main>`, `<nav>`, `<footer>`. Never `<div role="main">` when the element exists.
- Lists use `<ul>` / `<ol>`; navigation uses `<nav>` with `aria-label`.
- Form labels use `<label for>`; placeholder is never the only label.

### Atproto-Fluency On-Ramps

A novice and a power user must orient on the same screen.

- DID, handle, PDS, group, and attestation each get a one-line plain gloss the **first time** they appear on a screen, in `--fg-secondary` Inter `body-sm`. Power users skim past; novices read it.
- Validation copy is plain, not opaque. "This handle is already taken at certified.one" beats "ERR_HANDLE_CONFLICT". See PRODUCT.md.
- DID strings render with `font-feature-settings: 'zero' 1, 'tnum' 1` for character disambiguation.

### Status Without Color Alone

Color never carries meaning by itself. Every status surface pairs color with an icon or a label.

| Status | Color | Required pairing |
|---|---|---|
| Verified | `--badge-success-fg` on `--badge-success-bg` | CheckCircle icon + "Verified" text |
| Pending | `--badge-warning-fg` on `--badge-warning-bg` | Clock icon + "Pending" text |
| Error | `--color-error` | AlertCircle icon + plain-language description |
| Success (action confirm) | `--color-success` (dot) + `--color-success-text` | Check icon or explicit text |
| Disabled | `opacity: 0.5` | `aria-disabled="true"` and `cursor: not-allowed` |

A red dot on its own is not a valid error indicator.

### Reduced Motion and Touch Targets

Both covered in Section 7. Restated for completeness: motion is decoration, never load-bearing; 44 x 44 minimum hit area regardless of icon size.

### Named Rules

**The Glossed-Concept Rule.** DID, handle, PDS, group, and attestation receive a plain-language gloss on first appearance per screen. The gloss is body-sm Inter in `--fg-secondary`, never a tooltip alone.

**The Color-Plus-Icon-Or-Label Rule.** Color is never the only signal of status. A red border without an error message, a green dot without a label, a grayed-out card without `aria-disabled`: all forbidden.

## 9. Do's and Don'ts

These guardrails enforce the strategic line in PRODUCT.md. The anti-references named there appear here verbatim.

### Do:

- **Do** organize hierarchy with serif headlines and tonal warm neutrals. Restraint is the affordance.
- **Do** reference semantic tokens (`--bg-canvas`, `--fg-primary`, `--border-default`) in component CSS. Never hard-code hex values.
- **Do** use `--bg-canvas` (`#f9f9f9`) for page surfaces and `--bg-elevated` (`#ffffff`) for lifted cards and modals.
- **Do** use `--fg-secondary` (`#4c4546`) for default body text. Reserve `--fg-primary` for headings and primary interactive text.
- **Do** keep neutrals warm. If you need a new gray, it must sit on the warm side of neutral.
- **Do** use Instrument Serif italic for one accent phrase per hero, and nowhere else.
- **Do** cap body copy at 65 to 75 characters per line.
- **Do** reach for the `<Button>` component (`src/components/ui/button.tsx`) for new buttons. Add a variant or a size to the component if needed; don't hand-roll button styles in CSS.
- **Do** reach for `<Input>`, `<Textarea>`, `<Badge>`, `<Avatar>` for those primitives.
- **Do** use the 1px hairline border ramp (`--border-subtle` through `--border-strong`) for every divider and card edge.
- **Do** confine shadows to floating surfaces (modals, dropdowns, feedback trigger, bottom sheets).
- **Do** treat `--color-focus-green` (`#94bb51`) as a focus-and-confirmation accent only.
- **Do** enable `font-feature-settings: 'tnum' 1` on numeric UI and `'case' 1` on uppercase labels.
- **Do** explain DIDs, handles, and PDSes inline the first time they appear on a screen, in plain Inter body type.
- **Do** keep mobile touch targets at least 44 by 44px.
- **Do** use `font-size: 16px` minimum on mobile inputs (below 768px) to prevent iOS auto-zoom.
- **Do** respect `prefers-reduced-motion`; motion is decoration, never load-bearing.
- **Do** pick from the five canonical container widths (1536 / 1024 / 720 / 640 / 480px). Pick the nearest before inventing a new one.
- **Do** pair every status color with an icon or text label. Color alone never carries meaning.

### Don't:

- **Don't** introduce a brand accent hue. Certified has no brand color, by design.
- **Don't** use neon accents on black, gradient meshes, glassmorphism, or Web3 depth tricks. The crypto-wallet aesthetic is the strongest anti-reference.
- **Don't** use cream backgrounds with warm-orange accents, illustrated heroes, or developer-first framing. The SaaS-cream auth-as-a-service lane (Auth0, Clerk, WorkOS) is forbidden.
- **Don't** use Bluesky-cousin treatments: rounded cards, friendly blue accents, app-store-y heroes. Certified is identity infrastructure, not a social product.
- **Don't** use stock photography, navy-and-gold credibility palettes, or vague empowering-communities copy. The generic-foundation / NGO lane is forbidden.
- **Don't** frame identity as "ownership", "your keys your X", or any other crypto-self-custody phrasing. Certified is about portability, not custody.
- **Don't** mix registers. Brand-register treatments (full-bleed hero, multi-column grids, display Noto Serif) do not appear inside the gated app. Product-register chrome (single-column 720 to 1024px, settings cards) does not appear on `/welcome` or `/about`.
- **Don't** introduce desktop sidebars or multi-column dashboards inside the product register. The gated app is a centered narrow column at every viewport.
- **Don't** add a second breakpoint. 768px is the only break in the system; if a screen needs a third layout step, the IA is wrong.
- **Don't** invent a sixth container width. Pick the nearest of the five canonical widths.
- **Don't** put body copy in `--fg-muted` on `--bg-canvas`. The contrast is below AA for normal text. Use `--fg-muted` for UI labels at >=14px-bold or >=18px only.
- **Don't** use weight 700 on Inter. Reserve 700 for Noto Serif headlines only; Inter body and labels cap at 600.
- **Don't** use `--color-primary` or `--color-white` for theme-aware surfaces. They are invariants; use `--bg-elevated`, `--fg-primary`, `--btn-primary-bg`.
- **Don't** hand-code colors in tailwind utility classes (`bg-[#111]`). Use CSS custom properties or the token names; raw hex breaks the migration path.
- **Don't** introduce cool grays. Cool gray is web2 SaaS by reflex.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent. The side-stripe pattern is in the absolute-bans list; rewrite the element instead.
- **Don't** use `background-clip: text` with a gradient. Gradient text is forbidden; use weight or size for emphasis.
- **Don't** stack a card inside a card. Use tonal layering or hairline borders for hierarchy.
- **Don't** add a shadow to surfaces that scroll with the page. Shadows belong on floating elements only.
- **Don't** use `fill` on Lucide icons. Stroke icons only; emphasize via stroke-width, never fill.
- **Don't** add an image without `onError` fallback handling. Avatars fall back to initials; partner logos hide on failure; banners fall back to a tonal gradient.
- **Don't** reach for the stale tokens in `tailwind.config.ts` (`navy: #0F2544`, `accent: #60A1E2`, the `elevation-1` through `elevation-4` shadows). They are leftover from a prior visual system; the source of truth is `--color-*` and `--bg-*` in `globals.css`.
- **Don't** use em dashes in copy or `--`. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** use exclamation marks or emojis in product copy.
- **Don't** rely on color alone to signal status. Pair color with icon or label every time.

## 10. Agent Prompt Guide

A quick reference for AI agents and tooling. The frontmatter at the top of this file is the machine-readable index; this section is the prose-readable index.

### The 12 tokens an agent reaches for 90% of the time

| Token | Use |
|---|---|
| `var(--bg-canvas)` | Page background |
| `var(--bg-elevated)` | Cards, modals, inputs |
| `var(--fg-primary)` | Headings, primary interactive text |
| `var(--fg-secondary)` | Default body text |
| `var(--fg-muted)` | Meta text, placeholders, nav labels |
| `var(--border-default)` | Card edges, input borders |
| `var(--border-hover-soft)` | Card hover edge |
| `var(--color-focus-green)` | Input focus border |
| `var(--color-error)` | Error text, destructive actions |
| `var(--btn-primary-bg)` / `var(--btn-primary-fg)` | Primary button background and text |
| `var(--radius)` | Default 2px corner |
| `var(--transition-fast)` | Micro-interactions (hover, focus) |

If you find yourself reaching for a 13th token, you are probably solving the wrong problem. Look for typographic or hierarchical solutions first.

### Component selector cheat sheet

| Need | Use | Don't use |
|---|---|---|
| New button | `<Button variant="primary\|secondary\|ghost\|destructive" size="sm\|md\|lg">` | A new BEM class, a Tailwind `bg-[#111]`, an inline button |
| New text input | `<Input>` | A raw `<input>` with custom CSS, a sign-in legacy class |
| New textarea | `<Textarea>` | A raw `<textarea>` |
| New status pill | `<Badge variant="verified\|pending\|unverified">` | A hand-rolled `.pill` |
| Avatar | `<Avatar size="sm\|md\|lg\|xl" src=... fallbackInitials=...>` | A raw `<img>` with rounded corners |
| Modal | Reuse `<SignInModal>` / `<FeedbackModal>` patterns; spec lives in Section 6 | A new modal CSS file |
| New settings card | A bordered container with `--bg-elevated`, 1px `--border-default`, `var(--radius)`, 24px padding. Match `.app-card`. | A `<Card>` import; the Card primitive is partial, prefer the existing utility class until extracted |
| Loading state | `<LoadingSpinner>` for inline; full-page `.loading-screen` pattern with logo pulse | A skeleton grid (not in the system) |

### Migration hints

When you encounter legacy code, prefer the migration target.

| Legacy | Target |
|---|---|
| `bg-[#111]`, `text-[#4c4546]` | `var(--bg-elevated)` / `var(--fg-secondary)` semantic tokens |
| `tailwind.config.ts` colors `navy`, `accent`, `elevation-1..4` | The `--color-*` and `--bg-*` ramp in `globals.css` |
| `.signin-modal__submit`, `.hero__btn-primary`, `.feedback-modal__submit` | `<Button variant="primary" size="lg">` |
| `.signin-input` | `<Input>` |
| Hard-coded hex in JSX | A semantic token via `var(--...)` or a Tailwind utility that maps to one |

Do not delete legacy CSS in a non-migration PR. Migrate one surface at a time.

### Ready-to-use prompts

Each prompt is a one-paragraph spec an agent can follow without re-reading the rest of DESIGN.md.

**Prompt: add a new settings card.**
> Add a new `.app-card` to a settings page. Use `--bg-elevated` background, 1px `--border-default`, `var(--radius)` (2px) corners, 24px padding. Title is Noto Serif 1.375rem weight 700, color `--fg-primary`. Body is Inter 1rem `--fg-secondary`, capped at 65ch. If the card has a primary action, use `<Button variant="primary" size="md">` aligned to the right. Hover deepens the border to `--border-hover-soft`. Do not add a shadow; cards are flat at rest.

**Prompt: style a destructive confirmation flow.**
> Use `<Button variant="destructive">` for the confirm action and `<Button variant="secondary">` for cancel. Confirm copy is plain ("Remove wallet" beats "Are you sure?"). Helper text below the buttons in `--color-error` Inter 0.8125rem explains the consequence in one sentence. The confirm button background is `--color-error` at 0.10 alpha; on hover the background shifts to 0.15 alpha. Do not use a red full-fill button; the destructive variant intentionally reads as an outlined warning, not a permission to act.

**Prompt: add a status badge.**
> Use `<Badge variant="verified|pending|unverified">`. Pair the badge with a Lucide icon (CheckCircle for verified, Clock for pending, none for unverified) and an explicit text label. Color alone never signals status. Use the pill shape (`border-radius: 999px`) for verification status; use the tighter 2px chip for binary toggles inside dashboard rows.

**Prompt: add a new long-form page.**
> Decide register first. Brand register if marketing-facing (`/welcome`, `/about`, `/terms`); product register otherwise. Brand register: container max 1536px, headline Noto Serif `clamp(2rem, 3vw + 0.5rem, 3rem)` weight 700, body in a 640px reading band, 65 to 75ch line cap. Product register: container max 1024px (or 720px for forms), single column, no sidebar. Page padding `xl` (32px) desktop, `md` (16px) mobile. Section gaps `2xl` (48px) brand, `xl` (32px) product. One `<h1>` per page; never skip heading levels.

**Prompt: explain an atproto concept in copy.**
> The first time DID, handle, PDS, group, or attestation appears on a screen, follow it with a one-line plain gloss in `--fg-secondary` Inter `body-sm`. Example: "Your handle is your readable name on the AT Protocol, like an email address but portable." Power users will skim past it; novices will rely on it. Do not gate the gloss behind a tooltip or a help icon.

### Hard rejects (paste-on-rejection lines)

When an agent or contributor proposes a forbidden pattern, the response is one of:

- "No brand accent hue. Certified is monochrome by design. See Section 2."
- "No nested cards. Use tonal layering or a hairline divider. See Section 4."
- "No second breakpoint. The system has one break at 768px. See Section 7."
- "No desktop sidebar in the product register. Centered column always. See Section 4."
- "Color alone does not signal status. Add an icon or a label. See Section 8."
- "Inter weight caps at 600. Weight 700 is reserved for Noto Serif headlines. See Section 3."
- "Em dash forbidden in copy. Use commas, colons, semicolons, periods, or parentheses. See PRODUCT.md."
- "Side-stripe borders forbidden. Rewrite with a full border, a background tint, or a leading number or icon. See Section 5."
- "Gradient text forbidden. Use weight or size for emphasis. See Section 3."

These are not insults. They are the system, named.
