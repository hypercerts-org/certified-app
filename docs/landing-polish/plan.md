# Plan: Flagship polish pass on the landing page

Branch: `feat/landing-polish` (off `staging`)
Quality bar: flagship (per `/impeccable polish` interview, 2026-05-10)
Scope: `/welcome` (the public landing surface), brand register

## Why

The landing page is the brand register's only fold of attention. PRODUCT.md and DESIGN.md are now committed, so we can name the drift precisely against the design system rather than against vibes. Three categories of issues are present:

1. **Hard rule violations** in shipping copy and CSS that contradict PRODUCT.md and DESIGN.md (em dashes, One-Italic Rule, Flat-By-Default Rule, identical-card-grids absolute ban).
2. **SaaS-template eyebrows and copy** that read as auto-generated rather than as the foundation-letter voice the brand register requires ("Your Benefits", "Simple Process", "Common Questions", "Get Started", "Ready to get started?", "More apps coming soon.").
3. **Composition monotony**: identical 96px section padding everywhere, four same-shape bento cards, two near-identical CTA components.

The goal is not redesign. It is to bring the page into alignment with the system that now exists, with brand-register voice tightened.

## Out of scope

- Redesigning the hero composition. The `hero__pattern` SVG (grid + concentric circles + diagonals) is a candidate for review but **not** a candidate for replacement in this pass. Touch only if the change is a pure simplification (remove diagonals or one circle), not a rework.
- Restyling Footer or Navbar. Both are global, used outside `/welcome`.
- Authenticated dashboard, Settings, Groups, Profile. Product register, not in scope.
- Adding partner-app artwork, hero photography, or any new imagery. Brand register is typographic.
- Replacing the `<a class="hero__btn-signin">` static-SVG sign-in button with a styled `<Button>` component. The static SVG is the "Sign in with Certified" partner-recognizable mark. Touching it is a separate identity decision.
- Dark mode. Light-only per DESIGN.md.
- The `tailwind.config.ts` stale-tokens cleanup. That is its own PR; AGENTS.md §0 already flags it.
- Migrating BEM-style landing CSS to use the semantic token layer (`--bg-canvas`, `--fg-primary`, ...). DESIGN.md describes target state; that migration is a token-refactor PR, not a polish PR.

## Acceptance criteria

Updated after `review-round-1.md` (2026-05-10).

- `grep -rnE "—|–" src/app/welcome src/components/landing/landing-page.tsx src/components/landing/sections src/app/layout.tsx --include='*.tsx' --include='*.ts'` returns zero hits in copy or metadata. (En-dashes also banned per DESIGN.md.) Code-comment dashes in unrelated files are out of scope.
- `grep -n "Instrument Serif\|--font-serif-alt" src/app/globals.css` returns hits only in contexts that match the One-Italic Rule (display-italic accent inside Noto Serif headlines). Specifically: `.landing-protocol__num` no longer references it.
- `grep -n "box-shadow" src/app/globals.css` shows shadows on floating elements only, not on resting cards. The `.landing-bento__card:hover` shadow is gone. (Other landing hovers use color/opacity transitions, not shadows; no other removals needed per build review.)
- The four bento cards in `what-you-get.tsx` are reduced to **three same-cell cards with internal-layout variation** (no `grid-column: 1 / -1` or new CSS surface area). The cut card is "One account across apps" (it duplicates the hero h1 `One account. Any app.`); the remaining three are "Your profile travels with you", "You stay in control", "Simple sign-in", with at least one applying the existing `landing-bento__card--highlight` modifier.
- The "How it works" 01/02/03 step numbers are set in **Noto Serif weight 700, tabular numerals** (`font-feature-settings: 'tnum' 1`), color `--fg-muted`. Removes the One-Italic Rule violation; honors the Weight-Ceiling-on-Inter Rule (700 reserved for Noto Serif).
- `h4` elements in `how-it-works.tsx` and `built-for-trust.tsx` are upgraded to `h3` to repair the pre-existing h2-skips-to-h4 WCAG 1.3.1 violation.
- The FAQ section eyebrow `Common Questions` is removed; h2 stays `Frequently asked questions`.
- Eyebrows `Your Benefits`, `Simple Process`, `Common Questions`, `Get Started` are removed. Eyebrows `Built on AT Protocol`, `Ecosystem`, `Our Principles` stay.
- Hero subtitle is `Your identity and data, everywhere you go.` (comma replaces em dash; copy preserved).
- Partner-apps footer becomes `The list grows.`
- CTA section becomes h2 `Create your account.` and sub `One email. One code. One minute.`
- Tab title `<title>` rendered for `/welcome` is a single sentence with no em dashes. The `metadata.title.template` in `layout.tsx` becomes `"%s · Certified"` (U+00B7 middle dot).
- A new shared component `src/components/landing/sign-in-with-certified-button.tsx` exposes a single API: `<SignInWithCertifiedButton variant="hero" | "cta" />`. Both call sites use it. The shared component renders an element with accessible name `Sign in with Certified` (preserved from both originals).
- `npx pa11y http://localhost:3000/welcome` (or axe-core run via DevTools) reports zero `heading-order` violations on `/welcome`.
- `curl -s http://localhost:3000/welcome | grep -F '"FAQPage"'` returns the JSON-LD block, and `curl -s http://localhost:3000/welcome | grep -c "—"` returns `0`.
- `npm run build` passes. `npx tsc --noEmit` shows no new errors against the pre-change baseline (baseline: zero errors per build-reviewer audit). ESLint (`npm run lint`) passes.

