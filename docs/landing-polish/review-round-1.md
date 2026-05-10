# Review round 1 — feat/landing-polish

Three reviewers (brand voice + spec correctness, build/framework, a11y/SEO) ran in parallel against `docs/landing-polish/plan.md`. Verdicts: brand `iterate-before-impl`; build and a11y `ship-then-fix-nits`. Items below are tracked as accepted (acted on this round) or rejected (with rationale).

## Accepted

| # | Source | Item | Action |
|---|---|---|---|
| A1 | Brand #2 | Cut "One account across apps" instead of "Simple sign-in" — the former duplicates the hero h1 (`One account. Any app.`); the latter is the only card on the section that names the sign-in mechanic | Swap the planned cut. Keep "Simple sign-in" with its existing copy. |
| A2 | Brand #3 | Inter weight 700 violates DESIGN.md Weight-Ceiling-on-Inter Rule ("Inter never reaches 700"). The display-position carve-out in the plan is rule-bending. | Step numerals become **Noto Serif weight 700, tabular** (`font-feature-settings: 'tnum' 1`), set in `--fg-muted`. Honors One-Italic Rule (no italic), honors Weight-Ceiling-on-Inter Rule (700 only on Noto Serif). User's intent (non-italic, tabular, heavy) preserved exactly. |
| A3 | Brand #5 | Plan flagged partner-apps footnote and CTA section but didn't land replacements | Resolved with user: footnote becomes `The list grows.`; CTA becomes h2 `Create your account.` / sub `One email. One code. One minute.` |
| A4 | Build #1 | Acceptance grep `grep -nE "—|–" src/app/welcome src/components/landing src/app/layout.tsx` is missing `-r` and silently passes on nested files | Update acceptance criterion to use `grep -rnE "—|–" ...` and to scope file types (`.tsx`, `.ts`) so JS-comment dashes in `orbiting-logos.tsx:172` (out of scope) don't fail the audit |
| A5 | Build #6 | `.landing-bento` is fixed 2-column equal-cell grid; a wide intro card needs new CSS (`grid-column: 1 / -1`). Plan glossed this | Constrain the reshape to **3 same-cell cards with internal-layout variation only**. No new CSS surface area. The cut goes from 4 to 3 cards (already changes the visual rhythm); internal variation lands the rest. |
| A6 | Build #8 | Shared button refactor needs explicit prop signature; otherwise authors will inline `className` and lose the BEM contract | New component takes `variant: "hero" \| "cta"` prop, mapping internally to `hero__actions` vs `landing-cta__actions` wrapper class. No external `className` prop. |
| A7 | Build #9 | `landing-bento__card--highlight` modifier is orphan CSS today | Apply the modifier to one of the three remaining cards as part of the internal-layout variation. (Resolves orphan; serves the no-identical-cards-grid acceptance test.) |
| A8 | A11y #4 | `aria-label="Sign in with Certified"` must be preserved on extraction; both call sites currently carry it | Acceptance criterion explicitly added: shared button renders an element with accessible name `Sign in with Certified` on both call sites. Verified by impl-review snapshot. |
| A9 | A11y #8 | Pre-existing WCAG 1.3.1 violation: `how-it-works.tsx` and `built-for-trust.tsx` skip from h2 to h4 | Folded in: change h4 to h3 in both files (~6 lines). Eyebrow-drop edits are already touching these files; natural moment to fix. |
| A10 | A11y #9 | Plan lacks a11y-specific verification | Add: `npx pa11y http://localhost:3000/welcome` (or axe-core via DevTools) returns zero `heading-order` violations. JSON-LD freshness check via `curl /welcome \| grep` confirming dash-free FAQ answer text. |

## Rejected

