---
name: Certified
description: A passwordless AT Protocol identity, designed like a notary's ledger.
colors:
  ink-black: "#111111"
  archive-gray: "#4c4546"
  bureau-iron: "#7e7576"
  ledger-rule: "#cfc4c5"
  light-divider: "#e2e2e2"
  public-stone: "#eeeeee"
  vellum: "#f3f3f3"
  notice-paper-white: "#f9f9f9"
  pure-white: "#ffffff"
  annotation-green: "#94bb51"
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
  nav-label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.15em"
rounded:
  xs: "2px"
  sm: "4px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.pure-white}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "18px 40px"
    height: "auto"
  button-primary-hover:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.pure-white}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-black}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "18px 40px"
  input-default:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.ink-black}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "0 16px"
    height: "48px"
  input-focus:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.ink-black}"
  card-default:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.archive-gray}"
    rounded: "{rounded.xs}"
    padding: "24px"
  card-hover:
    backgroundColor: "{colors.pure-white}"
  chip-default:
    backgroundColor: "{colors.notice-paper-white}"
    textColor: "{colors.bureau-iron}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "4px 12px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.bureau-iron}"
    typography: "{typography.nav-label}"
    padding: "4px 0"
---

# Design System: Certified

## 1. Overview

**Creative North Star: "The Notary's Ledger"**

Certified feels like a notary's ledger reimagined as a mobile app; austere, monochrome, and quietly authoritative. The near-absence of color forces attention onto the content: serif headlines anchor each card like a document title, while the surrounding chrome recedes into warm grays. The interface is deliberately under-decorated; no gradients, no brand accent hue, no playful illustrations. The restraint is the brand.

The system is two-toned at the surface level: an off-white "paper" and a near-black "ink", separated by a small library of warm-tinted neutrals that carry meta-text, dividers, and structural surfaces. Headlines are set in Noto Serif at heavy weight; signature accents lean on Instrument Serif italic, the closest thing the system has to a flourish. Body and UI labels are Inter, in restrained weights. Edges are nearly square (2px), borders are 1px and hairline, and shadows are absent except on overlay elements that genuinely need to detach from the page.

This system explicitly rejects the **crypto-wallet aesthetic** named in PRODUCT.md: neon accents, gradient meshes, glassmorphism, animated particle fields. It also rejects the **SaaS-cream auth-as-a-service** lane (cream and warm-orange, illustrated heroes), the **Bluesky / consumer-social** look (rounded cards, friendly blue, app-store hero), and the **generic foundation / NGO** look (navy-and-gold credibility palette, stock photography). Where competitors perform, Certified records.

**Key Characteristics:**

- Two-tone monochrome: warm-tinted neutrals, ink-black ink, no brand accent hue.
- Serif-led typographic identity: Noto Serif for authority, Instrument Serif italic for the single accent voice, Inter for everything else.
- Near-square edges (2px default; 4px reserved for primary action surfaces).
- Flat by default. One ambient shadow vocabulary, reserved for overlays.
- Borders are hairline (1px) and tonal; they organize, they don't decorate.
- Restraint is the affordance. If a flourish exists only to impress, remove it.

## 2. Colors: The Civic Palette

A monochrome system named in civic vocabulary. There is no primary brand hue; the "primary" color is ink. Color appears only in three places: focus state, semantic status, and partner-app logos at hover. Everywhere else, the system is grayscale with warm-tinted neutrals.

### Primary

- **Ink Black** (`#111111`): primary text, primary action surface, focus outline. The "ink" of the ledger. It is never `#000`; the warm tint matters.
- **Notice-Paper White** (`#f9f9f9`): the page surface. The "paper" of the ledger. It is never `#fff` for surfaces; pure white is reserved for cards lifted above the page.

### Neutral

- **Pure White** (`#ffffff`): card and modal interiors only. Pure white reads as a fresh page set on top of the older paper underneath.
- **Vellum** (`#f3f3f3`): the lowest container tier; subtle inset surfaces inside cards.
- **Public Stone** (`#eeeeee`): the standard container surface, grid backgrounds, the small pill behind the BETA label.
- **Ledger Cream** (`#e8e8e8`): the highest container tier; used as the dividing rail in the partner-apps grid (1px gap that reads as a stone wall).
- **Light Divider** (`#e2e2e2`): hairline borders on inputs, sectioning rules.
- **Ledger Rule Gray** (`#cfc4c5`): the empty / placeholder state in the partner-apps grid; partner names sit in this gray until the cell is hovered.
- **Bureau Iron** (`#7e7576`): meta text, secondary copy, navigation labels. The "official annotator" voice.
- **Archive Gray** (`#4c4546`): default body text. Sits one step softer than ink, so headlines stay dominant.