## Files in scope (disjoint)

| Track | File | Edits |
|---|---|---|
| **Copy + metadata** | `src/app/welcome/page.tsx` | Replace em-dashes in `metadata.title`, `openGraph.title`, `openGraph.images[0].alt`, `twitter.title` |
| | `src/app/layout.tsx` | Replace `template: "%s — Certified"` with a non-em-dash separator |
| | `src/components/landing/landing-page.tsx` | Rewrite hero subtitle (remove em dash, stronger line) |
| | `src/components/landing/sections/faq-content.tsx` | Replace em dash in answer; resolve eyebrow / heading restate |
| | `src/components/landing/sections/built-for-trust.tsx` | Tighten or drop "Our Principles" eyebrow if it doesn't earn its keep |
| | `src/components/landing/sections/how-it-works.tsx` | Tighten or drop "Simple Process" eyebrow; keep current intro line |
| | `src/components/landing/sections/what-you-get.tsx` | Drop or tighten "Your Benefits" eyebrow; rework the 4-card grid (see Cards track) |
| | `src/components/landing/sections/partner-apps.tsx` | Tighten "More apps coming soon." footnote |
| | `src/components/landing/sections/ready-cta-content.tsx` | Tighten "Ready to get started?" / "Create your account in under a minute." copy |
| **Cards / structure** | `src/components/landing/sections/what-you-get.tsx` | Break the icon-on-top template: introduce intentional shape variation (one wide intro card spanning both columns, three short cards below with different internal layouts; or apply the existing `landing-bento__card--highlight` modifier to one card and vary internal shape on the others). Final shape decided in implementation, but the test is "not four identical cards" |
| **Component dedup** | `src/components/landing/sign-in-with-certified-button.tsx` (new) | Extract shared button used by hero and ready-cta. Single API: `<SignInWithCertifiedButton variant="hero" \| "cta" />`, mapping to `hero__actions` vs `landing-cta__actions` wrapper internally. Preserves `aria-label="Sign in with Certified"` from both originals. No external `className` prop. |
| | `src/components/landing/hero-signin-button.tsx` | Replace body with `<SignInWithCertifiedButton variant="hero" />` (or delete if landing-page.tsx switches the call site directly) |
| | `src/components/landing/sections/ready-cta-button.tsx` | Same with `variant="cta"` |
| **A11y heading hierarchy** | `src/components/landing/sections/how-it-works.tsx` | Change three step `<h4>`s to `<h3>` (repairs the pre-existing h2-skips-to-h4 WCAG 1.3.1 issue) |
| | `src/components/landing/sections/built-for-trust.tsx` | Change three trust-item `<h4>`s to `<h3>` (same) |
| **CSS drift** | `src/app/globals.css` | Remove `box-shadow` from `.landing-bento__card:hover`; rework `.landing-protocol__num` to **Noto Serif weight 700 tabular** (drop italic + drop `--font-serif-alt`); ensure the `.landing-bento__card--highlight` styles still apply correctly when the modifier is used in the reshape; no new CSS for bento layout (3 same-cell cards, no wide-span modifier). |

