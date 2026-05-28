# Component & Design Audit — certified-app

**Branch:** `feat/positioning-redesign` · **Date:** 2026-05-28 · **Scope:** read-only audit, no code edits.

---

## Executive summary

`certified-app` has a **strong, intentional design system foundation** — a 305-line token file (`tokens.css`) defines a complete semantic palette, an elevation ramp, a typography scale, a z-index map, and three motion durations, all of which flip cleanly between light and dark themes. The intended aesthetic — "notary's ledger reimagined as a mobile app" — is documented in `DESIGN.md` and visibly present on the landing page, profile pages, and feed cards.

But the implementation has drifted in five distinct ways:

1. **Two parallel component vocabularies coexist.** `src/components/ui/` holds canonical Tailwind-based primitives (Button, Input, Card, Badge, EmptyState, AppDialog), but `src/app/styles/` contains 23,944 lines of BEM-style CSS that *re-implements* most of those primitives as one-offs (`dash-card__btn`, `edit-banner__btn`, `org-list__action-btn`, `domain-modal__btn`, `signin-modal__input`, …). The canonical Button is imported in ~26 files; ~50+ surfaces use class-styled `<button>`s instead.

2. **`border-radius: 6px` has crept in 20+ times** in seven files, breaking the deliberate `--radius: 2px` "document-like" aesthetic. This is the highest-leverage, lowest-risk single fix in the audit.