All neutrals carry a slight warm undertone. They are never tuned cool; cool grays read as software, warm grays read as paper.

### Tertiary (single deliberate accent)

- **Annotation Green** (`#94bb51`): focus rings on form inputs and a small set of confirmation icons. It is a margin-note green; the color of someone's pen approving a line in a ledger. **It is the only chromatic color in the everyday interface.**

### Semantic

- **Success Leaf** (`#2ecc71`): success indicators only; never a fill on a page-level surface. Paired with text in `#047857` for AA contrast on light tints.
- **Caution Amber** (`#f5a623`): warning state, paired with `#7a6420` text on a `#fef9e7` tint. Reserved; never decorative.
- **Error Vermilion** (`#ba1a1a`): error state, validation copy, destructive-action confirmation only.

### Named Rules

**The No-Brand-Hue Rule.** Certified has no brand color. Do not introduce one. If a screen needs visual interest, it needs better typography or better information architecture, not a hue.

**The Warm-Neutral Rule.** Every gray is warm. Cool grays (chroma toward blue) are forbidden; they read as web2 SaaS. Pulling a neutral from outside this list requires changing the list, not the screen.

**The One-Voice-of-Color Rule.** Annotation Green is the only non-semantic color in the interface. It appears on focus rings and confirmation icons, nowhere else. If you find yourself wanting a "second" non-semantic color, the answer is restraint, not addition.

## 3. Typography

**Display Font:** Noto Serif (with Georgia, serif fallback)
**Display Accent:** Instrument Serif italic (with Georgia italic fallback)
**Body / UI Font:** Inter (with system-ui, -apple-system fallback)

**Character:** Noto Serif anchors the system with foundation-letter authority; it carries the weight of a notarized document. Instrument Serif italic is the single flourish in the system, used for short accent phrases inside hero titles ("yours, everywhere") and editorial callouts. Inter handles every other surface in three weights: 400 for body, 500 for navigation and labels, 600/700 for emphasized UI text.

### Hierarchy

- **Display** (Noto Serif, 700, `clamp(5rem, 7vw + 1rem, 7rem)`, line-height 0.9, letter-spacing -0.02em): hero title on `/welcome`. One per page, never repeated.
- **Display Italic** (Instrument Serif, 400 italic): accent words inside the display title. Used inline as `<span class="hero__title-accent">`. Carries the only typographic flourish in the system.
- **Headline** (Noto Serif, 700, `clamp(2rem, 3vw + 0.5rem, 3rem)`, line-height 1.1, letter-spacing -0.02em): section headlines on the landing surface. Anchors each section like a document title.
- **Body** (Inter, 400, 1rem / 16px, line-height 1.6, max 65–75ch): all default running copy. Color is `archive-gray`, not ink-black, so headlines stay dominant.
- **Body Small** (Inter, 400, 0.875rem / 14px, line-height 1.5): meta copy, helper text, captions inside cards.
- **Label** (Inter, 500, 0.6875rem / 11px, letter-spacing 0.2em, uppercase): the eyebrow above section headlines and inside cards. The "category" voice in `bureau-iron`.
- **Nav Label** (Inter, 500, 0.75rem / 12px, letter-spacing 0.15em, uppercase): authenticated top-nav links. Active state adds a 1.5px bottom border in ink-black.

### Named Rules

**The Serif-Authority Rule.** Headlines are always serif. Sans-serif headlines do not exist in this system. If a sans-serif "headline" feels needed, it is a label or a title in disguise; set it accordingly.

**The One-Italic Rule.** Italic appears in exactly one place: as Instrument Serif accent words inside a serif headline. There is no italic body, no italic UI label, no italic emphasis. The italic is the brand's signature; spreading it weakens it.

**The 65–75ch Rule.** Body copy is capped at 65–75 characters per line. Edge-to-edge prose is forbidden; long lines are uncomfortable on an instrument that already asks for trust.

## 4. Elevation

The system is **flat by default**. Surfaces are organized by warm-tinted tonal layering (`notice-paper-white` → `vellum` → `public-stone` → `ledger-cream`) and 1px hairline borders. Cards do not float at rest. Buttons do not pop. Navigation does not drop a shadow.

