# Certified — Website Design System

> A design reference for building the Certified website and related digital products.
> This document is intended to be consumed by both humans and AI systems generating code.

---

## 1. Brand Overview

**Name:** Certified
**Personality:** Trustworthy, modern, precise, and dynamic.

**What Certified is:** Certified is the consumer-facing brand of the Hypercerts ecosystem. It provides the identity, hosting, and data services layer that makes the Hypercerts protocol usable across applications — while preserving portability and user control. Built on the AT Protocol, Certified gives users a single portable profile whose contributions, reputation, and impact records are consistent across every platform in the ecosystem (Ma Earth, GainForest, Silvi, Hyperboards, and others).

**Primary user touchpoint:** On partner platforms, users "Sign in with Certified" — similar in feel to "Sign in with Google." The experience is deliberately low-touch: users should never need to understand ATProto, Hypercerts, or blockchain to get started.

**Core value proposition:** Your identity, contributions, and trust travel with you — without effort.

**What Certified provides:**
- Portable profiles interoperable across all Hypercerts applications and AT Protocol apps
- Data hosting via Personal and Shared Data Servers (PDS & SDS) for individuals, organizations, and collectives
- IdentityLink connecting ATProto identities to EVM wallets, enabling funding flows to reach contributors
- AppView (Hypergoat) that indexes hypercert records across the network and exposes them via API
- StorageLink for immutable data backups
- Data plugins for ingesting from multiple sources (Google Sheets, Airtable, CSV, GitHub)

**Logo concept:** The brandmark combines a stylized checkmark with the letter "C", reinforcing the concept of verified, portable identity. The visual language should feel institutional enough to instill confidence, but with enough motion and energy to feel modern and approachable — not stiff or bureaucratic.

---

## 2. Logo Assets

All logo files are SVGs and should be used as provided. Do not rasterize at small sizes — use inline SVG or `<img>` with SVG source for crisp rendering at all resolutions.

All logo files live in **`/public/assets/`** and are served as static files at `/assets/` in the browser.

| Asset | File Path | Browser URL | Usage |
|---|---|---|---|
| Brandmark (icon) | `public/assets/certified_brandmark.svg` | `/assets/certified_brandmark.svg` | Favicons, app icons, avatar-sized contexts, loading states. Square with rounded corners (128×128 native). Dark blue background with white "C-check" mark and blue accent checkmark. |
| Wordmark (dark blue) | `public/assets/certified_wordmark_darkblue.svg` | `/assets/certified_wordmark_darkblue.svg` | Primary logo for light/white backgrounds. Full logotype with brandmark + "Certified" text in dark blue. |
| Wordmark (white) | `public/assets/certified_wordmark_white.svg` | `/assets/certified_wordmark_white.svg` | Logo for dark or colored backgrounds. White logotype variant. |
| Sign-in button | `public/assets/certified_sign_in_button_darkblue.svg` | `/assets/certified_sign_in_button_darkblue.svg` | "Sign in with Certified" button — see Section 3 for full integration spec. |

### Logo Clear Space

Maintain clear space around the logo equal to the height of the checkmark element on all sides. Never place the logo on busy imagery without a solid or semi-transparent backing.

---

## 3. "Sign in with Certified" Button

The sign-in button is the primary way most users first encounter the Certified brand — on partner platforms, not on certified.xyz itself. It must be treated with the same care as the logo.

### Asset

`public/assets/certified_sign_in_button_darkblue.svg` — dark navy pill-shaped button (rounded corners, 8px radius) with white text "Sign in with Certified" and the blue accent checkmark brandmark on the left.

### Integration Rules