| # | Source | Item | Rationale |
|---|---|---|---|
| R1 | Brand #1 | Hero subtitle `Your identity and data, everywhere you go.` is weaker than the original modulo the dash; reviewer suggests `Your identity and your data travel with you.` or `One identity. Every app. Yours to keep.` | User explicitly picked the comma version after seeing two alternatives. Voice judgment is the user's call; the comma version honors the no-em-dash rule and preserves the user's preferred phrasing. |
| R2 | Brand #4 | `Our Principles` eyebrow is templated and should also be dropped | User's resolved eyebrow policy keeps the three brand-coherent eyebrows including `Our Principles`. Reviewer's argument has weight ("Built on AT Protocol" and "Ecosystem" are factual labels, "Our Principles" editorializes), but re-litigating the policy mid-PR introduces decision fatigue. Carry as a future-pass nit. |
| R3 | Brand "out of scope" | `built-for-trust.tsx` icon SVGs (globe, chevron, eye-with-iris) are stock-vector trust-signaling and don't match DESIGN.md's Lucide-stroke convention | Reviewer flagged out of scope. Confirmed out of scope for this PR. Worth a separate visual-pass PR (replace with Lucide `Globe`, `ArrowRightFromLine`, `Eye`/`ScanLine`). |
| R4 | Brand "out of scope" | Hero `Built on AT Protocol` eyebrow placement above h1 is not strictly sanctioned by DESIGN.md (which places eyebrows in landing-section headers, not hero) | Out of scope. Worth revisiting in a hero-composition pass. |
| R5 | Brand "out of scope" | Hero `hero__pattern` SVG (grid + concentric circles + diagonals) is decorative ink in a restraint-first system | Out of scope per plan. Flag for a future trim. |
| R6 | Build #4 | `welcome/page.tsx` overrides `title` with a literal string; the title template doesn't apply to `/welcome`. The four em-dashed strings need independent edits | Already covered by the plan's track table. Not a new finding; confirmation only. |
| R7 | Build #11 | `orbiting-logos.tsx:172` em dash in a JS comment fails the original acceptance grep | Resolved by A4 (scope grep to `.tsx`/`.ts` source paths under `src/components/landing/sections`, `src/components/landing/landing-page.tsx`, `src/app/welcome`, `src/app/layout.tsx`). Code comments in unrelated files are out of scope. |
| R8 | A11y #2 | `metadata.description` and `softwareAppJsonLd.description` are duplicated string literals in `welcome/page.tsx` | Out of scope. Both are currently dash-free, so no rule violation in this PR. Worth extracting to a `DESCRIPTION` const in a follow-up. |
| R9 | A11y #5 | Partner logo `alt={\`${app.name} logo\`}` should drop the "logo" suffix per axe-core's `image-redundant-alt` | Out of scope. Cheap fix; carry to a future pass. Not a regression. |
| R10 | A11y #6 | Three-step flow in `how-it-works.tsx` should be `<ol>` with `<li>` for list semantics | Out of scope. Pre-existing structural issue; bigger structural change than fits this polish. Carry as follow-up. |
| R11 | A11y "pre-existing" | `<img>` instead of `next/image` for the static "Sign in with Certified" SVG | Out of scope. Perf nit. Static SVG, small. Carry as follow-up. |

## Round 2?

Per workflow rule: "Run a follow-up round only if round 1 surfaced ≥5 substantive items — otherwise stop." Substantive items here (Important): A1, A2, A4, A5, A8, A9 = six. **However**, all six are concrete and already integrated; the next round would be checking my integration, not surfacing new design judgment. Per the same rule, "Stop reviewing when the next pass would be nit-picking." Implementation review (post-impl, separate round) is the better cycle. **Skipping plan-review round 2.**

## Substantive items folded in but not the focus

Pre-existing issues the a11y reviewer surfaced and the plan now addresses opportunistically (because the same files are open):

- **Heading skip h2 → h4** (A9). Rectified in `how-it-works.tsx` and `built-for-trust.tsx` only. Other surfaces with the same pattern are out of scope for this PR.

## Carryover follow-ups (not in this PR)

- `built-for-trust.tsx` icons → Lucide (R3)
- Hero composition trim (`hero__pattern` simplification, eyebrow placement audit) (R4, R5)
- `<ol>` semantics for `how-it-works.tsx` (R10)
- `<img>` → `next/image` on sign-in button (R11)
- `metadata.description` extraction (R8)
- Partner-logo `alt` dedup (R9)
- `Our Principles` eyebrow re-evaluation (R2)