There is **one** sanctioned shadow in the system, and it lives on overlays only (modals, dropdowns, and the floating feedback surface), where the page genuinely needs a layer above it. Hover states change opacity, scale (very slightly: `scale(0.97)` on active), or border color, never elevation.

### Shadow Vocabulary

- **Overlay Ambient** (`box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12)`): the only sanctioned shadow. Reserved for modal containers, dropdown panels, and the feedback bottom sheet. Diffuse, low-opacity, no inner shadow.

### Named Rules

**The Flat-By-Default Rule.** Pages, sections, cards, navigation, and buttons are flat. Shadows do not signal hover, focus, or interactivity on these surfaces.

**The Overlay-Only-Shadow Rule.** A `box-shadow` value is allowed only on elements that are physically detached from the page (modals, dropdowns, floating sheets). If the element scrolls with the page, it is flat.

**The Hairline Rule.** Borders are 1px and use the existing `--border-*` ramp (`subtle`, `light`, `default`, `medium`, `hover`, `strong`). 2px+ accent borders, side stripes, and colored gutters are forbidden; they are the absolute ban from the impeccable design laws.

## 5. Components

### Buttons

- **Shape:** Near-square. Primary actions use 4px (`rounded.sm`); destructive and ghost actions use 2px (`rounded.xs`). Pill / fully-rounded buttons are forbidden.
- **Primary** (solid): `ink-black` background, `pure-white` text, Inter 500, `18px 40px` padding on hero CTAs (`16px 24px` on app-page CTAs). No shadow at rest. Hover: opacity drops to 0.9. Active: `transform: scale(0.97)`. Focus: `outline: 2px solid ink-black; outline-offset: 2px`.
- **Secondary** (text-link): transparent background, `ink-black` text, transparent 2px bottom border. Hover: bottom border becomes `ink-black`. No fill, ever.
- **Ghost / icon** (rare): transparent background, `archive-gray` icon, `2px` radius. Hover: background shifts to `notice-paper-white`.
- **Destructive:** `error-vermilion` text on transparent at rest; only fills when confirming an irreversible action inside a modal.

### Inputs / Fields

- **Style:** `pure-white` background, **1.5px** border in `light-divider`, 2px radius, 48px height, Inter 1rem text in `ink-black`. Placeholder in `bureau-iron`. The 1.5px border is deliberate; slightly thicker than the page hairlines so the field reads as a write-here surface.
- **Focus:** border color shifts to `annotation-green`; a 3px `rgba(148, 187, 81, 0.15)` ring appears around it. This is the only place the green appears at this prominence.
- **Error:** border shifts to `error-vermilion`; helper text in `error-vermilion` Inter 0.8125rem appears immediately below.
- **Disabled:** opacity 0.6, `cursor: not-allowed`. No tonal change to the surface.

### Cards / Containers

- **Corner Style:** 2px radius (`rounded.xs`). Cards never round above 4px.
- **Background:** `pure-white` lifted onto the `notice-paper-white` page. Inset / lower-tier surfaces use `vellum` or `public-stone`.
- **Shadow Strategy:** none at rest; see Elevation section.
- **Border:** 1px `border-default` (`rgba(0, 0, 0, 0.08)`). Hover: `border-hover-soft` (`rgba(0, 0, 0, 0.12)`). The border is the affordance.
- **Internal Padding:** 24px default; 32px for spacious settings cards; 16px for dense list rows.
- **No nested cards.** A card inside a card is forbidden. Use tonal layering or borders instead.

### Chips / Badges

- **Style:** 4px 12px padding, 2px radius, Inter 500 0.75rem in `bureau-iron`. Default fill is `notice-paper-white`. Status variants tint the fill at 0.1 opacity (e.g. `rgba(46, 204, 113, 0.1)` for success badges) and use the matching semantic text color.
- **No drop shadow, no border, no gradient.**

### Navigation

- **Top nav:** 64px tall, fixed. Default state is `rgba(255, 255, 255, 0.8)` with a 12px backdrop-blur and a 1px hairline below. The transparent variant on `/welcome` reverts to opaque on scroll.
- **Authenticated top-nav links:** Inter 500 0.75rem, letter-spacing 0.15em, uppercase, `bureau-iron` text. Hover: text shifts to `ink-black`. Active: text shifts to `ink-black` and a 1.5px bottom border in `ink-black` appears.
- **Mobile:** hamburger trigger only; no off-canvas; the dropdown opens from below the navbar with a 1px hairline and a 0.97 alpha background.