| Rule | Specification |
|---|---|
| **Minimum width** | 200px — do not compress below this. |
| **Minimum height** | 40px |
| **Clear space** | Maintain at least 16px of empty space on all sides. |
| **Background context** | Place on white or light (#F7F8FA) backgrounds only. Do not place on images, patterns, or dark backgrounds. |
| **Do not modify** | Do not recolor, stretch, add effects, crop, or rearrange elements within the button SVG. Render it as-is. |
| **Hover state** | Slight lift: `transform: translateY(-1px)` + `box-shadow: 0 4px 12px rgba(15, 37, 68, 0.12)`. Transition 200ms ease-out. |
| **Active state** | `transform: translateY(0)` + shadow returns to resting. |
| **Focus ring** | 2px `--color-accent` outline, offset 2px (for keyboard navigation). |

### Don'ts

- Don't recreate the button in HTML/CSS — always use the SVG asset wrapped in a clickable element.
- Don't place text or other UI elements within the button's clear space.
- Don't display the button smaller than the minimum dimensions.
- Don't use a custom icon or wordmark in place of the provided SVG.

---

## 4. Color Palette

### 4.1 Core Brand Colors (extracted from SVGs)

```
Dark Navy      #0F2544    rgb(15, 37, 68)     — Primary brand color. Backgrounds, headers, text.
Accent Blue    #60A1E2    rgb(96, 161, 226)   — Checkmark accent. CTAs, links, interactive highlights.
White          #FFFFFF    rgb(255, 255, 255)   — Text on dark, cards, page backgrounds.
```

### 4.2 Extended Palette

These complement the core palette and provide the range needed for full UI design.

```
NEUTRALS
─────────────────────────────────────────────
Off-White      #F7F8FA    rgb(247, 248, 250)  — Page backgrounds, subtle cards.
Light Gray     #E2E5EB    rgb(226, 229, 235)  — Borders, dividers, disabled states.
Mid Gray       #8A92A0    rgb(138, 146, 160)  — Secondary text, placeholders, captions.
Dark Gray      #3B4251    rgb(59, 66, 81)     — Body text on light backgrounds.

ACCENT VARIATIONS
─────────────────────────────────────────────
Sky Blue       #A3CDF2    rgb(163, 205, 242)  — Hover states, light accent backgrounds.
Deep Blue      #1A3A6B    rgb(26, 58, 107)    — Hover/active states for dark elements.

SEMANTIC / FEEDBACK
─────────────────────────────────────────────
Success Green  #2ECC71    rgb(46, 204, 113)   — Verified badges, success messages.
Warning Amber  #F5A623    rgb(245, 166, 35)   — Pending states, caution alerts.
Error Red      #E74C3C    rgb(231, 76, 60)    — Validation errors, destructive actions.
Info Blue      #60A1E2    rgb(96, 161, 226)   — Reuse Accent Blue for informational alerts.
```

### 4.3 CSS Custom Properties

```css
:root {
  /* Core */
  --color-navy:        #0F2544;
  --color-accent:      #60A1E2;
  --color-white:       #FFFFFF;

  /* Neutrals */
  --color-off-white:   #F7F8FA;
  --color-light-gray:  #E2E5EB;
  --color-mid-gray:    #8A92A0;
  --color-dark-gray:   #3B4251;

  /* Accent Variations */
  --color-sky-blue:    #A3CDF2;
  --color-deep-blue:   #1A3A6B;

  /* Semantic */
  --color-success:     #2ECC71;
  --color-warning:     #F5A623;
  --color-error:       #E74C3C;
  --color-info:        var(--color-accent);
}
```

### 4.4 Tailwind Config Extension

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        navy:      '#0F2544',
        accent:    '#60A1E2',
        sky:       '#A3CDF2',
        deep:      '#1A3A6B',
        gray: {
          50:  '#F7F8FA',
          200: '#E2E5EB',
          400: '#8A92A0',
          700: '#3B4251',
        },
        success:   '#2ECC71',
        warning:   '#F5A623',
        error:     '#E74C3C',
      },
    },
  },
};
```

---

## 5. Typography

### Font Stack

| Role | Font | Fallback | Weight(s) |
|---|---|---|---|
| Headings | **Inter** | `system-ui, -apple-system, sans-serif` | 600 (Semibold), 700 (Bold) |
| Body | **Inter** | `system-ui, -apple-system, sans-serif` | 400 (Regular), 500 (Medium) |
| Monospace / Code | **JetBrains Mono** | `ui-monospace, 'Courier New', monospace` | 400 |

> Inter is chosen for its excellent readability, professional tone, and wide language support. Its geometric qualities pair well with the clean geometry of the Certified brandmark.

### Type Scale (rem, base 16px)

```
Display      3.0rem  / 48px    font-weight: 700   line-height: 1.1   letter-spacing: -0.02em
H1           2.25rem / 36px    font-weight: 700   line-height: 1.2   letter-spacing: -0.015em
H2           1.75rem / 28px    font-weight: 600   line-height: 1.3   letter-spacing: -0.01em
H3           1.375rem/ 22px    font-weight: 600   line-height: 1.4
H4           1.125rem/ 18px    font-weight: 600   line-height: 1.4
Body         1.0rem  / 16px    font-weight: 400   line-height: 1.6
Body Small   0.875rem/ 14px    font-weight: 400   line-height: 1.5
Caption      0.75rem / 12px    font-weight: 500   line-height: 1.4   letter-spacing: 0.02em
```

### Color Pairing Rules

- **Light backgrounds:** Use `--color-navy` for headings, `--color-dark-gray` for body text, `--color-mid-gray` for secondary text.
- **Dark / Navy backgrounds:** Use `--color-white` for headings and body, `--color-sky-blue` for secondary text and links.

---

## 6. Spacing & Layout

### Spacing Scale (8px base grid)

```
4px   0.25rem   xs       tight padding, icon gaps
8px   0.5rem    sm       inline element spacing
16px  1rem      md       default padding, card insets
24px  1.5rem    lg       section padding, card gaps
32px  2rem      xl       section breaks
48px  3rem      2xl      major section dividers
64px  4rem      3xl      hero top/bottom padding
96px  6rem      4xl      page section vertical rhythm
```

### Grid

- **Max content width:** 1200px (75rem), centered.
- **Columns:** 12-column grid for desktop, 4-column for mobile.
- **Gutter:** 24px (1.5rem).
- **Breakpoints:**

```
sm     640px
md     768px
lg     1024px
xl     1280px
```

---

## 7. Component Patterns

### 7.1 Buttons

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| **Primary** | `--color-accent` | `--color-white` | none | Lighten 8%, subtle lift shadow |
| **Secondary** | transparent | `--color-navy` | 1.5px `--color-navy` | Fill `--color-navy`, text white |
| **Ghost** | transparent | `--color-accent` | none | Background `--color-accent` at 10% opacity |
| **Destructive** | `--color-error` | `--color-white` | none | Darken 10% |

**Shared button styles:**
- Border radius: `8px`
- Padding: `12px 24px`
- Font: Inter 500, 16px
- Transition: `all 0.2s ease`
- Focus ring: 2px `--color-accent` offset 2px

### 7.2 Cards

- Background: `--color-white`
- Border: 1px `--color-light-gray`
- Border radius: `12px`
- Shadow (resting): `0 1px 3px rgba(15, 37, 68, 0.06)`
- Shadow (hover): `0 8px 24px rgba(15, 37, 68, 0.10)` — lift with `transform: translateY(-2px)`
- Padding: `24px`

### 7.3 Inputs

- Height: `48px`
- Border: 1.5px `--color-light-gray`
- Border radius: `8px`
- Focus: border transitions to `--color-accent`, faint blue glow `0 0 0 3px rgba(96, 161, 226, 0.15)`
- Error: border `--color-error`, message text below in `--color-error`

### 7.4 Badges / Status Chips

These are central to the Certified brand and should feel polished.

- **Verified:** Pill shape. Background `#E8F5E9` (success tint), text `#1B7A3D`, small checkmark icon leading.
- **Pending:** Background `#FFF3E0` (amber tint), text `#B37100`, clock icon leading.
- **Unverified:** Background `--color-off-white`, text `--color-mid-gray`, outlined style.

