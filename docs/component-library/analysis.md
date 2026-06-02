# Component-Library Consolidation — Phase 1 Reuse Analysis

## 1. Scope & Method

This document synthesizes a repo-wide audit of `certified-app`'s component library, run as Phase 1 of a consolidation effort. The goal is to map what shared primitives already exist in `src/components/ui/`, where the app bypasses them with hand-rolled BEM/CSS equivalents, and to produce an ordered, parallelizable migration plan that respects the **LOCKED** design system (`DESIGN.md` §14 post-consolidation rules; semantic CSS-variable tokens; 2px `var(--radius)`; Inter + Noto Serif; hand-rolled primitives, no `cva`/`clsx`).

**Method.** Sixteen analysts each owned a slice of the tree (the six core primitives; form controls; tabs/popover/edit-banner; status/feedback; card/badge/avatar; dialog/modal census; profile+endorsements; feed+home; groups/lists/workspace; account/settings/onboarding; explore/search/landing; create/project/dashboard/map; layout chrome/right-rail/notifications; icon library; repo-wide hardcoded values; a11y/interactive states). Each read the primitive source plus the BEM CSS backing the call sites, then reported: current primitive API, missing states, token violations, a11y gaps, and competing implementations.

**Spot-verification of the load-bearing claims** (run against the live repo):

- `src/components/ui/` contains **29 primitives** (28 `.tsx` + tests dir).
- `<Tabs>`, `<Card>`, `<Skeleton>` have **ZERO production importers** (grep confirms).
- `<Popover>` is imported by exactly **one** feature (`explore.tsx` + its test).
- `@tabler/icons-react` appears in exactly **one** file (`cert-icon.tsx`); `lucide-react` appears in **81** files.
- `--color-surface-container-high` is **referenced** by `avatar.tsx` but **never defined** in `tokens.css` (confirmed not present).
- `tailwind.config.ts` defines `success/warning/error` as raw hex; there is **no `accent`** color → `Button`'s `focus-visible:outline-accent` generates nothing.
- 19 files correctly use `AppDialog`; the hand-rolled overlays are `sign-in-modal`, `feedback-modal`, `custom-domain-modal`, plus the drawers `site-drawer`, `navbar`, `mobile-sidebar`.
- `useBottomSheetDrag` has exactly one consumer (`feedback-modal`); `navbar` re-implements it inline.

**Cross-cutting theme.** The primitives themselves are well-built and almost entirely token-correct. The problem is **adoption**, plus a small set of real correctness bugs (undefined tokens, a non-functional Button focus ring, a divergent destructive color). This is the "12 button vocabularies" drift the consolidation pass set out to stop from restarting (`AGENTS.md` §12).

---

## 2. Per-Primitive Reuse Map

Legend for status: **exists-keep** (compliant, adopt as-is), **exists-refine** (real bug/gap to fix), **consolidate** (fold duplicates onto it / it absorbs ad-hoc families), **add** (does not exist yet).

### 2.1 Core interactive