3. **Three modals (AddOrgModal, MembershipSyncModal, CustomDomainModal) reuse the AppDialog *classes* but not the *component*** — they hand-roll backdrop click, Esc handling, focus restore, and scroll lock. This is brittle (it's already produced an InvalidStateError bug, per the comment in `app-dialog.tsx:118`) and a one-day refactor would clean it up.

4. **Landing page is a quietly divergent design system.** It uses 768 px breakpoints instead of the 800 px token, owns its own color palette (`--color-navy`, `--color-off-white`), uses a 4 px button radius instead of 2 px, and has a separate motion vocabulary (200 ms, 500 ms). This is *partly* intentional (DESIGN.md says it should always render light-themed) but the boundary isn't documented and the dark-theme screenshot (`02-landing_desktop_dark.png`) shows the boundary leaking — header/hero/footer flip to dark, mid-page sections stay light, producing a banded look.

5. **Loading / empty / error states are excellent in places and ad-hoc elsewhere.** `<EmptyState>` and `<ErrorMessage>` are well-built and well-adopted; skeletons are mostly inline CSS classes (`.feed-card__author--skeleton`, `.location-card--skeleton`) and `LoadingSpinner` is good but not always used.

The top ten consolidation actions are listed in [§ Recommended next steps](#recommended-next-steps); they fall into roughly **8 hours of low-risk cleanup** and **3–5 days of larger consolidation work**.

---

## How to read this report

- Every claim cites a file path; line numbers appear where they sharpen the point.
- Each category has a **usage map**, a **divergence table**, and a **decision queue** (places where you must make a call before code can change).
- Recommendations carry **Effort** (S < 30 min, M ≈ half day, L = multi-day), **Impact** (high/medium/low for consistency), and **Risk** (visual / a11y / behavior).
- Screenshots live under `./screenshots/` — 88 captures across 22 surfaces × 2 viewports (1440×900 desktop, 390×844 mobile) × 2 themes (light, dark). The manifest is `screenshots/_manifest.json`.

### Visual context (key surfaces)

| Surface | Desktop light | Desktop dark | Mobile light |
| --- | --- | --- | --- |
| Landing (`/welcome`) | [02-landing_desktop_light.png](./screenshots/02-landing_desktop_light.png) | [02-landing_desktop_dark.png](./screenshots/02-landing_desktop_dark.png) | [02-landing_mobile_light.png](./screenshots/02-landing_mobile_light.png) |
| Home (signed-out gate) | [03-home_desktop_light.png](./screenshots/03-home_desktop_light.png) | [03-home_desktop_dark.png](./screenshots/03-home_desktop_dark.png) | [03-home_mobile_light.png](./screenshots/03-home_mobile_light.png) |
| Explore | [04-explore_desktop_light.png](./screenshots/04-explore_desktop_light.png) | [04-explore_desktop_dark.png](./screenshots/04-explore_desktop_dark.png) | [04-explore_mobile_light.png](./screenshots/04-explore_mobile_light.png) |
| Apps | [14-apps_desktop_light.png](./screenshots/14-apps_desktop_light.png) | [14-apps_desktop_dark.png](./screenshots/14-apps_desktop_dark.png) | [14-apps_mobile_light.png](./screenshots/14-apps_mobile_light.png) |
| About | [15-about_desktop_light.png](./screenshots/15-about_desktop_light.png) | [15-about_desktop_dark.png](./screenshots/15-about_desktop_dark.png) | [15-about_mobile_light.png](./screenshots/15-about_mobile_light.png) |
| Privacy (legal) | [16-privacy_desktop_light.png](./screenshots/16-privacy_desktop_light.png) | [16-privacy_desktop_dark.png](./screenshots/16-privacy_desktop_dark.png) | [16-privacy_mobile_light.png](./screenshots/16-privacy_mobile_light.png) |
| 404 | [22-404_desktop_light.png](./screenshots/22-404_desktop_light.png) | [22-404_desktop_dark.png](./screenshots/22-404_desktop_dark.png) | [22-404_mobile_light.png](./screenshots/22-404_mobile_light.png) |

Routes like `/home`, `/create`, `/settings`, `/groups/create`, `/profile`, `/project/new`, `/workspace` redirect to either the signed-out "Sign in to …" empty-state surface or to `/welcome` itself (signed-out user). That's still useful — it confirms the empty-state and redirect chrome are consistent. All 88 captures are in `./screenshots/`.

---

## 1 · Primitives — buttons, inputs, badges

### 1.1 Buttons

#### Canonical
`src/components/ui/button.tsx` — `<Button variant={"primary"|"secondary"|"ghost"|"destructive"} size={"sm"|"md"|"lg"} loading? />`. Imported in 26 files. Uses `--btn-primary-bg/fg`, `--border-default/hover`, `--overlay-weak`, `--radius`. Press-scale micro-interaction, loading spinner, proper focus-visible.

Adopted broadly across modals, profile, settings, groups, endorsements, dashboard, onboarding.

#### Divergent button implementations

| # | What | Where | What differs | Could fold into canonical? |
| --- | --- | --- | --- | --- |
| 1 | Edit banner save/cancel | `src/components/ui/edit-banner.tsx:35–46` + `styles/profile-inline-edit.css:158–194` (`.edit-banner__btn`) | 32 px height (vs Button.sm 38 px), 14 px padding, 0.8125 rem | **Yes** — Button `size="sm"` with `variant="primary"/"secondary"` |
| 2 | Domain-modal buttons | `src/components/dashboard/custom-domain-modal.tsx:208–215, 274–281, 327–333` + `styles/components.css:1459–1506` (`.domain-modal__btn`) | Uses `--color-accent` for primary instead of `--btn-primary-bg`; 8 × 18 padding | **Yes** — needs a new `variant="accent"` |
| 3 | Org-list action buttons | `src/app/groups/page.tsx` + `styles/pages.css:222–256` (`.org-list__action-btn`, `--primary`, `--danger`) | 6 × 12 padding, transparent + token border, danger goes red on hover | **Yes** — `Button size="sm" variant="secondary"|"destructive"` |
| 4 | Icon-only nav/toolbar buttons | `desktop-top-bar.tsx` (`.desktop-top-bar__icon-btn`), `navbar.tsx` (`.navbar__signin-btn`) | 40 × 40 square, transparent | **Partially** — Button needs a `size="icon"` variant |
| 5 | Leaflet editor toolbar | `styles/leaflet.css:181–214` (`.leaflet-editor__btn`, `--active`) | 30 × 30 square; active = inverted | **Yes** — `variant="toggle"` |
| 6 | Response toggle group (Show/Hide endorsements) | `src/components/badges/response-buttons.tsx:106–127` + `styles/feed.css:1582–1624` (`.response-buttons__btn`, `--pressed`) | Same shape as canonical Button but uses WAI-ARIA toggle group | Keep as specialized; semantically distinct |
| 7 | Create-form buttons | `styles/feed.css:86–121` (`.create-form__submit`, `.create-form__cancel`) | Inline `<button>` in forms; 12 × 24 padding | **Yes** — Button with `type="submit"` |
| 8 | Tab buttons (profile, feed) | `styles/profile.css:207–244` (`.profile-tabs__tab`), `styles/feed.css:134–161` (`.feed-tabs__tab`) | Underline indicator; flex-shrink: 0 with horizontal scroll | Keep — different semantics (WCAG tab pattern) |
| 9 | Dashboard "back" button (404, error.tsx, error boundary) | `src/app/not-found.tsx`, `src/app/error.tsx`, `src/components/ui/error-boundary-fallback.tsx` + `styles/components.css:1634–1652` (`.dashboard__back-btn`) | Used as both `<button>` and `<Link>` | **Yes** — Button or a `BackButton` utility |
| 10 | Profile/project one-off buttons (12+ files) | `.profile-banner-upload__btn`, `.profile-sidebar__avatar-edit-btn`, `.project-detail__edit-btn`, `.project-detail__delete-btn`, `.profile-lists__create-btn`, `.profile-certs__sort-btn`, `.profile-endorsements-v2__sort-btn`, `.endorsement-lists__sort-btn`, … | Each one-off; mostly transparent bg + `--overlay-weak` hover | **Mostly** — Button with appropriate variant |
| 11 | Landing hero buttons | `src/components/landing/hero-signin-button.tsx`, `src/components/landing/sections/ready-cta-button.tsx` + `styles/landing.css:80–151` (`.hero__btn-primary`, `.hero__btn-secondary`) | 18 px padding, **4 px border-radius (not 2 px)**, brand-specific | Keep separate but **document the divergence** |

#### Decision queue — Buttons

- **B1.** Should Button gain a `size="icon"` variant (40 × 40 square), or do we introduce a dedicated `<IconButton>` component? See screenshots `04-explore_desktop_light.png` (navbar icon buttons) for the surfaces involved.
- **B2.** Should Button gain `variant="accent"` (`--color-accent` instead of `--btn-primary-bg`)? Currently used in the domain modal only. Risk: low; ambiguity about when to choose accent vs primary.
- **B3.** Tab buttons (`.profile-tabs__tab`, `.feed-tabs__tab`) — keep as specialized or unify into a `<TabGroup>`/`<Tab>` component? Profile tabs already have horizontal-scroll behavior tied to `useProfileNavbar()`.
- **B4.** Landing buttons (4 px radius vs 2 px elsewhere) — codify as `<LandingButton>` or add `variant="landing-primary"`? Argues for `<LandingButton>` because landing is a separate visual world.

---

### 1.2 Inputs

#### Canonical
`src/components/ui/input.tsx` — 44 px height (h-11), 1 px border, focus ring via `--focus-ring`, `error`/`helperText`/label slots. `src/components/ui/textarea.tsx` is the matching multi-line version.

#### Divergent input implementations

| # | What | Where | What differs | Folds in? |
| --- | --- | --- | --- | --- |
| 1 | Sign-in modal input | `src/components/ui/sign-in-modal.tsx:117–132` + `styles/components.css:294–319` (`.signin-modal__input`) | 56 px height, 1.5 px border, 3 px focus ring | Add `size="lg"` |
| 2 | Profile inline-edit inputs | `styles/profile-inline-edit.css:75–112` (`.profile-sidebar__website-input`, `.profile-sidebar__name-input`) | 1.5 px border using `--border-hover`, 6 × 10 padding — affordance for "currently editing" | Add `variant="inline"` or keep specialized |
| 3 | Delete-record confirmation input | `src/components/ui/delete-record-dialog.tsx` + `styles/components.css:233–249` (`.delete-record-dialog__input`) | 0.9375 rem font, error-colored border + ring | Input with `error` prop set live |
| 4 | Handle search (typeahead) | `src/components/groups/handle-search.tsx` + `styles/pages.css:15–35` (`.handle-search__input`) | Bottom-border only, no rounded corners | Add `variant="underline"` or keep specialized |
| 5 | Create-form inputs | `styles/feed.css:51–67` (`.create-form__input`) | `bg-raised` background (not `bg-elevated`), 12 × 14 padding | Use canonical Input with className override |

#### Decision queue — Inputs

- **I1.** Input `size` variants — currently no size system. Likely needed: `sm` (32 px), `md` (44 px, default), `lg` (56 px for sign-in modal).
- **I2.** "Inline edit" affordance (1.5 px border + `--border-hover`) — make a real variant, or leave inline? Profile inline-edit is the only user; pragmatic to specialize.
- **I3.** Standardize all form input padding (currently `0 px-4` in canonical Input, `12px 14px` in `.create-form__input`, `8px 12px` elsewhere). Pick one — recommend `12px 16px` (4-px aligned).

---

### 1.3 Badges / pills

#### Canonical
- `src/components/ui/badge.tsx` — `variant: "verified" | "pending" | "unverified"`, icon-prefixed.
- `src/components/ui/feed-label-pill.tsx` — activity quality labels (`high-quality`, `standard`, `draft`, `likely-test`).

#### Divergent badge implementations

| What | Where | Should be |
| --- | --- | --- |
| Notification count (red pill) | `--badge-count-bg/fg` tokens in `tokens.css`, but no component — used inline in navbar | New Badge `variant="count"` |
| Role badge in org list | `styles/pages.css:204–214` (`.org-list__item-role`) | Badge `variant="role"` |
| Feed preview tag | `styles/home.css:485–506` (`.home-feed__preview-tag`, `--warn`) | Badge `variant="tag"` |

#### Decision queue — Badges

- **Bdg1.** Centralize all pill chrome onto `<Badge>` — does the existing 3-variant API (`verified | pending | unverified`) generalize to `count | role | tag | warn`, or do we split into `<Badge>` (semantic status) + `<Tag>` (neutral chip)?

---

## 2 · Containers — cards, modals, drawers, popovers

### 2.1 Cards

| Family | Where | Recipe |
| --- | --- | --- |
| Canonical `<Card>` | `src/components/ui/card.tsx` | `bg-elevated` · `border-default` · `rounded` (2 px) · `p-6` · optional hover. Used sparingly. |
| `.feed-card` | `styles/feed.css:353–502` | transparent · bottom-border only · 20 × 0 padding · no radius. Used in activity feed, project lists, profile certs. |
| `.dash-card` | `styles/components.css:772–800` | transparent · bottom-border only · 32 × 0 padding · no radius. Used in settings/account. |
| `.explore-user-card`, `.explore-project-card` | `styles/explore.css:658–738`, `:841–926` | `bg-elevated` · `border-subtle` · **`8 px` radius** · 16 padding. Adds hover transitions. |
| `.app-card` | `styles/layout.css:681–693`, `styles/landing.css:781–795` | `bg-elevated` · `border-default` · **`8 px` radius** · 16 padding · shadow on hover. Partner/integrations grid. |
| `.profile-endorsements-v2__card` | `styles/profile-endorsements.css` | `bg-elevated` · `border-subtle` · 8 px radius · 12 padding. |
| `.received-endorsement-card` | `styles/feed.css` | bottom-border only (feed-style). |
| `.profile-card` | `styles/layout.css:928–974` | No chrome — content-only wrapper. |

#### Divergences

- **Two parallel card languages.** "List divider" cards (`feed-card`, `dash-card`, `received-endorsement-card`) have no background or radius — they're rows. "Object" cards (`explore-*-card`, `app-card`, `endorsements-v2__card`) have elevated backgrounds and 8 px radius. This is *probably* intentional but unstated.
- **8 px radius on object cards conflicts with `--radius: 2px`** ([§ 4.1](#41-border-radius)). Either object cards become 2 px (severe — they'd lose softness), or 8 px gets a real token (`--radius-card: 8px`).
- The canonical `<Card>` (Tailwind, `p-6`, 2 px radius) **isn't used by any of the above families**. It's effectively dead code — Search the codebase for `from "@/components/ui/card"` to verify; current grep showed near-zero imports.

#### Decision queue — Cards

- **C1.** Endorse the two-family model: introduce `--radius-card: 8px` and rename `<Card>` (or kill it). Document "list-divider rows" vs "object cards" in DESIGN.md.
- **C2.** Whether to extract a `<FeedCard>` / `<ObjectCard>` component shell instead of repeating bottom-border / box-shadow CSS in 6+ places.

---

### 2.2 Modals

#### Canonical
`src/components/ui/app-dialog.tsx` — wraps native `<dialog>` + `showModal()`, handles backdrop click (with `disableBackdropClose`), Esc, focus save/restore. Comes with `<AppDialogHeader>` (title + X button).

Modals using `<AppDialog>` correctly:
`ConfirmDialog`, `DeleteRecordDialog`, `EndorseReasonModal`, `EndorsePeopleModal`, `LocationPickerDialog`, `OnboardingModal`, `EmbedDialog`, `LinkDialog`, `LongDescriptionModal`.

#### Modals **not** using `<AppDialog>`

| Modal | File | Pattern | Status |
| --- | --- | --- | --- |
| `MembershipSyncModal` | `src/components/groups/membership-sync-modal.tsx:36–50` | Reuses `.signin-modal app-modal` *classes* but rolls its own backdrop / Esc / focus | **Should adopt `<AppDialog>`** |
| `AddOrgModal` | `src/components/groups/add-org-modal.tsx:22+` | Same as above | **Should adopt `<AppDialog>`** |
| `CustomDomainModal` | `src/components/dashboard/custom-domain-modal.tsx:18+` | Custom backdrop + focus trap + body scroll lock; never touches `<dialog>` | **Should adopt `<AppDialog>`** |
| `SignInModal` | `src/components/ui/sign-in-modal.tsx` | Custom; intentionally a hero surface (20 px radius, 40 px padding) | Keep separate but document |
| `FeedbackModal` | `src/components/ui/feedback-modal.tsx:185–254` | Custom; dual desktop-dialog + mobile-bottom-sheet | Keep separate, but extract the bottom-sheet logic |

Comment at `app-dialog.tsx:118` documents an earlier `InvalidStateError` bug caused by `showModal()` running twice — the hand-rolled modals are at risk of the same class of bug.

#### Modal max-widths

`ConfirmDialog` 440 / `DeleteRecordDialog` 440 / `EndorseReasonModal` 460 / `FeedbackModal` 420 (desktop) / `SignInModal` 460. Document canonical values: `narrow=400`, `standard=460`, `wide=640`.

#### Decision queue — Modals

- **M1.** Confirm the migration scope: just `AddOrgModal`, `MembershipSyncModal`, `CustomDomainModal` → AppDialog, or also pull FeedbackModal's bottom-sheet into a reusable `<ResponsiveModal>` while we're here?
- **M2.** SignInModal: keep at 20 px radius forever, or normalize to a documented "hero modal" token?

---

### 2.3 Drawers, sheets, popovers, menus

- **Site drawer** (`styles/site-drawer.css`, `src/components/layout/site-drawer.tsx`) — single, cohesive implementation, 280 px wide, slides from left. ✅
- **Bottom sheet** — only `FeedbackModal` uses one; not extracted as a primitive.
- **Account switcher menu** (rail variant + top-bar variant) — class-based, two CSS rule sets in `styles/layout.css`.
- **Generic popover** (`.popover__menu`, `.popover__item` in `styles/explore.css:680+`) — used by sort/filter menus but **not** componentized.
- **Feed filter popover** (`.feed-filter`, `.feed-filter__item` in `styles/explore.css:640+`) — same shape, separate rules.
- **Workspace breadcrumb menu** (`.wks-breadcrumb__menu`, `.wks-blue__menu`) — local one-offs.

#### Divergence

There are at least four implementations of "small floating menu under a trigger." All share the same essential recipe (`position: absolute` · `bg-elevated` · `border-default` · `var(--radius)` · `var(--shadow-md)` · min-width ~180–200 px) but none reference each other.

#### Decision queue — Popovers

- **P1.** Build a `<Popover>` primitive (component + CSS) and migrate all four call sites? This is a multi-day refactor with high payoff in consistency but real keyboard/a11y risk.

---

## 3 · Layout, spacing, breakpoints

### 3.1 App shell

Defined in `src/components/layout/app-shell.tsx` + `styles/layout.css:707–848`. Three modes:

- **Standard** — 720 px column mobile, 600 px column desktop (a narrow, reading-width column for the feed-like UX).
- **Page-frame** — used by `/home` and `/explore`. Sidebar (`clamp(256px, 22vw, 296px)`) + main, max 1400 px.
- **Fullbleed** — used by profile, cert detail, settings. Max 1280 px, two-column where applicable.

Landing (`/welcome`) **bypasses** the shell entirely (`app-shell.tsx:40–41`). Its own widths: 1536 px hero, 640/1024/1280 px section bands.

### 3.2 Container widths (audit)

| Container | Width | File | Notes |
| --- | --- | --- | --- |
| Navbar inner | 1536 | `layout.css:236` | Matches landing |
| App shell grid | 1300 | `layout.css:713` | Matches `--bp-gt-desktop` token |
| Standard content (mobile) | 720 | `layout.css:750` | |
| Standard content (desktop) | 600 | `layout.css:767` | Narrow reading column |
| Fullbleed content | 1280 | `layout.css:845` | Profile, settings, workspace |
| Home / Explore main | 1400 | `home.css:243`, `explore.css:150` | Wider than reading column |
| Cert detail (desktop) | 1008 | `cert-detail.css:45` | **Inconsistent** — narrower than profile |
| Cert detail (≥1300) | 960 | `cert-detail.css:42` | Narrows *further* on large screens |
| Project detail (desktop) | 1100 | `project-detail.css:38` | |
| Project detail (≥1300) | 960 | `project-detail.css:42` | |
| Settings panel | 1280 | `settings-page.css:66` | |
| Workspace panel | 1280 | `workspace.css:9` | |
| Landing hero | 1536 | `landing.css:30` | |
| Landing sections | 640/1024/1200/1280 | `landing.css:67/775/809/1171` | Mixed |

**Decision queue — L1.** Cert detail and project detail are narrower than profile, and narrow *further* at ≥1300 px. Is this intentional (cert detail is content-dense, deserves to feel "tighter")? Or is it leftover from before the redesign? Pick a position for cert detail: `1008` always, `1280` always, or document why it narrows.

### 3.3 Breakpoints

Canonical tokens in `tokens.css:142–147`: `800 / 1100 / 1300` px. Hook `src/lib/hooks/use-layout-breakpoints.ts` matches.

**Non-canonical breakpoints found:**

| BP | Count | Where | What for |
| --- | --- | --- | --- |
| 768 px | 9 | `landing.css` (lines 206, 271, 488, 722, 964, 1094, 1107, 1410, 1436) | Landing mobile/desktop switch |
| 760 px | 5 | `home.css:51,76,232,537`, `explore.css:50,185,618`, `workspace.css:656` | Page-frame sidebar collapse |
| 799 px | 7 | `feed.css`, `components.css`, `settings-page.css` | "Just below 800" |
| 640 / 700 / 560 / 520 px | 5+ | `cert-detail.css`, `feed.css`, `components.css` | Custom |
| 900 px | 1 | `layout.css:3018` | One-off |
| 1200 px | 2 | `home.css:253`, `components.css` | News rail threshold |

**Decision queue — L2.** Landing at 768 px and page-frames at 760 px both straddle the 800 px token. Three options:

1. Move them all to 800 px (one alignment, but may shift the landing's mobile-up break).
2. Document `768`/`760` as legitimate alternates and add them to the token map.
3. Move them to `799` (the existing "just-below-desktop" convention).

### 3.4 Spacing values

Tailwind's 4-px scale (`p-2`, `p-3`, `p-4`, `gap-2`) is implicit in `*.tsx`. In CSS, the dominant values are `4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32`. Arbitrary values that don't fit the 4-px grid:

| Value | Where | Recommend |
| --- | --- | --- |
| `3 px` | `layout.css:6, 275, 3049`, `workspace.css:420` | → 4 px |
| `5 px` | `profile-inline-edit.css:557`, `workspace.css:269, 369, 620`, `cert-detail.css:740, 757`, `project-detail.css:328` | → 4 or 6 px |
| `7 px` | `explore.css:161, 205, 234`, `profile-edit.css:206` | → 8 px |
| `9 px` | `profile-edit.css:206` | → 8 px |
| `28 px` | `home.css:66`, `layout.css:3438` | → 24 or 32 px |
| `12 px 14 px` (form input padding) | `feed.css:59` | → 12 × 16 |

### 3.5 Z-index map

Defined `tokens.css:149–158`. Values found in CSS that *don't* use the tokens:

| Offender | File | Fix |
| --- | --- | --- |
| `z-index: 49` (navbar dropdown) | `layout.css:437` | should be 51 or use `--z-popover` |
| `z-index: 999` (feedback trigger) | `landing.css:502` | should be `--z-skip-nav - 1` or new `--z-feedback` |
| `z-index: 10000` (feedback modal backdrop) | `landing.css:526` | promote to a token (it's already referenced as such in the `--z-feedback` comment in tokens.css:158) |

### 3.6 Grids

`/home` and `/explore` define **near-identical** page-frame grids (`home.css:26–35`, `explore.css:26–31`). Extracting a `.page-frame-layout` class is a 30-minute refactor. Other grids (feed card grids `repeat(auto-fill, minmax(280px, 1fr))`, endorsement triplets `repeat(3, …)`, project detail `1fr 320px`) are each one-off.

#### Decision queue — Layout

- **L3.** Extract `page-frame-layout` shared CSS class for `/home`+`/explore`? Risk: low; both pages are stable.
- **L4.** Document the layout-mode model (Standard / Page-frame / Fullbleed) in DESIGN.md so future pages have a default to pick from.

---

## 4 · Typography, color, elevation, icons, motion

### 4.1 Border-radius

`--radius: 2px` is the deliberate, brand-defining choice ("notary's ledger", DESIGN.md §1).

**Compliant uses:** ~80% of card / button / input chrome uses `var(--radius)` or `rounded` (Tailwind, also 2 px because of the config). Pill shapes (`999 px`) and circles (`50%`) for avatars/dots are intentional and consistent.

**Drift:**

- **`border-radius: 6px` appears in ~20 places** across 7 files. This is the single most disruptive consistency break in the audit because it directly contradicts the documented brand intent:
  - `styles/context-updates.css:94, 104`
  - `styles/profile-groups.css:70, 112, 224, 249`
  - `styles/settings-page.css:127, 138`
  - `styles/profile-edit.css:93`
  - `styles/profile-projects.css:97`
  - `styles/home.css:157, 170, 181, 197, 203, 211, 227`
- `border-radius: 1px` in `profile-groups.css` (×2) — anomalous, should be 2 px or 0.
- `border-radius: 10px` in `home.css:249` — one-off.
- **`border-radius: 8px`** in card families (`.explore-*-card`, `.app-card`, `.endorsements-v2__card`) — *intentional* but conflicts with the documented `--radius`. Promote to `--radius-card: 8px` if keeping the soft-card look, OR drop to `var(--radius)` to enforce the document aesthetic everywhere.
- Landing buttons use `4px` (`landing.css:84`) — intentional brand divergence, document it.

**This is the #1 action in the report.** A search-and-replace of `border-radius: 6px;` → `border-radius: var(--radius);` (with visual verification of each call site) is 30 minutes and restores brand sharpness across half the app.

### 4.2 Typography

- **Headlines** correctly use `font-headline` (Noto Serif) on the canonical scale (`text-display`, `text-h1`, etc., defined in `tailwind.config.ts`).
- **Legal pages (`/privacy`, `/terms`, `/dsa`, `/imprint`) use `text-xl` / `text-lg`** instead of the canonical scale. ~50 className instances. This produces visually different headings on these pages vs the rest of the app — see `screenshots/16-privacy_desktop_light.png` (the H1 / H2 hierarchy is identifiable but smaller than e.g. `/apps` or `/about`).
- **Font weights:** clean — Inter uses 400/500/600, Noto Serif uses 700.
- **Letter-spacing:** mostly token-aligned. Found one outlier band `-0.005em` (rail labels) — fine; isolated.
- **Line-height:** scattered values `1.15 / 1.25 / 1.35 / 1.45 / 1.55` across `feed.css`, `home.css`, `context-updates.css`, `settings-page.css` — empirically tuned per component rather than systematized. Acceptable but not token-driven.

### 4.3 Color

The token system is well-respected. Spot checks across all of `src/components/**` and `src/app/styles/**` (excluding `tokens.css` and `landing.css`):

- **No raw hex literals found in component CSS** outside the landing palette and intentional `var(--color-error, #b91c1c)` style fallbacks (`cert-detail.css:128`, `components.css:200, 248, 254`).
- `color-mix()` usage in `feed.css` and `explore.css` is modern + correct.
- Landing CSS uses its own invariant palette (`--color-navy`, `--color-off-white`, `--color-light-gray`, `--color-mid-gray`, `--color-surface-container-low`) defined in `tokens.css:42–46`. This is *partly* documented but the boundary between "landing" and "app" tokens isn't enforced by linting.

**Landing in dark mode** (`screenshots/02-landing_desktop_dark.png`) shows the boundary problem: the hero band, "Built for trust" band, and footer go dark; the surrounding sections stay light. The result is a striped page. Either:

1. Force landing fully light (the documented intent — add a `:root[data-theme="dark"] .landing-page { color-scheme: light; }` override at the section root), OR
2. Give landing a full dark-mode treatment.

**Decision queue — Co1.** Landing dark-mode: force-light, or proper dark? (Force-light matches DESIGN.md §1; "Landing-page palette … kept invariant so /welcome always renders light-themed regardless of system colour scheme.")

### 4.4 Elevation

| Token | Use |
| --- | --- |
| `--shadow-sm` | Theme toggle, subtle lift. ✅ |
| `--shadow-md` | Feedback trigger, popovers, dropdowns. ✅ |
| `--shadow-lg` | Modals. ✅ |

**Outliers:**

- `0 8px 24px rgba(0, 0, 0, 0.08)` appears in `home.css:206`, `profile-lists.css:359`, `explore.css:83` — a fourth tier that isn't in the token system. Either add `--shadow-xl` or fold these to `--shadow-md`.
- `0 1px 2px rgba(0,0,0,0.04)` in `cert-detail.css:309` — should be `var(--shadow-sm)`.
- `0 0 0 3px var(--overlay-medium)` (`components.css:296`) — an alternative focus-ring pattern that competes with the global outline rule in `tokens.css:248–254`. Fold to standard outline.

### 4.5 Icons

- **lucide-react** is the dominant library (~70 imports). ✅
- **@tabler/icons-react** is used only via `src/components/ui/cert-icon.tsx`, which adapts tabler's `IconCertificate` to lucide-compatible props (`strokeWidth` instead of `stroke`). Clean wrapper. ✅
- **Stroke widths:** mostly 1.5 (default) and 1.75 (active/intentional weight, including CertIcon). A handful of `strokeWidth={1.25}` appear with `size={11}` icons in form dialogs (`create/page.tsx`, `project/new/page.tsx`, `groups/create/page.tsx`) — *probably* intentional (a thinner stroke at 11 px reads correctly), but undocumented.
- **No inline ad-hoc SVGs** found that should be lucide icons.
- `Brandmark` (`src/components/ui/brandmark.tsx`) is a clean inline SVG with `fill="currentColor"` — uses `var(--bg-canvas)` for the inner letterform so it inverts cleanly. ✅

**Decision queue — Ic1.** Document the `strokeWidth={1.25}` + small-size convention, or remove it (`1.5` works fine at 11–12 px). Pick one.

### 4.6 Motion

- Tokens: `--transition-fast: 150 ms ease-out`, `--transition-base: 250 ms ease-out`, `--transition-slow: 400 ms cubic-bezier(0.16, 1, 0.3, 1)`.
- ~150 transitions in CSS use the tokens correctly.
- Outliers: `transition: all 200ms` in `landing.css:92, 143`; `transition: opacity 200ms, transform 200ms` (landing) — landing has its own motion language, but `200ms` doesn't match any documented duration.
- `transition: opacity 180ms ease, visibility 180ms ease` in `site-drawer.css:50` — drawer-specific, acceptable.
- `animation: spin 600ms linear infinite` in `pages.css:1133` — standard spinner; OK.
- **Keyframes** (`fadeUp`, `modalFadeIn`, `modalSlideUp`, `logoPulse`, four skeleton-pulse variants, `endorsement-multi-spin`, `bottomSheetSlideUp`, `bottomSheetFadeIn`, `sx-section-flash-heading`) are all well-named and have explicit `prefers-reduced-motion` overrides. ✅

### 4.7 Focus

Global rule at `tokens.css:248–254` covers `a / button / [role="button"] / [tabindex]`. Found one alternative pattern (`box-shadow: 0 0 0 3px var(--overlay-medium)` at `components.css:296`) — fold to outline-based pattern.

---

## 5 · Loading, empty, error states

| Pattern | Status |
| --- | --- |
| `<EmptyState>` (`src/components/ui/empty-state.tsx`) | Excellent — consistently used. ✅ |
| `<ErrorMessage>` (`src/components/ui/error-message.tsx`) | Good — used by retry-able error surfaces. ✅ |
| `<LoadingSpinner>` (`src/components/ui/loading-spinner.tsx`) | Pulsing Brandmark — good idea, used in some places. |
| Skeleton loaders | **Fragmented** — `ActivityCardSkeleton`, `NotificationRowSkeleton`, `MapSkeleton` are components; `.feed-card__author--skeleton`, `.location-card--skeleton` are inline CSS classes. |

#### Decision queue — Loading states

- **S1.** Build `<Skeleton>` primitive (line / box / circle / text variants) and migrate skeleton CSS to it? Effort: M. Impact: medium — makes future loading UIs uniform.

---

## 6 · Decision queue (consolidated)

These are the explicit choices the user needs to make *before* code can change. Each one blocks downstream consolidation work.

| # | Decision |
| --- | --- |
| B1 | `Button size="icon"` (40×40) or new `<IconButton>` component? |
| B2 | New `Button variant="accent"` or fold domain-modal buttons into existing primary/secondary? |
| B3 | Tabs as a real `<TabGroup>` or keep CSS-driven? |
| B4 | Landing buttons: `<LandingButton>` component or accept ad-hoc styling? |
| I1 | Input sizes: `sm` / `md` / `lg`? Pick heights. |
| I2 | Input "inline-edit" variant: codify or keep specialized? |
| I3 | Standardize form input padding (recommended `12 × 16`). |
| Bdg1 | One `<Badge>` API for everything, or split `<Badge>` (status) + `<Tag>` (neutral)? |
| C1 | Adopt `--radius-card: 8px` for object cards, or push everything to `var(--radius)` (2 px)? |
| C2 | Extract `<FeedCard>` / `<ObjectCard>` shells, or keep CSS-driven? |
| M1 | Migration scope: 3 modals → AppDialog, plus extract `<ResponsiveModal>` for FeedbackModal? |
| M2 | SignInModal radius: keep 20 px forever, or define a `--radius-hero-modal`? |
| P1 | Build `<Popover>` primitive for the 4 menu sites, or stay with class-based? |
| L1 | Cert detail width: 1008 / 1280 / something else? |
| L2 | Breakpoints: align 768/760 → 800, or document them? |
| L3 | Extract `page-frame-layout` shared class? |
| L4 | Document the 3 layout modes in DESIGN.md? |
| Co1 | Landing in dark mode: force-light or proper dark? (DESIGN.md says force-light.) |
| Ic1 | `strokeWidth={1.25}` at `size={11}`: document or revert to 1.5? |
| S1 | `<Skeleton>` primitive: build it now, or keep mix of components + CSS? |

---

## 7 · Recommended next steps

In execution order. Effort: **S** < 30 min, **M** ≈ half day, **L** = multi-day. Impact and risk are for *consistency* and *behavior* respectively.

### Tier 1 — High-leverage, low-risk (single-commit fixes)

| # | Action | Files | Effort | Impact | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | Replace `border-radius: 6px` → `var(--radius)` everywhere | `context-updates.css`, `profile-groups.css`, `settings-page.css`, `profile-edit.css`, `profile-projects.css`, `home.css`, plus the two `1px` and one `10px` outliers | S | **High** | Low — verify visually on the 7 affected pages |
| 2 | Convert legal pages to canonical heading scale | `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/dsa/page.tsx`, `app/imprint/page.tsx` | S | High | Low |
| 3 | Force landing always-light (`:root[data-theme="dark"] .landing-page { color-scheme: light; }` + theme override on `.landing-page` root) | `landing.css` or new `landing-page.tsx` | S | High | Low — purely visual; matches documented intent |
| 4 | Replace ad-hoc `0 8px 24px rgba(0,0,0,0.08)` shadow with `var(--shadow-md)` (or promote to `--shadow-xl` if you want the distinct tier) | `home.css:206`, `profile-lists.css:359`, `explore.css:83` | S | Medium | Low |
| 5 | Replace `0 1px 2px rgba(0,0,0,0.04)` with `var(--shadow-sm)`; fold `0 0 0 3px var(--overlay-medium)` focus into the standard outline pattern | `cert-detail.css:309`, `components.css:296` | S | Medium | Low |
| 6 | Replace hardcoded z-index `49`, `999`, `10000` with token references (add `--z-feedback: 10000` to the map) | `layout.css:437`, `landing.css:502, 526`, `tokens.css` | S | Medium | Low |
| 7 | Replace arbitrary spacing values (`3 / 5 / 7 / 9 / 28 px`) with the 4 px scale | ~10 lines across `layout.css`, `workspace.css`, `cert-detail.css`, `profile-inline-edit.css`, `explore.css`, `profile-edit.css`, `home.css` | S | Low | Low |

**Tier 1 estimated time: 4–6 hours.** All visual-only, all easy to revert.

### Tier 2 — Needs a design decision before code

| # | Decision | Once decided, effort to implement |
| --- | --- | --- |
| 8 | Migrate `AddOrgModal`, `MembershipSyncModal`, `CustomDomainModal` to `<AppDialog>` | M |
| 9 | Add `size="icon"` (40×40) and `variant="accent"` to Button; migrate icon-only buttons and domain-modal buttons | M |
| 10 | Add `size="sm" / "md" / "lg"` to Input; migrate sign-in modal input, delete-record input, profile inline-edit inputs | M |
| 11 | Promote object-card radius to a token (`--radius-card: 8px`) — or push to 2 px and re-screenshot | S–M |
| 12 | Extract `.page-frame-layout` shared class for `/home` and `/explore` | S |
| 13 | Document the 3 app-shell modes (Standard / Page-frame / Fullbleed) and the landing-system divergence in DESIGN.md | M |

### Tier 3 — Larger refactors (>10 files, multi-day)

| # | Action | Effort |
| --- | --- | --- |
| 14 | Build `<Popover>` primitive and migrate the 4 menu call sites (account switcher, feed filter, explore popover, workspace menus) | L |
| 15 | Build `<Skeleton>` primitive and migrate inline skeleton CSS to it | M–L |
| 16 | Audit the 12+ profile/project one-off action buttons (`.profile-banner-upload__btn`, `.project-detail__edit-btn`, sort buttons, etc.); collapse the ones that can use canonical `<Button>` | L |
| 17 | Extract `<ResponsiveModal>` (desktop dialog ↔ mobile bottom-sheet) from FeedbackModal | M |
| 18 | Add a CI lint rule (stylelint plugin) that flags `border-radius: 6px` and raw hex colors outside `tokens.css` + `landing.css` so drift doesn't recur | M |

---

## Appendix · Files referenced

- Tokens & system: `src/app/styles/tokens.css`, `src/app/styles/components.css`, `DESIGN.md`, `tailwind.config.ts`
- UI primitives: `src/components/ui/{button,input,textarea,badge,card,empty-state,error-message,loading-spinner,app-dialog,confirm-dialog,delete-record-dialog,sign-in-modal,feedback-modal,brandmark,cert-icon,smart-link,avatar,feed-label-pill,theme-toggle,edit-banner}.tsx`
- Layout: `src/components/layout/{app-shell,navbar,desktop-top-bar,site-drawer,bottom-nav}.tsx`, `src/hooks/use-layout-breakpoints.ts`
- Modal divergences: `src/components/groups/{add-org-modal,membership-sync-modal}.tsx`, `src/components/dashboard/custom-domain-modal.tsx`
- Per-feature CSS modules: 25 files in `src/app/styles/` (totals 23,944 lines).

## Appendix · Screenshot manifest

Full list: `./screenshots/_manifest.json` (88 entries). Each surface captured at 1440×900 (desktop) and 390×844 (mobile), in `light` and `dark`. Surfaces marked `404` are intentional not-found probes.