### 7.5 Profile Card (Portable Identity)

A reusable component for displaying a Certified user profile — used both on certified.xyz and within partner platforms.

- Avatar (circle, 48px) + display name (H4, navy) + handle (Body Small, mid-gray)
- Optional: verification badge inline with the name
- Optional: linked wallet indicator — small icon + truncated address in monospace caption
- Card wrapper follows 7.2 card styles
- On partner platforms, the profile card links back to the user's full Certified profile

---

## 8. Motion & Dynamics

The "dynamic" quality comes from purposeful, trust-building motion. The central metaphor is **portability and continuity** — identity that moves seamlessly between contexts.

### Principles

1. **Purposeful motion:** Animate to guide attention and confirm actions — never purely decorative.
2. **Portability metaphors:** Motion should suggest connection, flow, and arrival. Profiles appearing, data syncing, identity confirmed. Avoid chaotic or fragmented motion.
3. **Ease and confidence:** Use `ease-out` curves that settle smoothly. Avoid bounce or overshoot.
4. **Speed:** Keep transitions under 300ms for UI elements. Page transitions up to 500ms.

### Standard Transitions

```css
/* Micro-interactions (hovers, focus, toggles) */
--transition-fast: 150ms ease-out;

/* Component state changes (cards lifting, modals) */
--transition-base: 250ms ease-out;

/* Page-level (section reveals, route transitions) */
--transition-slow: 400ms cubic-bezier(0.16, 1, 0.3, 1);
```

