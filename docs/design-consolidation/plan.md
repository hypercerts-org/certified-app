# Design consolidation — implementation plan

**Branch:** `feat/design-consolidation` (PR target: `feat/positioning-redesign`)
**Date:** 2026-05-28
**Source documents:**
- [`docs/design-audit/component-audit.md`](../design-audit/component-audit.md) — full audit
- [`docs/design-audit/visual-divergence.md`](../design-audit/visual-divergence.md) — visual reference
- [`docs/design-audit/divergence-sheet.html`](../design-audit/divergence-sheet.html) — side-by-side composites

## Scope

Implement every consolidation action from the audit. One Draft PR into `feat/positioning-redesign`. No incremental shipping — the goal is a single coherent design system pass.

## Decisions (locked in advance — no mid-PR pivots)

| # | Topic | Decision |
| --- | --- | --- |
| **PR** | Strategy | One PR into `feat/positioning-redesign` |
| **R1** | Object-card radius | Push **all** radii to `var(--radius)` (2 px). No `--radius-card` token. Sign-in modal 20 px → 2 px. Landing buttons 4 px → 2 px. Sign-in modal input 8 px → 2 px. |
| **R2** | Landing dark mode | **Build proper dark-mode landing**. Section backgrounds, hero, FAQ, footer, ecosystem grid all gain dark variants. No more banding. |
| **R3** | Breakpoints | Align everything to canonical 800/1100/1300. landing.css 768 → 800 (9 instances). home/explore/workspace 760 → 800 (sidebar collapse). |
| **C1** | Card model | Extract `<Card variant="row|elevated|inset">` component. Migrate `.feed-card`, `.dash-card`, `.explore-user-card`, `.explore-project-card`, `.app-card`, `.endorsements-v2__card`. |
| **B1** | Button: icon variant | Add `size="icon"` (40×40) to Button with **required** `aria-label`. Migrate `.desktop-top-bar__icon-btn`, `.navbar__signin-btn`, `.leaflet-editor__btn`. |
| **B2** | Button: domain modal | **Migrate to `variant="primary"`** — drop the `--color-accent` treatment. No new `accent` variant. |
| **B3** | Tabs | Extract `<Tabs>/<Tab>` with proper ARIA (tablist/tab/tabpanel, keyboard arrows). Migrate `.profile-tabs`, `.feed-tabs`. |
| **B4** | Landing buttons | Migrate to canonical `<Button size="lg">`. Drop the 4 px radius and 200 ms transitions. |
| **I1** | Input sizes | Three sizes: `sm` 36 / `md` 44 / `lg` 56. Sign-in modal input → `lg`. Profile inline-edit → `variant="inline-edit"` (still md). |
| **I2** | Inline-edit variant | Codified as `Input variant="inline-edit"`. |
| **Bdg1** | Badge API | **Extend `<Badge>`** with count/role/tag/high-quality/standard/draft/test variants. Retire `.feed-card__label` and `.org-list__item-role` inline patterns. FeedLabelPill composes Badge internally. |
| **M1** | Modal scope | Migrate AddOrgModal + MembershipSyncModal + CustomDomainModal to `<AppDialog>`. Extract `<ResponsiveModal>` from FeedbackModal. |
| **M2** | SignInModal | 20 px → 2 px. No `--radius-hero-modal` token. |
| **P1** | Popover | Build custom `<Popover>` primitive (positioning, click-outside, ESC, focus management). Migrate account switcher, `.feed-filter`, explore popovers, workspace breadcrumb menu. |
| **S1** | Skeleton | Build `<Skeleton variant="line|box|circle|text">`. Migrate `ActivityCardSkeleton`, `NotificationRowSkeleton`, `MapSkeleton`, `.feed-card__author--skeleton`, `.location-card--skeleton`. |
| **L1** | Cert detail width | Align to 1280 px (matches profile/settings). |
| **Co1** | Landing dark | (see R2) — build proper dark mode |
| **Ic1** | Icon stroke widths | Document `strokeWidth={1.25}` convention for 11–12 px icons in DESIGN.md. No code changes. |
| **L3** | Page-frame layout | Extract `.page-frame-layout` shared CSS class for home + explore. |
| **L4** | DESIGN.md | Update to document: new components (Card/Tabs/Popover/Skeleton/ResponsiveModal), `size="icon"` Button variant, Input size scale, Badge variant expansion, layout modes, the "all radii are 2 px" rule, the new dark-mode landing approach. |

