# CLAUDE.md — certified-app

Claude Code reads this file at session start. The longer agent reference is `AGENTS.md`; the design system is `DESIGN.md`. This file holds the **hard rules** that drift most often and the **first checks** to run before any UI change.

## Hard rules (do not violate)

1. **`border-radius` is `var(--radius)` (2 px), `999px` for pills, `50%` for circles.** Never `4`, `6`, `8`, `12`, `16`, `20` px. The sign-in modal is not an exception.
2. **No raw hex / rgb / rgba** outside `src/app/styles/tokens.css` and `src/app/styles/landing.css`. Everywhere else uses tokens (`--bg-canvas`, `--fg-primary`, `--border-default`, …).
3. **Breakpoints are 800 / 1100 / 1300 only.** "Below desktop" → `@media (max-width: 799px)`. Don't introduce 768 / 760 / 640.
4. **Shadows are `var(--shadow-sm | --shadow-md | --shadow-lg)`.** No `box-shadow: 0 X Y rgba(...)`.
5. **Z-index is a `--z-*` token.** No literal numbers.
6. **Headings use the canonical scale + `font-headline`.** `text-h1`/`text-h2`/`text-h3`/`text-h4`. Never `text-xl` / `text-lg` / `text-2xl` for app headings.
7. **Modals use `<AppDialog>`** (or `<ConfirmDialog>` / `<DeleteRecordDialog>` which wrap it). Never hand-roll a backdrop + `useFocusTrap`.
8. **Icon-only buttons are `<Button size="icon" aria-label="…">`.** The TypeScript discriminated union enforces `aria-label`.
9. **Dark mode must work.** Toggle `data-theme="dark"` on `<html>` and verify. Don't pin colors so they break the flip. Landing must also flip (use `--color-navy` / `--color-off-white` — theme-aware — not `--color-primary` / `--color-white` which are invariant).
10. **Reach for a primitive in `src/components/ui/` before writing a new component or BEM class.** The audit that produced this rule found 12 button vocabularies and 8 card families coexisting — don't restart that drift.

## First checks before merging a UI change

```bash
# 1. No off-spec radii
grep -rEn "border-radius:\s+(4|6|8|12|16|20)px" src/app/styles/

# 2. No non-canonical breakpoints
grep -rEn "@media.*?\((max|min)-width:\s*(76[08]|64[80])px\)" src/app/styles/

# 3. No legal-style headings on app pages
grep -rn "font-headline text-\(xl\|lg\|2xl\)" src/app/ src/components/

# 4. No hand-rolled modal backdrops
grep -rn "signin-modal__backdrop" src/components/ | grep -v "ui/sign-in-modal.tsx\|ui/feedback-modal.tsx"

# 5. Type + lint must be clean
npx tsc --noEmit
npm run lint
```

All five should be silent (or, for lint, no change vs. main's baseline of 60 warnings).

## Where to look

- **Design rules:** `DESIGN.md` — read §14 first ("Rules at a glance" and the consolidation pass).
- **Architecture / conventions / pitfalls:** `AGENTS.md`. The "Rules at a glance" callout in §0 mirrors this file's hard rules with more detail. §11 (CSS) and §12 (Component) have the full primitive catalog.
- **Design audit + visual divergence sheet:** `docs/design-audit/component-audit.md`, `docs/design-audit/visual-divergence.md`, `docs/design-audit/divergence-sheet.html` (open in a browser).
- **Implementation plan / decision log:** `docs/design-consolidation/plan.md`.

## Workflow conventions (per the user's global rules)

- For non-trivial work, follow the plan → review → branch → PR flow in the user's global CLAUDE.md (`~/.claude/CLAUDE.md`).
- For certified-app specifically, **substantial work commits directly to `staging`** unless explicitly told otherwise (per `feedback_certified_app_staging.md`).
- Draft PR is `staging → main`. Never auto-open it.
- Never merge — leave the PR Draft + CI green and ask the user.
- No emojis in code, commits, or PR bodies (the `🤖 Generated with` footer is fine).
