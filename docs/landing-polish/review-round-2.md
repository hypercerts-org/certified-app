# Review round 2 — feat/landing-polish (post-implementation)

Three reviewers (code quality, functional/UX, brand voice + render) ran in parallel against the implementation commit `bf01261 chore(landing): polish /welcome against PRODUCT and DESIGN`. Verdicts: code-quality `ship`, functional `ship-then-fix-nits`, brand `ship-then-fix-nits`. Items below are tracked as accepted (acted on this round) or rejected.

## Accepted

| # | Source | Item | Action |
|---|---|---|---|
| A1 | Functional #3 | Hero stagger broke for the 4th child. The `<SignInWithCertifiedButton>` div is now `.hero__inner > :nth-child(4)`, with `.hero-reveal` class. The CSS at `globals.css:596-598` only delays children 1/2/3, so the button fades in at 0ms (synchronized with the label) instead of after the subtitle. | Add `.hero__inner > .hero-reveal:nth-child(4) { animation-delay: 250ms; }` to globals.css. One line, restores the staggered cascade label → title → subtitle → button. |
| A2 | Brand #1 | Orphan h4 CSS. Markup is now h3 in `how-it-works.tsx` and `built-for-trust.tsx` (commit's heading-hierarchy fix). Globals.css still selects `h4` at lines 1712 (`.landing-protocol__step h4`) and 1890 (`.landing-trust__item h4`). The new h3 elements render with browser-default sizing instead of the system's `1.125rem` weight 700. Visually close but unintended drift, and a real regression on built-for-trust where the h4 was in light text on dark background and the size mismatch will be visible. | Update both selectors from `h4` to `h3`. Two-line CSS change. |
| A3 | Functional #1 | Bento grid orphan cell. With three cards in `grid-template-columns: repeat(2, 1fr)`, the desktop layout is `[card] [card] / [card] [empty]`. Reads as designed asymmetry to one reviewer, accidental orphan to another; the safe call for a public marketing page is to remove the orphan. | Switch `.landing-bento` to `grid-template-columns: repeat(3, 1fr)` at desktop (mobile 1fr stays). Three cards now fill a single row; no orphan. One-line CSS change. Plan's "no new CSS surface" constraint relaxed slightly for a real visual issue, recorded here. |
| A4 | Functional #2 | "No passwords." card visual flip. Plan called for body-then-h3 inversion; markup achieves that, but with `flex-direction: column; justify-content: flex-start;` the h3 sits in the middle of a min-height-200px card with empty space below, reading as accidental rather than intentional. | Add `.landing-bento__card--flipped { justify-content: space-between; }` to globals.css; apply the modifier to the third card. Three-line CSS + one markup token. The h3 now sits at the bottom as the punchline. |
| A5 | Code quality #1 | Plan/impl token mismatch. Plan A2 specified `--fg-muted` for the step-numeral color; impl used `--color-mid-gray` because `--fg-muted` is target-state from DESIGN.md and not yet defined in `globals.css` (the semantic-token migration is out of scope per plan line 26). Reviewer flagged this as worth reconciling. | Add a one-sentence note in the PR body and the next plan revision: `--color-mid-gray` is the legacy alias used until the semantic-token PR lands; the target is `--fg-muted`. No code change. |

## Rejected

| # | Source | Item | Rationale |
|---|---|---|---|
| R1 | Brand #2 | Dead protocol-card italic CSS at `globals.css:1765` (`.landing-protocol__card-logo`) and `:1812` (`.landing-protocol__card-sig`) — no markup uses these classes anywhere in `src/`. | Out of scope. The orphan CSS predates this PR and isn't a regression. Carry as a future-pass nit (CSS-cleanup PR). The polish does not introduce these. |
| R2 | Brand #3 | `.landing-bento__card p` has no `max-width`. At 1536px container × 2 cols, theoretical line approaches 85-90ch. Current copy is short single sentences and never wraps. | Out of scope. Defensive guard, not a current issue. With the A3 switch to 3 columns, the per-card width drops further, making the concern even more theoretical. |
| R3 | Functional #5 | Stale `HeroSignInButton`/`ReadyCtaButton` errors in `/tmp/certified-dev.log` from earlier compile cycles. | Not a code issue. Log file from before the rename. Current GETs return 200; HMR has already loaded the new files. Will clear naturally on next dev-server restart. No action. |
| R4 | Code quality #2 | Naming verbosity of `sign-in-with-certified-button.tsx`. | Reviewer themselves recommended keep-as-is (the brand-mark association justifies the length). Confirmed; no action. |
| R5 | Code quality #3 | `Variant` type is local-only, not exported. | Reviewer themselves rated as no-action; matches sibling `SignInModal`'s pattern. Confirmed. |

## Round 3?

Per workflow rule: "Run a follow-up round only if round 1 surfaced ≥5 substantive items — otherwise stop." Round 2 surfaced four substantive items (A1-A4), all concrete and mechanical. The round-3 question is whether the four fixes actually land. That is verifiable directly via the curl + lint + tsc + build audit, not via another reviewer pass. **Skipping round 3.**

## What round 2 confirmed working (carry-overs from the commit)

- Behavior preservation on the shared button: identical `aria-label`, `alt`, click handlers on both call sites. Code-quality reviewer diffed against the deleted files and confirmed zero drift.
- Tab title `One account, any app · Certified` (single brand, single bullet).
- Zero em or en dashes anywhere in rendered HTML body or head.
- FAQ accordion ARIA wiring intact after the eyebrow drop.
- Heading hierarchy h1 → h2 → h3 with no skips.
- Orphan CSS modifier `.landing-bento__card--highlight` is now reachable.
- All twelve named DESIGN.md rules check pass on the rendered page (brand reviewer's full table).
- Hero subtitle, CTA copy, and partner footnote land the brand voice (foundation-letter, not generic-marketing).

## Carryover follow-ups (still not in this PR)

Same as round 1, plus:
- Dead protocol-card italic CSS (R1)
- `.landing-bento__card p` max-width (R2)
- Tail-of-log noise in `/tmp/certified-dev.log` clears on next dev-server restart (R3)
- Semantic-token migration (`--fg-muted` etc.) — separate PR, referenced in A5