## Execution order

Order chosen so each phase is independently coherent + reviewable (one commit per phase) and so earlier phases don't depend on later ones.

| Phase | Files touched | Risk |
| --- | --- | --- |
| 1. Tier 1 mechanical | 6 px → 2 px (7 CSS files), hardcoded z-index → tokens, ad-hoc shadows → tokens, arbitrary spacing (3/5/7/9/28) → 4-px grid, focus-glow → outline | Low — visual-only |
| 2. Radii to 2 px | `.signin-modal__input`, `.signin-modal`, object cards' 8 px, `.hero__btn-*` 4 px, all → 2 px | Low — visual-only |
| 3. Breakpoint alignment | landing.css (9× 768→800), home.css / explore.css / workspace.css (760→800) | Medium — possible 760-800 px viewport regressions |
| 4. Legal pages typography | privacy/terms/dsa/imprint: text-xl → text-h2, text-lg → text-h3, Inter → Noto Serif headings | Low |
| 5. Button extensions | Button: add `size="icon"` w/ required aria-label + migrations; domain modal → `variant="primary"` | Low |
| 6. Landing buttons | `<HeroSignInButton>` / `<ReadyCtaButton>` → canonical `<Button size="lg">` | Medium — landing is high-traffic surface |
| 7. Input 3-size scale | Add `size` + `variant` to Input. Migrate sign-in modal, delete-record dialog, handle-search, profile inline-edit, create-form | Medium — form behavior |
| 8. Badge variant expansion | Add variants to Badge; migrate FeedLabelPill, .org-list__item-role, notification count | Low |
| 9. Card extraction | Build `<Card>`, migrate 6 card families | High — most surface area |
| 10. Tabs extraction | Build `<Tabs>/<Tab>`, migrate profile + feed tabs | Medium — interaction logic |
| 11. Skeleton extraction | Build `<Skeleton>`, migrate inline skeleton CSS | Medium |
| 12. Popover extraction | Build `<Popover>`, migrate 4 menu sites | High — focus + keyboard a11y |
| 13. Modal migration + ResponsiveModal | 3 hand-rolled modals → AppDialog; extract ResponsiveModal | Medium |
| 14. Cert detail width | cert-detail.css max-widths → 1280 | Low |
| 15. Dark-mode landing | landing.css `[data-theme="dark"]` overrides; section backgrounds, FAQ, etc. | High — visual design |
| 16. DESIGN.md + verify | Doc updates; lint, typecheck, build; browser verification | Low |
| 17. Open Draft PR | Push + `gh pr create` Draft into feat/positioning-redesign | — |

## Out of scope (deferred to future PRs)

- Migrate the dozen+ one-off profile/project action buttons (per audit § 1.1 row 11). The Button + Card extractions will absorb most; remaining ones get caught in next pass.
- Stylelint rule that flags `border-radius: 6px` and raw hex outside tokens.css (audit Tier 3 #18). Worth doing but not blocking.
- Force-light landing alternative (decided against — proper dark mode instead).

## Rollback plan

Every phase is one commit. If something breaks, `git revert <commit>` of that phase. The PR target is `feat/positioning-redesign`, not main, so the blast radius is limited to that line.

## Verification

After each phase: `npm run lint && npx tsc --noEmit`. After phases 6, 9, 12, 15: run dev server, screenshot the affected surfaces, compare to `docs/design-audit/screenshots/` baseline.

Before opening PR: full re-capture via `node scripts/audit-screenshots.mjs` and side-by-side check.