### Recommended Animations

| Context | Animation | Details |
|---|---|---|
| **Hero section** | Staggered fade-up | Headline, subtext, and CTA fade in and slide up 20px sequentially (100ms stagger). |
| **Scroll reveals** | Fade-up on intersect | Cards and sections fade in + translate Y 30px as they enter viewport. Use `IntersectionObserver`. Trigger once. |
| **Sign-in success** | Checkmark draw-on | After successful "Sign in with Certified", animate the checkmark path using `stroke-dashoffset` (~600ms ease-out). Confirms identity is connected. |
| **Profile arrival** | Slide-in + fade | When a user's portable profile loads on a partner platform, the profile card slides in from the left (20px) and fades in over 300ms. Suggests the identity "arrived" from elsewhere. |
| **Cross-platform continuity** | Connected dots / flow line | On marketing pages, animate a subtle line or dot trail connecting platform logos. Suggests data flowing between apps. SVG path animation, 1.5s ease-in-out. |
| **Hover — cards** | Lift + shadow | `transform: translateY(-2px)` and expanded shadow over 200ms. |
| **Hover — buttons** | Subtle glow | Primary buttons gain a soft `box-shadow` glow of the accent color. |
| **Loading** | Pulsing brandmark | Use `certified_brandmark.svg` with a gentle opacity pulse (0.4 → 1.0, 1.5s loop). |
| **Stats** | Number tick-up | Counters animate from 0 to value using `requestAnimationFrame`, ~800ms. |
| **Page transitions** | Crossfade | 300ms opacity crossfade between routes. |

### Reduced Motion

Always respect `prefers-reduced-motion: reduce`. Disable transforms and opacity animations; keep instant state changes.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Iconography