Two tracks edit `what-you-get.tsx` (Copy and Cards). They are sequential, not parallel: Copy first (eyebrow + a heading tweak), then Cards (rework markup). Easier to keep one author for that file.

## Implementation tracks (parallel where safe)

This is small enough to run as one author, sequentially. No parallel-track partitioning needed; the file count is high but the per-file change is small.

Order of work:
1. Copy + metadata (mechanical, lowest risk)
2. CSS drift (straightforward token edits)
3. Cards rework (the design judgment call)
4. Component dedup (refactor)
5. Verify locally

## Resolved product decisions (2026-05-10)

User confirmed each in the `/impeccable polish` interview.

- **Hero subtitle.** New line: `Your identity and data, everywhere you go.` (comma replaces the em dash; meaning preserved).
- **Title separator.** `metadata.title.template` becomes `"%s · Certified"` (U+00B7 middle dot). Replaces the em dash globally for every page that uses the template.
- **Eyebrow policy.** Drop the four SaaS-template eyebrows: "Your Benefits", "Simple Process", "Common Questions", "Get Started". Keep "Built on AT Protocol", "Ecosystem", "Our Principles". The four affected sections lead with the h2 only.
- **`How it works` numerals.** Replace italic Instrument Serif `01` `02` `03` with **Noto Serif weight 700, tabular numerals** (`font-feature-settings: 'tnum' 1`), set in `--fg-muted`. **Corrected after review-round-1 A2**: original plan offered Inter weight 700 which violates the Weight-Ceiling-on-Inter Rule. Noto Serif honors both the One-Italic Rule (no italic) and the Weight-Ceiling Rule (700 only on Noto Serif). User's intent (non-italic, tabular, heavy) preserved exactly.
- **FAQ heading dedup.** Falls out of eyebrow policy: `Common Questions` is dropped; h2 stays as `Frequently asked questions`.
- **`What you get` reshape (assistant call, sharpened by review).** Drop **"One account across apps"** (it duplicates the hero h1 `One account. Any app.`); the remaining three cards vary internal layout while staying within `.landing-bento`'s 2-column equal-cell grid (no new CSS surface). **Corrected after review-round-1 A1**: original plan cut "Simple sign-in", but that card names the actual mechanic and is the only how-it-works promise on the section. The remaining three:
  - "Your profile travels with you" — apply `landing-bento__card--highlight` modifier (resolves the orphan CSS modifier; serves as the single dark-fill card breaking the visual rhythm).
  - "You stay in control" — heading-first, body in `--fg-secondary`. Standard layout.
  - "Simple sign-in" — flip the layout: lead with the body (`We email you a one-time code.`) at body-large size, h3 below as the consequence (`No passwords.`).
  
  Final internal shapes are author judgment within the constraint that no two cards repeat the icon-on-top + heading + body template.
- **Partner-apps footnote.** Replace `More apps coming soon.` with `The list grows.`
- **CTA section copy.** Replace h2 `Ready to get started?` and sub `Create your account in under a minute.` with h2 `Create your account.` and sub `One email. One code. One minute.`

## Risks

- **Copy regressions on a public marketing page.** Mitigated by user-confirmed copy before edit.
- **Identity-link button behavior.** Extracting the shared component must preserve `openSignIn` and `openSignInModal("atproto")` exactly. No behavior change is allowed in this pass.
- **FAQ JSON-LD reads from `FAQ_ITEMS`.** Editing answers also edits SEO. Acceptable; the dash removal is a fix.
- **Section padding changes.** A 64px-vs-96px tweak can interact with the alternating dark/light/subtle background rhythm; verify rendered.

## Rollback plan

Single-PR change, on a feature branch, behind a Draft PR. Rollback is `git revert <merge-commit>` once merged. No flags, no migrations, no DB writes. Trivial.

## Verification

- `npm run lint` passes.
- `npx tsc --noEmit` no new errors vs the baseline before this branch.
- `npm run build` passes.
- Dev server renders `/welcome` with no console errors and no layout shift on first paint.
- `prefers-reduced-motion` still disables hero reveals.
- Curl audit: zero em or en dashes in `/welcome` rendered HTML body or `<head>` metadata.
- Tab title is a single sentence with no double-clause em-dashing.