| Primitive | File | Status | Adoption / where bypassed |
|---|---|---|---|
| **Button** | `src/components/ui/button.tsx` | exists-refine | ~186 raw `<button>` across ~65 files; ~28 BEM `*-btn` families are visually-styled CTAs that should be `<Button>` (`hero__btn-signin`×2, `dashboard__back-btn`, `org-list__action-btn`, `profile-lists__create-btn`, `edit-banner__btn`, `org-members__remove-btn`, `explore__chrome-btn`, `pe__action-btn`, …). **Bugs:** `focus-visible:outline-accent` references a non-existent Tailwind color → focus-ring color silently dropped; `destructive` variant uses Tailwind `error` `#E74C3C` (raw hex) instead of `--color-error` → wrong color + no dark-mode flip; loading spinner has no `aria-busy`/`aria-live` and `animate-spin` isn't reduced-motion-guarded. |
| **Input** | `src/components/ui/input.tsx` | exists-refine | Imported in ~6 files; **~39 files hand-roll raw `<input>`**. 134 BEM `*__input/__field/__search-input` classes, none referencing `--focus-ring`. **Gaps:** no `:disabled` visual treatment; no leading/trailing icon slot (5+ search inputs hand-roll a Search-icon wrapper); inline-edit variant exists but `profile-sidebar` website/date fields still raw. |
| **Textarea** | `src/components/ui/textarea.tsx` | exists-refine | 1 importer; raw `<textarea>` in ~18 files. Not a "mirror of Input" — no `size`/`variant` axes, no `:disabled`, no char-counter despite many call sites hand-rolling `maxLength`+counter. |
| **Tabs / TabList / Tab / TabPanel** | `src/components/ui/tabs.tsx` | consolidate | **ZERO consumers.** Every tab strip is hand-rolled (`profile-certs`, `profile-followers`, `profile-endorsements`, `app/endorsements/page`, `desktop-top-bar`×3, `workspace`, `app/groups/page`, `location-picker-dialog`, `project-detail`). Hand-rolled strips omit `aria-controls`, roving `tabIndex`, and Arrow/Home/End nav → fail the WAI-ARIA tabs keyboard contract. Primitive is correct; needs a `disabled`-tab and optional count slot to drive adoption. |
| **Popover / Trigger / Content / Item** | `src/components/ui/popover.tsx` | exists-refine | Only `explore.tsx` adopted (and `explore.tsx` *also* hand-rolls a second local Popover at lines 1027-1083 for its quality filter). ~15 hand-rolled `role="menu"` surfaces (account switchers in `navbar`/`desktop-left-rail`/`desktop-top-bar`×2, `add-to-list-menu`, `project-detail` kebab, all profile sort menus, `response-menu`, workspace breadcrumb/switcher). **Gap:** emits `role=menu`/`menuitem` but has no arrow-key roving focus / no focus-into-menu-on-open → contract mismatch; no portal/collision handling. |

### 2.2 Surfaces

| Primitive | File | Status | Adoption / where bypassed |
|---|---|---|---|
| **Card (row/elevated/inset)** | `src/components/ui/card.tsx` | consolidate | **ZERO importers.** All live cards are BEM families: `.app-card` (defined **twice**, layout.css:682 + landing.css:728), `.feed-card`, `.dash-card`, `.explore-user-card`, `.explore-project-card`, `.profile-endorsements-v2__card`. Diverge from the primitive (border `--border-subtle` vs `--border-default`; 12–18px pad vs 24px) and from each other (row divider `--border-subtle` vs `--border-light`). |
| **Badge (10 variants)** | `src/components/ui/badge.tsx` | consolidate | 2 importers. Three duplicate count pills (`left-rail__badge`, `bottom-nav__badge`, `mobile-sidebar__badge`); tag/role/count chips throughout (`org-members__item-role-badge` is a **2px square** while `variant=role` is a 999px pill — two shapes for one semantic); `endorser-chip` uses `9999px`; raw-color badges (`settings__2fa-badge--on` `rgba(46,204,113,.1)`, `home-feed__preview-tag--warn` `#b91c1c`). `text-[11px]` in compact size is an arbitrary literal. |
| **Avatar** | `src/components/ui/avatar.tsx` | exists-refine | 30+ correct importers. **Bug:** fallback bg references `var(--color-surface-container-high)` which is **undefined** in tokens.css → initials chip renders with an invalid custom property. Bypassed by workspace mockup layouts (raw `<img>`, `#cbd5e1→#94a3b8` gradient, no `onError`) and onboarding (`step-profile`, `onboarding-modal`: raw `<img>`, 1-char initials, ad-hoc box-shadow). `profile-sidebar` forces `!h-[240px] !w-[240px] !text-5xl` instead of a size in the API. |
| **FeedLabelPill** | `src/components/ui/feed-label-pill.tsx` | exists-keep | Correctly composes `Badge`. No own styling. (`home-feed__preview-tag` duplicates the same draft/test concept and should route through this or `Badge`.) |
| **Brandmark** | `src/components/ui/brandmark.tsx` | exists-keep | Token-correct. Minor: always exposes `aria-label="Certified"`, causing double announcements inside an already-labeled link — add an optional `decorative`/aria-hidden affordance. |
| **CertIcon** | `src/components/ui/cert-icon.tsx` | exists-keep | The **single sanctioned `@tabler` import**, wrapped to a lucide-compatible API. Minor: `aria-hidden` is optional + undefined by default; no `title`/`aria-label` passthrough. |
| **SmartLink** | `src/components/ui/smart-link.tsx` | exists-keep | Sanctioned external-link primitive. Gaps: no guaranteed `:focus-visible` ring when a custom className is passed; no sr-only "opens in new tab" cue. |
| **ThemeToggle** | `src/components/ui/theme-toggle.tsx` | exists-refine | `cycle` variant a11y is good (the one primitive doing `:focus-visible` with `--focus-ring` correctly). `segmented` lacks roving-tabindex/arrow-key radiogroup nav and has **no `:focus-visible` ring** on options (invisible keyboard focus). Off-spec radius `calc(var(--radius)+1px)` (3px) on `.theme-toggle__option`. |