### Hero on `/welcome` (signature surface)

The hero is the one place the design speaks at full volume. Display Noto Serif at clamp(5rem, 7vw + 1rem, 7rem) carries the headline; an Instrument Serif italic span carries one or two accent words inline. Subtitle is Inter at clamp(1.125rem, 1.5vw + 0.5rem, 1.5rem) in `archive-gray`, capped at 640px. Actions are stacked vertically on small screens, horizontal above 768px. A subtle staggered fade-up animation on initial load (`fadeUp` keyframes, 500ms cubic-bezier(0.16, 1, 0.3, 1), 0/50/150ms delays); disabled under `prefers-reduced-motion`.

### Partner Network Grid (signature component)

A 4-column grid with 1px gaps in `ledger-cream`, each cell padded 40px 24px on a `notice-paper-white` background. Logo is grayscale-100% at rest, opacity 0.7. Partner name is Noto Serif 1.125rem in `ledger-rule` gray. On hover: logo loses grayscale, name shifts to `ink-black`, an Inter 0.75rem description fades in. The grid itself is the metaphor; the ledger's columns made literal.

## 6. Do's and Don'ts

These guardrails enforce the strategic line in PRODUCT.md. The anti-references named there appear here verbatim.

### Do:

- **Do** organize hierarchy with serif headlines and tonal warm neutrals. Restraint is the affordance.
- **Do** use `ink-black` (`#111111`) for primary text and primary actions. Never `#000`.
- **Do** use `notice-paper-white` (`#f9f9f9`) for page surfaces and `pure-white` only for lifted cards and modals.
- **Do** keep neutrals warm. If you need a new gray, it must sit on the warm side of neutral.
- **Do** use Instrument Serif italic for one accent phrase per hero, and nowhere else.
- **Do** cap body copy at 65–75 characters per line.
- **Do** use the 1px hairline border ramp (`--border-subtle` → `--border-strong`) for every divider and card edge.
- **Do** confine shadows to overlay surfaces (modals, dropdowns, feedback sheet).
- **Do** treat `annotation-green` (`#94bb51`) as a focus-and-confirmation accent only.
- **Do** explain DIDs, handles, and PDSes inline the first time they appear on a screen, in plain Inter body type.
- **Do** respect `prefers-reduced-motion`; motion is decoration, never load-bearing.

### Don't:

- **Don't** introduce a brand accent hue. Certified has no brand color, by design.
- **Don't** use neon accents on black, gradient meshes, glassmorphism, or "Web3" depth tricks. The crypto-wallet aesthetic is the strongest anti-reference.
- **Don't** use cream backgrounds with warm-orange accents, illustrated heroes, or "developer-first" framing. The SaaS-cream auth-as-a-service lane (Auth0, Clerk, WorkOS) is forbidden.
- **Don't** use Bluesky-cousin treatments: rounded cards, friendly blue accents, app-store-y heroes. Certified is identity infrastructure, not a social product.
- **Don't** use stock photography, navy-and-gold credibility palettes, or vague "empowering communities" copy. The generic-foundation / NGO lane is forbidden.
- **Don't** frame identity as "ownership", "your keys your X", or any other crypto-self-custody phrasing. Certified is about portability, not custody.
- **Don't** use `#000` or `#fff` as variable values. Both are reserved as render-only edge cases (the `::selection` background is `var(--color-primary)` for a reason).
- **Don't** introduce cool grays. Cool gray is web2 SaaS by reflex.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent. The side-stripe pattern is in the absolute-bans list; rewrite the element instead.
- **Don't** use `background-clip: text` with a gradient. Gradient text is forbidden; use weight or size for emphasis.
- **Don't** stack a card inside a card. Use tonal layering or hairline borders for hierarchy.
- **Don't** add a shadow to surfaces that scroll with the page. Shadows belong on overlays only.
- **Don't** reach for the stale tokens in `tailwind.config.ts` (`navy: #0F2544`, `accent: #60A1E2`, the `elevation-1`..`elevation-4` shadows). They are leftover from a prior visual system; the source of truth is `--color-*` in `globals.css`.
- **Don't** use em dashes (`—`) in copy or `--`. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** use exclamation marks or emojis in product copy.
- **Don't** rely on color alone to signal status. Pair color with icon or label every time.
