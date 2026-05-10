---
name: Certified
description: A passwordless AT Protocol identity, designed like a notary's ledger.
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

## 4. Elevation

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

## 5. Components

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

All buttons: `border-radius: var(--radius)` (2px), Inter weight 500, `letter-spacing: 0.05em`, 150ms ease-out transition, focus ring 2px `--color-primary` outline at 2px offset. Active state uses `transform: scale(0.97)`. Disabled drops to opacity 0.5 with `cursor: not-allowed`.

The hero CTAs on `/welcome` are an exception today (`.hero__btn-primary` uses 4px radius and 18px 40px padding). Prefer `<Button variant="primary" size="lg">` in new code; treat the hero CSS as legacy.

### Inputs (`<Input>`, `<Textarea>`)

| Variant | Height | Padding | Border | Radius |
|---|---|---|---|---|
| App input (`<Input>`) | 44px | 0 16px | 1px `--border-default` | `var(--radius)` (2px) |
| Sign-in input (legacy CSS) | 48px | 0 16px | 1.5px `--color-light-gray` | `var(--radius)` (2px) |
| Textarea (`<Textarea>`) | auto | 12px 16px | 1px `--border-default` | `var(--radius)` (2px) |

All inputs use `--bg-elevated` background, `--fg-primary` text, Inter 1rem, placeholder in `--fg-muted`. Focus state shifts the border to `--color-focus-green` (annotation green) and adds a 3px ring at 0.15 opacity. The 1.5px sign-in border is intentional; it signals a write-here surface that's slightly thicker than page hairlines.

**iOS auto-zoom rule.** Any focusable `<input>` or `<textarea>` must have **font-size at least 16px on mobile** (`@media (max-width: 768px)`). Below 16px, iOS Safari auto-zooms on focus and overflows the viewport. Desktop can stay at 14 to 15px for visual density, but mobile must override to 16px.

Error state shifts the border to `--color-error` and renders helper text in `--color-error` Inter 0.8125rem immediately below.

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

## 6. Do's and Don'ts

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

### Don't:

- **Don't** introduce a brand accent hue. Certified has no brand color, by design.
- **Don't** use neon accents on black, gradient meshes, glassmorphism, or Web3 depth tricks. The crypto-wallet aesthetic is the strongest anti-reference.
- **Don't** use cream backgrounds with warm-orange accents, illustrated heroes, or developer-first framing. The SaaS-cream auth-as-a-service lane (Auth0, Clerk, WorkOS) is forbidden.
- **Don't** use Bluesky-cousin treatments: rounded cards, friendly blue accents, app-store-y heroes. Certified is identity infrastructure, not a social product.
- **Don't** use stock photography, navy-and-gold credibility palettes, or vague empowering-communities copy. The generic-foundation / NGO lane is forbidden.
- **Don't** frame identity as "ownership", "your keys your X", or any other crypto-self-custody phrasing. Certified is about portability, not custody.
- **Don't** mix registers. Brand-register treatments (full-bleed hero, multi-column grids, display Noto Serif) do not appear inside the gated app. Product-register chrome (single-column 720 to 1024px, settings cards) does not appear on `/welcome` or `/about`.
- **Don't** introduce desktop sidebars or multi-column dashboards inside the product register. The gated app is a centered narrow column at every viewport.
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
- **Don't** use em dashes (`—`) in copy or `--`. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** use exclamation marks or emojis in product copy.
- **Don't** rely on color alone to signal status. Pair color with icon or label every time.