### 2.3 Status & feedback

| Primitive | File | Status | Adoption / where bypassed |
|---|---|---|---|
| **LoadingSpinner** | `src/components/ui/loading-spinner.tsx` | exists-keep | Healthiest primitive — ~55 call sites. Add `role="status"`/`aria-live` to the wrapper so dynamic appearance is announced. |
| **Skeleton** | `src/components/ui/skeleton.tsx` | consolidate | **ZERO production consumers.** Every loading placeholder is hand-rolled: `activity-card-skeleton`, `activity-author` byline, `activity-contributor`, `notification-row-skeleton`, `map-skeleton`, plus CSS-only `location-card--skeleton`, `cert-detail__*--skeleton`. **4+ duplicate `@keyframes` pulse** in feed.css. |
| **EmptyState** | `src/components/ui/empty-state.tsx` | exists-refine | Widely used. Needs a **compact/inline variant** so the ~12 one-line `*__empty` hints (`org-list__empty`, `profile-lists__empty`, `cert-detail__empty-line`, `right-rail__empty`, …) can adopt it. |
| **ErrorMessage** | `src/components/ui/error-message.tsx` | exists-refine | **Token violations in the primitive itself:** title uses `font-mono` (no monospace role in the design system); `bg-error/5 border-error/20 text-[var(--fg-primary)]` arbitrary classes instead of semantic error-surface tokens. ~14 inline `role="alert"` `<p>` error elements bypass it. |
| **ErrorBoundaryFallback** | `src/components/ui/error-boundary-fallback.tsx` | exists-refine | Used by all 5 segment `error.tsx`. Renders Try-again/Go-home as raw `.dashboard__back-btn` instead of `<Button>`; inline `fontSize:"0.85em"`+opacity on the digest line; reuses legacy `.dashboard` chrome. |
| **LoadMoreSentinel** | `src/components/ui/load-more-sentinel.tsx` | exists-refine | Ships an **unstyled** button — every caller passes a hand-rolled `buttonClassName` (`.feed__load-more-btn`, `.home-feed__load-more-btn`, `.explore__load-more`). Should default to `<Button variant="secondary">`. No `aria-busy`. |
| **ProviderRedirectOverlay** | `src/components/ui/provider-redirect-overlay.tsx` | exists-keep | Token-clean. Reconcile inline `zIndex: var(--z-skip-nav)` with `.loading-screen { z-index: 40 }`; add `role="status"`. |
| **Toast** | — | **add** | **No toast/snackbar anywhere.** `response-menu` documents an unbuilt "6-second undo toast" (AC#8); transient confirmations are faked with `copied`+`setTimeout` label flips (`profile-sidebar`, `cert-locations-map`, `custom-domain-modal`, `add-to-list-menu`) and bespoke `*__success` blocks. Clearest gap in this layer. |
| **Banner/Callout** | — | **add** | No primitive for non-modal inline notices (`feed__warning` caution banner reused in `profile-lists`, `onboarding-step__banner`). |
| **Pagination** | — | **add** (low priority) | Numbered paging hand-rolled in `sync-social-graph-section`; infinite scroll is `LoadMoreSentinel`. |

### 2.4 Form controls — the largest missing family

| Primitive | File | Status | Notes |
|---|---|---|---|
| **Select** | — | **add** | No primitive. Raw native `<select>` in `create/page`, `activity/.../edit`, `org-settings` (role dropdowns ×2), `endorse-reason-modal`, `location-picker-dialog` — each with a bespoke chrome + manually overlaid `ChevronDown`; native option list won't match dark-mode surfaces. |
| **Checkbox** | — | **add** | No primitive. Native `type="checkbox"` in ~8 files with **two incompatible strategies** (`accent-color: var(--fg-primary)` vs `appearance:none` custom box); `sign-in-modal` hand-draws an SVG check. None match `--focus-ring`. |
| **Radio / RadioGroup (SegmentedControl)** | — | **add** | Two divergent impls: `onboarding step-graph` hides native radios under `.onboarding-step__segment`; `theme-toggle` hand-rolls a button-based `role=radiogroup`. |
| **Switch** | — | **add** (low) | No `role="switch"` anywhere; `home-feed__group-toggle`, `acting-as-bar__switch` are one-off buttons. |

---

## 3. Dialog / Modal Consolidation Plan (largest single item)

There are **three** overlay mechanisms; the census found **13+ implementations** that should fold into one canonical base plus thin wrappers.

### 3.1 Canonical base — `AppDialog` (keep + complete)

`src/components/ui/app-dialog.tsx` is the native-`<dialog>` path: `showModal()`, native `::backdrop`, Esc via the browser `close` event, gateable backdrop-click close, focus save/restore, and the documented `InvalidStateError` guard. **19 files already use it correctly.** It is missing only:

- a **full Tab-cycle focus trap** (self-documented as "deferred to round 3" at app-dialog.tsx:118 — native `<dialog>` mitigates but doesn't fully trap in all engines);
- an optional **`autoFocusFirst`** (every consumer re-implements `useEffect(() => ref.current?.focus())`).

`AppDialogHeader` exists and should be adopted where headers are still open-coded.

### 3.2 The 13+ implementations and their disposition

| File | Today | Folds into |
|---|---|---|
| `src/components/ui/confirm-dialog.tsx` | Thin wrapper over AppDialog (8 consumers) | **keep** (re-point footer onto FormDialog row) |
| `src/components/ui/delete-record-dialog.tsx` | Thin wrapper, type-to-confirm (2 consumers) | **keep** |
| `src/components/ui/sign-in-modal.tsx` | Hand-rolled `__backdrop` + `useFocusTrap` + `useBodyScrollLock` + manual Esc + inline SVG close | **rewrite onto AppDialog** ("hero" body) |
| `src/components/ui/feedback-modal.tsx` | Renders BOTH a desktop hand-rolled modal AND a mobile bottom-sheet; two focus traps; custom buttons | **rewrite onto ResponsiveDialog** |
| `src/components/dashboard/custom-domain-modal.tsx` | Hand-rolled `__backdrop` + focus-trap + scroll-lock + Esc; multi-step wizard | **rewrite onto AppDialog + AppDialogHeader** (step indicator stays as body) |
| `src/components/layout/navbar.tsx` | Inline bottom-sheet account switcher (lines 70-141) — a strictly-worse fork of `useBottomSheetDrag` | **BottomSheet** primitive |
| `src/components/layout/mobile-sidebar.tsx` | Edge drawer: portalled `<aside role=dialog>` + scroll-lock + focus-trap + `inert` | **Drawer** variant |
| `src/components/layout/site-drawer.tsx` | Edge drawer; inlines its own `body.style.overflow`; no focus trap | **Drawer** variant |
| `src/components/settings/sync-social-graph-section.tsx` | Uses AppDialog but hand-rolls `signin-modal__header/title/close` | re-point onto **AppDialogHeader / FormDialog** |
| `embed-dialog`, `link-dialog`, `endorse-reason-modal`, `endorse-people-modal`, `location-picker-dialog`, `onboarding-modal`, `long-description-modal`, `add-to-list-menu` | Correctly use AppDialog but each re-implements autofocus + `signin-modal__body` form + footer-actions row + (embed/link) submit-stopPropagation | re-point onto **FormDialog** wrapper |

### 3.3 Proposed dialog set

```
AppDialog (base, complete the focus trap)
├── AppDialogHeader            (exists — adopt everywhere headers are open-coded)
├── ConfirmDialog              (keep — thin)
├── DeleteRecordDialog         (keep — thin)
├── FormDialog            (ADD) header + body form + standardized footer; owns autofocus-first + submit-stopPropagation
├── BottomSheet           (ADD) wraps useBottomSheetDrag + portal shell + backdrop + Esc + focus
├── ResponsiveDialog      (ADD) AppDialog ≥800px ↔ BottomSheet <800px (the deferred <ResponsiveModal>, DESIGN §14.6)
└── Drawer                (ADD) edge-anchored sibling of BottomSheet (folds the two nav drawers)
```

**What gets deleted:** 5 hand-rolled backdrops, 2 bottom-sheet drag impls (navbar inline collapses into BottomSheet), ~6 ad-hoc Esc listeners, 4 hand-rolled focus traps. `useFocusTrap`/`useBodyScrollLock` survive but lose most callers (only the new Drawer/BottomSheet use them). **Excluded (NOT modals):** `home-feed` quality/evaluator popovers — sanctioned `useClickOutsideClose` panels per AGENTS §12.

---

## 4. Icon-Library Decision

**Decision: standardize on `lucide-react`.**

| Library | Import statements | Files | Distinct icons |
|---|---|---|---|
| `lucide-react` | 80 | **81 files** (verified) | 68 |
| `@tabler/icons-react` | 1 | **1 file** (`cert-icon.tsx`, verified) | 1 (`IconCertificate`) |

- **Keep the `@tabler` dependency** solely for the wrapped certificate glyph — lucide has no certificate icon (the previous fallback was `Award`). The `cert-icon.tsx` wrapper isolates it behind a lucide-compatible `strokeWidth` API; **forbid any new direct `@tabler` imports** (already written in AGENTS.md:464). Removing tabler entirely is a trivial 1-swap but a downgrade.
- **Reverse migration (lucide → tabler) is rejected:** 79 files, ~80 imports, 68 swaps, plus `LucideIcon` is a public prop type in `smart-link.tsx`/`EmptyState`. No upside.
- **Inline-SVG cleanup (separate task):** replace ~9 hand-inlined icon SVGs with lucide components — 4 in `landing/sections/what-you-get.tsx` (Users/User/Lock/LogIn), 3 in `landing/sections/built-for-trust.tsx` (Globe/LogIn/Eye), close-X + checkmark in `sign-in-modal.tsx`, close-X in `custom-domain-modal.tsx`.
- **Leave alone:** brand-glyph SVGs in `smart-link.tsx` (Simple Icons marks — no icon lib ships brand logos), `brandmark.tsx`, and the decorative full-bleed noise/grain background SVGs.

---

## 5. Token / Hardcoded-Value Findings

The TSX layer is clean (zero arbitrary hex; only a handful of arbitrary Tailwind values). The drift is in `src/app/styles/*.css`. Highest-severity first.

### 5.1 Correctness bugs — undefined tokens & divergent colors

| File / line | Value | Should be |
|---|---|---|
| `src/components/ui/avatar.tsx:56` | `var(--color-surface-container-high)` — **undefined** in tokens.css | define in tokens.css (light+dark) **or** switch fallback to `--bg-sunken` |
| `tailwind.config.ts:17` | `error: "#E74C3C"` — disagrees with `--color-error` (`#ba1a1a`/`#f87171`) | drive the utility from the CSS var (fixes the `Button` destructive variant) |
| `src/components/ui/button.tsx:41` | `focus-visible:outline-accent` — no `accent` color in Tailwind → utility never generated | `focus-visible:outline-[var(--focus-ring)]` |
| `src/app/styles/explore.css:955-1003` | `--surface-2/-3`, `--accent-soft/-strong`, `--text-primary/-secondary/-tertiary` — **7 undefined tokens** | map to real `--bg-*`/`--fg-*`/`--border-default` |
| `src/app/styles/workspace.css` (×22) | `var(--bg-subtle)` (×17, **undefined → dropped**) + `var(--bg-primary)` (×5, undefined → falls to inline fallback) | `--bg-sunken`/`--bg-raised`/`--bg-elevated`/`--bg-canvas` |
| `context-updates.css:134`, `cert-detail.css:1974/2049`, `site-drawer.css:46` | `var(--bg-primary, var(--bg-base, #fff))` — both tokens undefined → `#fff` renders, never flips | `--bg-elevated` |
| `feed.css:1982` | `var(--success, #2a8)` — token is `--color-success` | `--color-success` |

### 5.2 Stale raw-hex fallbacks (token exists, fallback wrong)

`var(--color-error, #b91c1c)` (real is `#ba1a1a`), `var(--fg-muted, #b7bdc6)` (real is `#6b6263`), `var(--color-success, #2c8a3e / #16a34a)` (real `#2ECC71`), `var(--color-warning, #b04a2a)`, `var(--bg-canvas, #fff)` — across `home.css`, `explore.css`, `feed.css`, `project-detail.css`, `cert-detail.css`, `components.css`, `profile-edit.css`, `profile-lists.css`, `profile-inline-edit.css`. **Fix: drop the literal fallback, use the bare token.**

### 5.3 Radius

`border-radius: 2px` literal (~17 sites) → `var(--radius)`; `border-radius: 22%` (pages.css:1020, apps-store squircle) → `var(--radius)`; `endorser-chip` `9999px` → `999px`; `theme-toggle__option` `calc(var(--radius)+1px)` → `var(--radius)`.

### 5.4 Raw `rgba()` overlays / shadows / z-index

~60+ raw `rgba()` literals duplicate existing tokens — modal/drawer scrims → `--navy-overlay-70`; hover/inline-edit tints → `--overlay-weak/-medium`; error tints `rgba(186,26,26,…)` → an error-bg token; success tints `rgba(46,204,113,…)` → `--badge-success-bg`. Theme-pinned ones (`rgba(17,17,17,…)`, `rgba(255,255,255,…)`) break dark mode. Ad-hoc `box-shadow` → `--shadow-sm|md|lg`. Literal `z-index` (40/50/60/61/5/30/10) → `--z-*` tokens (`feed.css:1757` `z-index:10` → `--z-popover`).

### 5.5 Spacing off the 4px grid

`14px` (~50 sites), `7px`, `18px`, `26px`, `28px`, `13px`, `5px` against the documented scale; non-canonical breakpoints `640px`/`560px` in cert-detail.css → 800/1100/1300.

### 5.6 Justified exceptions (leave; add cross-ref comment)

`global-error.tsx` (tokens may be unloaded), `map.tsx` `#5e5e5e` (Leaflet styles SVG from JS — can't read CSS vars), `oauth-client-metadata` brand_color (external JSON), `layout.tsx`/`manifest.ts` `theme-color` meta (browser chrome — but sync `#f9f9f6` → `--bg-canvas` `#f9f9f9`), `smart-link` brand-icon `size:16` literals.

---

## 6. A11y / Interactive-State Gaps

The foundation is strong: a global `:focus-visible` outline and a global `prefers-reduced-motion` block in tokens.css give nearly every element a focus ring and motion compliance for free. The concentrated gaps:

1. **Tabs keyboard contract (highest leverage).** The correct `<Tabs>` primitive has zero consumers; every hand-rolled strip omits `aria-controls`, roving `tabIndex`, and Arrow/Home/End nav. Adopting `<Tabs>` fixes this across the most-used surfaces in one move.
2. **`Input`/`Textarea` have no `:disabled` visual treatment** — a disabled field is indistinguishable from enabled.
3. **`Popover` emits `role=menu`/`menuitem` but has no arrow-key roving / focus-into-menu** — contract mismatch.
4. **`AppDialog` ships focus save/restore, not a full Tab-cycle trap** (deferred; native `<dialog>` mitigates).
5. **Button loading / `Saving…` / `Sending…` states lack `aria-busy`/`aria-live`** (Button spinner, EditBanner, FeedbackModal, SignInModal).
6. **`ThemeToggle` segmented radiogroup** lacks roving-tabindex/arrow nav and a `:focus-visible` ring.
7. **Skeletons are `aria-hidden`** but their containers rarely set `aria-busy` (only search components do).
8. **`LoadingSpinner`/`ProviderRedirectOverlay`** have sr-only text but no `role="status"`/`aria-live`.

---

## 7. Proposed Canonical Library Structure

```
src/components/ui/
  # core interactive
  button.tsx              exists-refine  (fix focus ring + destructive token + aria-busy)
  input.tsx               exists-refine  (+ :disabled, + icon/addon slot)
  textarea.tsx            exists-refine  (+ size/variant/:disabled to mirror Input)
  select.tsx              ADD
  checkbox.tsx            ADD
  radio.tsx               ADD  (RadioGroup / SegmentedControl)
  switch.tsx              ADD  (low priority)

  # surfaces
  card.tsx                consolidate    (drive adoption; reconcile divider tokens)
  badge.tsx               consolidate    (absorb count/role/tag chips)
  avatar.tsx              exists-refine  (fix undefined token; + 2xl size)
  feed-label-pill.tsx     exists-keep
  brandmark.tsx           exists-keep    (+ decorative prop)
  cert-icon.tsx           exists-keep
  smart-link.tsx          exists-keep    (+ focus ring + new-tab cue)
  theme-toggle.tsx        exists-refine  (radiogroup nav + focus ring + radius)

  tabs.tsx                consolidate    (+ disabled tab, optional count slot)
  popover.tsx             exists-refine  (+ arrow-key roving focus)

  # status & feedback
  loading-spinner.tsx     exists-keep    (+ role=status)
  skeleton.tsx            consolidate    (drive adoption; delete dup keyframes)
  empty-state.tsx         exists-refine  (+ compact variant)
  error-message.tsx       exists-refine  (drop font-mono + arbitrary error classes)
  error-boundary-fallback exists-refine  (use <Button>)
  load-more-sentinel.tsx  exists-refine  (default <Button>)
  provider-redirect-overlay.tsx exists-keep
  toast.tsx               ADD  (+ provider / aria-live region)
  banner.tsx              ADD  (inline callout)
  pagination.tsx          ADD  (low priority)

  # dialog family
  app-dialog.tsx          exists-refine  (complete focus trap + autoFocusFirst)
  confirm-dialog.tsx      exists-keep
  delete-record-dialog.tsx exists-keep
  form-dialog.tsx         ADD
  bottom-sheet.tsx        ADD  (wraps useBottomSheetDrag)
  responsive-dialog.tsx   ADD  (AppDialog <-> BottomSheet at 800px)
  drawer.tsx              ADD  (edge-anchored)
```

---

## 8. Ordered Migration Plan — Disjoint File-Ownership Tracks

**Phase A — build/refine the primitives** (`src/components/ui/**` only; one owner to avoid stale-state). Order respects dependencies: fix the correctness bugs first (tokens.css + tailwind.config + avatar + button), then add the missing form primitives, then complete AppDialog, then build FormDialog/BottomSheet/ResponsiveDialog/Drawer on top.

**Phases B–H — consumer migrations** run in parallel, partitioned by **disjoint directory ownership** so no two tracks edit the same file. Each track also owns the CSS files that exclusively back its surfaces. The detailed disjoint partition (globs, primitives used, est. edits) is returned in the StructuredOutput `migrationPartition`.

High-level track map:
- **B — profile + endorsements** (`src/components/{profile,endorsements}/**`, `src/app/{profile,endorsements}/**`) — the biggest reservoir (sort menus → Popover, sub-tabs → Tabs, rows → Card, chips → Badge, fields → Input, edit-form → Button).
- **C — feed + home + activity** (`src/components/{feed,home}/**`, `src/app/{home,activity}/**`, `src/app/page.tsx`) — skeletons → Skeleton, preview tags → Badge, filter triggers/edit/delete → Button, error surfaces → ErrorMessage.
- **D — layout chrome + right-rail + notifications + search + badges** — account switchers → Popover, search inputs → Input, response/action buttons → Button, tokenize layout.css z-index/overlays.
- **E — explore + landing + legal/about** — kill the local Popover, search fields → Input, landing/explore action buttons → Button, fix the 7 undefined explore tokens, extract `.legal-link`.
- **F — create + project + dashboard + map + leaflet** — form fields → Input/Textarea, custom-domain-modal → AppDialog, project-detail menus/tabs → Popover/Tabs, fix cert-detail token leaks.
- **G — groups + lists + workspace + account/settings/onboarding** — fix undefined workspace tokens (highest correctness item here), workspace tabs/menus/avatars → Tabs/Popover/Avatar, onboarding form → Input/Textarea, sync-modal header → AppDialogHeader.
- **H — token/CSS hygiene sweep** (shared `tokens.css` additions + lint gates) — sequenced **after** Phase A defines new tokens; owns `tokens.css`, `tailwind.config.ts`, and lint config only (feature CSS edits belong to the owning feature track to keep globs disjoint).

---

## 9. Out-of-Scope (explicit)

- **Per-call-site `<Card>` migration beyond the high-traffic surfaces** is explicitly deferred in DESIGN.md §14.6; migrate cards only when a file is otherwise being touched.
- **`home-feed` quality/evaluator popovers** and any sanctioned `useClickOutsideClose` **panels** — NOT modals/menus; leave as-is (AGENTS §12).
- **Leaflet toolbar buttons** (`leaflet-editor__btn`) — sanctioned BEM toggle-state exception (AGENTS §11.8).
- **Core nav chrome** (navbar three-mode grid, bottom-nav, left-rail rows, account-switcher-list, app-shell, site-footer) — genuinely unique chrome, sanctioned.
- **Justified hardcoded values** in §5.6 — leave with a cross-ref comment.
- **Removing `@tabler/icons-react`** — keep for the cert glyph.
- **Switch/Pagination/Banner** primitives are low-priority adds; build only if a track needs them.
