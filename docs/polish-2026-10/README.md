# Polish pass, 2026-10-22

A full review of certified-app against the project's own rules (CLAUDE.md, DESIGN.md) and the installed skills, followed by fixes for everything with a clear right answer. Taste calls and DESIGN.md changes are proposals, not applied.

**Status:** 12 commits on local `staging` (`origin/main..staging`), not pushed. Type check, lint (0 problems), 1321 tests and the CLAUDE.md checks all pass.

## What was reviewed

| Review | Method / skills | Findings |
|---|---|---|
| Code, by area (shell, feed, profile, public) | Vercel web-design-guidelines, Impeccable audit / harden / polish checklists, CLAUDE.md rules | 139 |
| Motion | Emil Kowalski: review-animations, animation-performance, improve-animations, find-animation-opportunities, emil-design-eng; react-view-transitions | 40 |
| Robustness and mobile feel | break-ui, mobile-native, Impeccable harden / adapt | 27 |
| Copy and terminology | Impeccable clarify / onboard, writing guidelines | 54 (incl. glossary) |
| Visual pass | staging.certified.app signed in, light + dark, 1440 / 900 / 500px | 27 |
| Design system | Impeccable typography / layout / critique, emil-design-eng, apple-design | 25 proposals + 27 contradictions |

Raw findings: `findings/*.json` and `findings/visual.md`.

## What was fixed (193 items, 15 skipped with reasons)

- **Accessibility:** visible focus everywhere (undefined tokens, outline overrides, blue Tailwind fallback ring on every field); keyboard access for file inputs, graph search, create menu, toolbars; correct roles (no fake listboxes/menus/tabpanels), labels, aria-current, live announcements; button-inside-link markup removed via a new `<Button href>`; 44px touch targets; AA contrast on two badge tokens.
- **Reduced motion:** the global rule now stops infinite loops instead of flickering them; graph, spinners, bottom sheet and smooth scrolls respect it.
- **Motion quality:** no more `transition-all` on primitives; layout-property animations moved to transform; enter/exit symmetry for bottom sheet, dialog backdrop and toasts.
- **Mobile:** hover no longer sticks after a tap (`hoverOnlyWhenSupported`, gated CSS hovers); 16px inputs below 800px; floating Feedback button no longer covers content; legal pages show one top bar.
- **Robustness:** long DIDs/handles/names wrap; grouped numbers and currency; `dir="auto"` on user text; icon fallbacks for missing images; retry on error states; unsaved-changes guard on create/edit forms.
- **Copy:** plain-language errors everywhere (no raw HTTP codes, csrf, PDS, DID); consistent terms per the glossary (activity, group, handle, Endorsement network, Revoke, Import Bluesky follows).
- **Design-system hygiene:** shadows, z-index, breakpoints and heading classes back on tokens; dark chrome tint matches the current canvas; dead and duplicate CSS removed.

Two independent reviews of the full diff (logic and CSS) found 9 regressions; all are fixed in the last two commits, including one serious one: a decimal comma ("12,50") would have been recorded as 1250 on a public funding receipt.

## What needs you

1. **Visual check** of the changes behind sign-in: `needs-visual-check.md`.
2. **Taste proposals** (67 items, plus 7 deferred decisions): `proposals.md`.
3. **DESIGN.md proposals** (25, prioritised P1-P3, with 27 stale or contradictory statements to clean up): `design-md-proposals.md`. P1-1 (blue focus ring), P1-3 (dark chrome tint) and the token half of P1-4 (badge contrast) are already fixed in code; the doc text is not changed yet.
4. **Push / PR:** nothing is pushed. When you're happy: `git push origin staging`, then a Draft PR `staging -> main`.

## Notes

- Local sign-in doesn't work with the current `.env.local` (placeholder Upstash credentials), so signed-in pages were viewed on staging only.
- Skills installed this session (uncommitted): `.claude/skills/` (Emil Kowalski and Vercel skills). Impeccable was already in `.agents/skills/`.
- The production build (`npm run build`) was not run, because it shares `.next` with the running dev server. CI's build job will cover it.