- **Style:** Outlined, 1.5px stroke, rounded caps and joins. Consistent with the clean geometry of the brandmark.
- **Recommended set:** [Lucide Icons](https://lucide.dev) — pairs well with Inter and the Certified aesthetic.
- **Size grid:** 16px (inline), 20px (default), 24px (prominent).
- **Color:** Inherit from parent text color by default. Use `--color-accent` for interactive icon-only buttons.

---

## 10. Imagery & Illustration

- **Photography:** Use real photography of people, workspaces, and impact-oriented scenes (conservation, community, research). Desaturate slightly and apply a subtle cool-tone grade to keep images cohesive with the navy/blue palette.
- **Illustrations:** If used, opt for flat geometric line illustrations in `--color-navy` and `--color-accent` on white. Diagrams showing connected nodes or flowing data are on-brand. Avoid rounded/bubbly cartoon styles.
- **Backgrounds:** Subtle geometric patterns, node-and-edge motifs, or a faint grid in `--color-light-gray` can reinforce precision, structure, and interconnection.

---

## 11. Surfaces & Elevation

| Level | Usage | Shadow |
|---|---|---|
| 0 | Page background | None. `--color-off-white` or `--color-white`. |
| 1 | Cards, input containers | `0 1px 3px rgba(15, 37, 68, 0.06)` |
| 2 | Dropdowns, popovers | `0 4px 12px rgba(15, 37, 68, 0.10)` |
| 3 | Modals, dialogs | `0 16px 48px rgba(15, 37, 68, 0.16)` |
| 4 | Toast notifications | `0 8px 24px rgba(15, 37, 68, 0.14)` |

Shadows always use the navy color as a base (not pure black) for cohesion.

---

## 12. Dark Mode Guidance

| Token | Light Value | Dark Value |
|---|---|---|
| Page background | `#FFFFFF` | `#0B1929` (deeper than navy) |
| Surface / Cards | `#F7F8FA` | `#0F2544` (navy) |
| Primary text | `#0F2544` | `#F7F8FA` |
| Secondary text | `#8A92A0` | `#8A92A0` (unchanged) |
| Accent | `#60A1E2` | `#60A1E2` (unchanged) |
| Borders | `#E2E5EB` | `#1A3A6B` |

The accent blue and semantic colors remain the same across modes for brand consistency.

---

## 13. Sample Page Structure (certified.xyz)

```
┌──────────────────────────────────────────────────────┐
│  NAVBAR   [brandmark + wordmark]     Links     [CTA] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  HERO — full-width, navy background                  │
│    "Your identity, everywhere."                      │
│    Subtext (sky-blue): portable profiles,            │
│    contributions, and trust across the ecosystem     │
│    Primary CTA: "Get Started" + Secondary: "Learn    │
│    More"                                             │
│    Right side: animated illustration — profile card  │
│    appearing across multiple platform frames         │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ECOSYSTEM BAR — "Works across the ecosystem"        │
│  Partner platform logos (Ma Earth, GainForest,       │
│  Silvi, Hyperboards, etc.) in grayscale, light gray  │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  FEATURES — 3-col card grid on white                 │
│  Cards lift on hover. Map to real services:          │
│                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Portable     │ │ Data        │ │ Identity     │   │
│  │ Profiles     │ │ Hosting     │ │ Link         │   │
│  │              │ │ (PDS/SDS)   │ │ (ATProto↔EVM)│   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ AppView API  │ │ Storage     │ │ Data         │   │
│  │ (Hypergoat)  │ │ Link        │ │ Plugins      │   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  HOW IT WORKS — 3 numbered steps, alternating layout │
│  1. Sign in with Certified on any partner platform   │
│  2. Your profile and contributions sync everywhere   │
│  3. Receive funding, recognition, and trust          │
│  Staggered scroll-reveal + connected flow line       │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  STATS / SOCIAL PROOF — navy background              │
│  Large animated counters (white):                    │
│  "X profiles" · "Y platforms" · "Z contributions"    │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  FOR DEVELOPERS — light section                      │
│  "Build on Certified" — brief pitch for platform     │
│  builders. Link to developer docs. Code snippet      │
│  showing Sign-in integration.                        │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  CTA SECTION — accent blue gradient background       │
│  "Join the ecosystem" + Primary button (white)       │
│                                                      │
├──────────────────────────────────────────────────────┤
│  FOOTER — navy background, white text                │
│  Links, legal, social icons, wordmark (white)        │
│  Link to Hypercerts documentation                    │
└──────────────────────────────────────────────────────┘
```

---

## 14. Partner Integration Guidelines

Certified lives primarily inside other applications. This section defines how the brand should appear on third-party platforms.

### 14.1 "Sign in with Certified" Placement

- Use the official SVG button asset (see Section 3). Do not recreate.
- Place prominently on the sign-in/sign-up page — same visual hierarchy as "Sign in with Google" or similar.
- On pages with multiple auth options, Certified should be visually consistent in size with other provider buttons.

### 14.2 Displaying Certified Profiles on Partner Platforms

When a user signs in with Certified, the partner platform may display their portable profile:

- **Profile badge:** Use the brandmark (`certified_brandmark.svg`) at 16–20px inline next to the user's display name to indicate a Certified identity. Tooltip: "Verified with Certified".
- **Profile card:** Follow the Profile Card component spec (Section 7.5). Link the card back to the user's full profile on certified.xyz.
- **Do not** modify the brandmark colors or add effects. Render at provided aspect ratio.

### 14.3 Co-Branding Rules

- The Certified logo should never be larger than the partner's own logo on their platform.
- Maintain clear space (Section 2) around the Certified brandmark/wordmark at all times.
- When listing Certified as a partner or integration, use the wordmark (dark blue on light backgrounds, white on dark backgrounds) — not the brandmark alone.
- Do not combine the Certified logo with the partner logo into a single composite mark.

### 14.4 Attribution Line

Partner platforms should include a subtle attribution line near sign-in or profile areas:

```
Powered by Certified · certified.xyz
```

Style: Caption size (12px), `--color-mid-gray`, Inter 500. Links to certified.xyz.

---

## 15. Voice & Copy Guidelines

Certified's UI should feel as effortless as signing into a mainstream consumer app. The copy principles below apply to all user-facing text on certified.xyz and in partner-facing integration guides.

### Tone

- **Simple and direct.** Short sentences. Plain language.
- **Confident but not loud.** Trust comes from clarity, not exclamation marks.
- **Warm, not corporate.** "Your profile works everywhere" not "Leverage our cross-platform identity infrastructure."

### Jargon Rules

The following terms are **internal/developer-only** and should NEVER appear in end-user UI, marketing copy, hero text, onboarding flows, or tooltips:

| Internal Term | What to Say Instead (user-facing) |
|---|---|
| ATProto / AT Protocol | *(don't mention — it's invisible infrastructure)* |
| Hypercerts protocol | *(don't mention unless in developer docs)* |
| PDS / Personal Data Server | "your data" or "your account" |
| SDS / Shared Data Server | "shared workspace" or "team data" |
| EVM / EVM wallet | "wallet" or "funding address" |
| IdentityLink | "connected wallet" or "linked wallet" |
| AppView / Hypergoat | *(never user-facing)* |
| StorageLink | "backup" or "permanent record" |
| Decentralized / Web3 / Blockchain | *(avoid — explain the benefit, not the mechanism)* |

**The principle:** Describe what it does for the user, not how it works. Users should understand Certified without learning a single protocol term.

### Example Copy

- Hero: "Your identity, everywhere." / "One profile. Every platform."
- Sub-hero: "Sign in once. Your contributions, reputation, and impact follow you across the ecosystem."
- Feature card: "Your data, your control" (not "Personal Data Server hosting")
- Onboarding: "Connect your wallet to receive funding for your contributions." (not "Link your EVM address via IdentityLink")

---

## 16. Accessibility Checklist

- All color pairings meet WCAG 2.1 AA contrast (4.5:1 for body text, 3:1 for large text).
  - `#0F2544` on `#FFFFFF` → **15.7:1** ✓
  - `#FFFFFF` on `#0F2544` → **15.7:1** ✓
  - `#60A1E2` on `#0F2544` → **4.7:1** ✓ (large text / icons)
  - `#3B4251` on `#FFFFFF` → **9.8:1** ✓
- Focus indicators on all interactive elements (2px accent ring, offset 2px).
- All images have descriptive alt text.
- Semantic HTML: proper heading hierarchy, landmark regions, ARIA labels on icons.
- Keyboard navigation fully supported for all interactive components.
- `prefers-reduced-motion` respected as described in Section 8.

---

*This document is the source of truth for visual and interaction design across all Certified digital products. When in doubt, default to clarity, trust, and restraint.*
