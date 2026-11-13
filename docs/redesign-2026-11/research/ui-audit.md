# UI audit: certified-app, `staging` (code reading only)

I read the code only; nothing was run or rendered. Two of the paths named in the brief, `docs/design-audit/` and `docs/design-consolidation/`, do not exist. `AGENTS.md` §7 is out of date in several places:
- `/` is a server redirect to `/home` or `/welcome`.
- `/about`, `/settings/wallet`, `/settings/my-data` and the `/groups` list are gone.
- `/groups` now redirects to `/home`.

The first four checks in CLAUDE.md and `stylelint` all pass.

## 1. Shell and navigation

**Root layout.** `src/app/layout.tsx` stacks these in order: `ActingAsBar`, `Navbar` (phone), `DesktopTopBar` (800px and up), `<main>` + `AppShell`, `BottomNav`, `FeedbackModal` + `FeedbackTrigger`, `OnboardingModal`, `ProductTour`. `AppShell` (`app-shell.tsx`) is a single column, 600px on desktop and 720px on phones, followed by `SiteFooter`. It is skipped on `/welcome`, `/terms`, `/privacy`, `/imprint`, `/dsa` and `/embed`.

**Desktop top bar, row 1** (`desktop-top-bar.tsx:321-604`), left to right:
- The brand: a wordmark when there is no title, a brandmark otherwise.
- The page h1 or breadcrumb, in Inter 1rem at weight 450, off the type ramp (layout.css:1693).
- Search, "Search Certified", 260px wide (300px from 1100px).
- A "+" popover: New activity, New project, New group.
- Seven labelled icon links: Home, Feed, Apps, Records (personal only), Profile (aria "My profile"), Settings, Help.
- The account switcher.

Signed-out visitors get Search, Apps, Help and a primary "Sign in". **There is no Explore item**; search stands in for it. The hamburger and `SiteDrawer` are switched off by `SHOW_SITE_NAV_HAMBURGER = false` (:54).

**Desktop top bar, row 2:**
- On `/{actor}` and both edit-profile pages: the profile tabs (Overview, Activities, Projects, Groups*, Endorsements, Followers, Lists, About*).
- On record detail pages: Back plus the detail tabs.
- On `/create` and `/project/new`: Back only.

The comments at :86 and :95-99 are out of date.

**Phone navbar** (`navbar.tsx`), three modes:
- **Default:** hamburger, brandmark, avatar switcher (or a secondary "Sign in").
- **Titled:** a back arrow and a centred h1 (Inter 0.9375rem/450, off the ramp). The hamburger replaces the back arrow only on the exact `ROOT_PATHS` (:37) and only when no breadcrumb is set. `/settings` sets a breadcrumb, so it gets a back arrow. `/create` is a bottom-nav tab but also gets a back arrow.
- **Profile overlay** (`/{actor}`): only a floating back pill. **There is no menu, no switcher and no h1** on any phone profile, your own included.

**Phone hamburger drawer** (`mobile-sidebar.tsx`):
- Header: avatar, name and handle, plus a `ThemeToggle` (cycle).
- Signed in: Home, Feed, Explore, Apps, Records*, Profile, Settings, Feedback (a button), Help, then the legal links (Welcome · Terms · Privacy · Imprint).
- Signed out: Explore, Apps, Help.
- It has no Create, no Groups and no Sign out.

**Bottom nav** (`bottom-nav.tsx`):
- **It renders only in an installed PWA** (`lib/layout/bottom-nav-visibility.ts`). In a phone browser there is no tab bar at all.
- Items: Home, Explore, Create, Apps, Feedback.
- Create is hidden when acting as a group but **is not gated on being signed in**.
- There is no Feed, Records or Profile item. DESIGN.md §4.3 says "Create (signed in)", which does not match the code.

**Gating** comes from `lib/groups/personal-only.ts`. `create`, `groups`, `endorsements` and `records` are hidden when acting as a group. Switching identity while on one of those routes sends you to `/home` (`lib/groups/navigation.ts`).

**Where things live:**
- **Settings, Help, Profile:** top-bar links on desktop; the hamburger on phones.
- **Create:** the "+" popover on desktop. In a phone browser there is none; the PWA bar links only `/create`.
- **Feedback:** the floating "Feedback Beta" pill, plus the hamburger (and the PWA bar) on phones.
- **Sign out:** the switcher only.
- **Theme:** Settings → Appearance on desktop; the hamburger and Settings on phones.

**Also:** icons differ (Explore is `Search` vs `Compass` in `site-drawer`; Create is `Plus` vs `PlusCircle`), and tokens.css:307-313 still describes the retired rails.

## 2. Account switcher

**Components:**
- `account-switcher-list.tsx` is the shared list.
- Desktop: a `Popover` 300px wide (`desktop-top-bar.tsx:536-596`). The trigger shows the avatar, plus name and @handle from 1100px.
- Phone: a `BottomSheet` with no visible title (`navbar.tsx:184-226`). The trigger is the avatar only.

**Menu order:**
1. A "User" label ("Group account" if the account is itself a group).
2. The personal row: display name or "Personal", and @handle.
3. An icon-only ArrowLeftRight button, "Switch account". It calls `openSignIn()`, which **replaces the session**.
4. A divider and a "Groups" label.
5. The groups, sorted accepted → role → name. Each row's subtitle is the **role, not the handle**.
6. A divider and "Sign out".

**How acting as a group shows:**
- The trigger avatar changes to the group's.
- `ActingAsBar` appears.
- The radio rows are checked accordingly.

**Rough edges:**
- No "Add account" (it replaces the session), no "Create group", no "Manage groups", and no link to the profile or settings.
- The "Switch account" button is icon-only and labelled only by a tooltip, and tooltips are suppressed on touch.
- `menuitemradio` items sit inside the sheet's dialog with no menu around them.
- `ROLE_ORDER` and the sort are copied in `navbar.tsx` and `desktop-top-bar.tsx`.
- Initials are computed three ways: `getInitials`, `slice(0,2).toUpperCase()`, and `slice(0,2)`.
- The styles live in pages.css.
- Sign out has no confirmation.

## 3. Signed-in destinations

| Route | Purpose | Layout | Header | Notes |
|---|---|---|---|---|
| `/home` (`components/home/*`, home.css) | Account overview | Page frame, 640px; `320px \| 1fr` up to 1120px from 1100px | `usePageTitle("Home")`; `HomeBlock` h2 at **text-h4**, with a description and the action on the right | "Your records" count tiles link to profile tabs, not /records; `.home-count` and `.home-app` are hand-rolled; spinners |
| `/feed` (`feed/feed-page.tsx`, rows in `home/home-feed*`) | Following + trusted endorsers | Page frame; 600px, then `220\|600\|280` (1100px) or `240\|600\|300` (1300px) | Chrome title only; **no in-page heading** | Hand-rolled For you/Custom strip below 1100px; the feed rows are styled in **home.css**; `activity-card.tsx` is a second row design used elsewhere |
| `/explore` (`explore-page/*`, explore.css) | Browse the network | Sidebar `clamp(256-296)` + main up to 1400px; **8px phone gutter** | Section h2s are uppercase 0.7rem labels | 26 off-ramp sizes; a "Show all ›" button; hand-rolled `.explore__all-empty`; public |
| `/apps` (pages.css:760-932) | Partner app directory | 1080px; 1 then 2 columns | `PageTitle` + in-page h2 **text-h2** "Apps that work with Certified" | Hand-rolled tiles with a translateY + shadow-md hover; Home draws the same apps differently |
| `/records` (`records/*`, records.css) | Manage your work, endorsements, follows, lists | Page frame, 760px; `220\|1fr` up to 1080px from 1100px; pill row below 1100px | Pane h2 at **text-h3**, description, actions top-right | Personal only; the endorsement tab is not in the URL; followers-empty is a plain note while following-empty uses `EmptyState` |
| `/{handle}` (`[actor]/page.tsx`, `profile/*`) | Public profile (person or group) | Full-bleed 1280px; 296px sidebar on the left | Desktop h1 is the handle (breadcrumb); **no h1 on phones**; name in raw 1.625 / 1.5 / 1.75rem | Phone tabs are hand-rolled buttons, desktop uses `<Tabs>`; the tab list is defined twice (page.tsx:84 and desktop-top-bar.tsx:77); `?tab=settings` still renders `SettingsPanel`; editing is inline on desktop but a separate page on phones |
| `/{actor}/activity\|project/{rkey}` | Record detail | Activity 1008px with a 296px aside on the **right**; project 960px single column | Phone title changes per tab; desktop shows the record title; in-page title raw 1.875 / 1.5rem | **No tab strip on phones**: sub-tabs are reached only through conditional in-body links; inline-edit code is dead; not-found is handled three ways |
| `/create`, `/project/new` | New activity or project | 1008px two-pane / 960px | Chrome title + desktop Back row; first heading is a "Description" eyebrow | Cancel and Publish sit bottom-right and don't stick; `/edit` uses a top `EditBanner` instead; signed-out view has **no Sign in button** |
| `/settings` (`settings/*`, `.sx`) | Account settings | 1280px; 296px rail + panel card; on phones, a list that drills in | Title + breadcrumb (so phones show a back arrow); panel h2 raw 1.375rem; h3 at Inter 1rem | Personal: Account (Handle, Email, Password, DID), Appearance, Sync social graph; Advanced: App passwords, Turn into group. Group: `OrgSettings` (Account, Import follows, Members & Roles, Transfer, Activity Log, Danger zone), which also lives at `/groups/{did}/settings` |
| `/settings/edit-profile` | Edit profile form | 600px | Duplicate in-page back link; sticky bottom footer | Desktop row 2 shows the profile tabs, locked |
| `/groups/*` | — | — | — | `/groups` redirects to /home; `/groups/{did}` redirects to /{handle}; `create` 960px form; `import` is **unlinked** and mixes three class families; `{did}/settings` shows an **endless spinner** to non-members; `{did}/edit-profile` has a second h1 and no gating |
| `/help` (`.legal-page`, 880px) | FAQ, tour, feedback | 880px | In-page h2 styled **text-h1** | The FAQ graph modal mounts `Visualization`, which calls `usePageTitle` (visualization.tsx:50), so the title goes blank on close; `.app-shell:has(.viz)` also matches through the native `<dialog>` and strips the page's width |
| `/endorsements` (styles in feed.css:820-1000) | Received and given endorsements | 600px, legacy `.dashboard` | Title only; a ghost "+ New" in the tab bar | **Linked from nowhere**; tab order Received/Given (Records uses Given/Received/Lists); Accept/Reject (Records says Show/Hide); hand-rolled rows |
| `/workspace` | Prototype comparing navigation patterns | 1280px | **No `usePageTitle`**; its own in-page h1 | Unlinked, routable, public; 17 off-ramp sizes |
| `/endorsement-graph`, `/profile` | Graph (unlinked) and redirect stub | — | — | — |
| `/welcome` (`landing/*`, landing.css) | Signed-out landing | Bypasses the shell | `LandingTopBar`: wordmark, a theme toggle, and a hand-rolled `.lp-topbar__btn` "Sign in" | Hero → WhatLivesHere → Maya → AiWorld → PartnerApps → ExploreProfiles → Stats → Trust → Orgs → FAQ → ClosingCta → SiteFooter |

**Across pages:** wider widths are opted into four ways: the default column, `:has()` page frames (layout.css:758), full-bleed (profile only) and per-page `:has()` overrides. Desktop top padding is 32, 24, 20 or 16px.

## 4. Patterns to consolidate

| Pattern | Existing primitive | Hand-rolled (main ones) |
|---|---|---|
| Page header | none; `HomeBlock` and `PaneHeader` are local | `apps-store__header`, help h2, `sx-panel__header` (copied into org-settings and groups/import), `workspace__head`, `dashboard__page-title`, `endorsements-tabs-bar`, `explore__chrome`, `cert-detail__headline` inputs |
| Section header + "See all" | none; `Badge count-bare` is used only in the gallery | About 20 heading classes in two voices (uppercase label vs title); six see-all classes (`home-block`, `profile-overview`, `context-updates`, `project-detail`, `cert-detail`, `profile-projects`) |
| Count tile | none; `CountTile` is local to home | `home-count`, `profile-overview__stat`, `social-graph-sync__tile`, `onboarding-step__tile`, `viz__stat`, `viz__panel-count`, `evaluator-preview__stat`, `profile-hero__count`; four value sizes |
| Row list | `Card variant="row"` (**no production use**), `IdentityRow` (5 uses), `RowThumb` (4), `SettingRow` (1) | About 25 row BEM families; avatar + name + handle hand-rolled at about 18 sites (switcher, sidebar, explore, endorsements, search, profile groups…); RowThumb fallback copied 3 times |
| Empty state | `EmptyState` rich (about 30 files), inline (**1 use**) | 37 `*__empty` CSS rules, plus the `records-pane__note` and `settings__note` text classes |
| Search | `Input` with `leadingIcon`, `Combobox` | Raw label + input in profile-groups, -endorsements, -followers, -certs, -projects, endorse-people-modal, list-modals, step-graph; three clear-button classes; three icon variants |
| Tabs | `Tabs` (segmented variant unused), `SegmentedControl` | Phone `profile-tabs`, `feed-tabs`, `records-nav`, three segmented copies, sort menus without `Popover` (profile-groups, profile-followers) |
| Side panel / two columns | `Card` only | Six grids at five widths (320, 220, 220/240+280/300, 256-296, 296 left, 296 right); three rail item styles (`records-nav__link`, `sx-menu__item`, `explore__filter`); the settings rail is duplicated in org-settings |
| Buttons | `Button` | 147 raw `<button>` vs 249 `<Button>`; 10 remove-× classes, 4 sort-trigger classes; the top-bar icon links |

## 5. Tokens (`src/app/styles/tokens.css`)

**What the tokens cover:**
- **Colour roles:** `--bg-canvas`, `-sunken`, `-raised`, `-elevated`, `-overlay`; `--fg-primary`, `-secondary`, `-muted`; four borders (`subtle`, `default`, `hover`, `control`); `--overlay-weak` and `-medium`; `--scrim`; `--navbar-bg` and `--sheet-bg` (color-mix); `--btn-primary-*`; status (`--color-error`, `-success`, `-warning` with bg/border/text); `--badge-*`. The `danger` and `accent` badge tokens are unused.
- **Landing palette:** `--color-navy` / `--color-off-white` flip in dark mode; `--color-primary` / `--color-white` stay fixed. Dark mode overrides the semantic tokens (zinc 900-700).
- **Type:** `--text-display` through `--text-micro`, `--tracking-label`, `--measure`.
- **Controls and shape:** `--control-h-compact`, `-sm`, `-md`, `-lg` (32/36/44/56px); `--radius` 2px and `--radius-pill`.
- **Shadows:** sm, md, lg, modal, plus ring, inset and outline tokens.
- **Motion:** four durations, three easings.
- **Z-index:** 15 `--z-*` layers.
- **Chrome heights:** `--navbar-height` 64, `--top-bar-row1` and `-row2` (52/44), `--bottom-nav-height`.
- **Spacing: there are no spacing tokens.** Spacing is Tailwind steps or raw px.

**Where raw values still get in:**
- **Font sizes:** 738 `font-size` declarations in the app CSS, and only 49 use `var(--text-*)`. 118 are off the ramp: explore 26, workspace 17, leaflet 9, profile-endorsements 8, components 8. The most common is 0.9375rem (44 uses), which is also the phone title size.
- **Weights:** `font-weight: 450` appears 5 times.
- **Tailwind:** arbitrary `text-[…]` values (`!text-[1.875rem]`, `!text-[1.375rem]`, `text-[0.85rem]` in identity-row, `text-[13px]`), plus 36 `text-sm`, 10 `text-base` and 9 `text-xs`.
- **Hex colours in TSX:** `global-error.tsx` inline styles, `map.tsx` (#5e5e5e) and `board-settings-dialog` (`COLOR_SEED`).
- **Spacing:** off-scale gaps such as 28px, 10px and 18/20px padding.
- **Widths:** nine content widths in use.

## 6. Top 15 problems for a first-time user (ranked)

1. **Phone browsers have no tab bar.** The bottom nav is PWA-only, so everything is behind the hamburger. Profile pages on a phone show only a back pill: no menu and no account switcher.
2. **Four navigation lists that disagree.** The desktop has seven labelled links plus Create, search and the switcher, with no Explore. The phone drawer has Explore and Feed but no Create. The PWA bar has Create but no Feed, Records or Profile. `SiteDrawer` is dead code.
3. **Endorsements live in three places.** `/endorsements` (linked from nowhere), Records → Endorsements, and the profile's Endorsements tab use different tab orders, defaults and wording (Accept/Reject vs Show/Hide).
4. **"Your stuff" is split three ways.** Home tiles, Records and the profile tabs overlap. Home's "Your records" tiles open profile tabs, not /records, and Records disappears when you act as a group.
5. **Group gating contradicts itself.** The "+" popover offers all three create actions as a group. `personal-only` hides Create and bounces you from `/create`, yet `/create` can publish as a group, and `/project/new` is ungated.
6. **The account switcher is thin.** "Switch account" is an unlabelled icon that replaces your session. There is no add account, create group or manage groups. Group rows show the role instead of the handle, and the phone sheet has no title.
7. **Record pages have no tabs on phones.** Contributors, Funding and the other sub-tabs are reachable only through conditional in-body links, and the title changes per tab.
8. **Signed-out dead ends.** `/create` and `/project/new` say "Sign in to create" with no button. `/groups/{did}/settings` spins forever. The PWA bar shows Create to signed-out visitors. `/groups/{did}/edit-profile` has no gating.
9. **Prototype and orphan routes are still live:** `/workspace` (no chrome title), `/endorsement-graph`, `/groups/import`, `/endorsements`. `/groups` silently redirects to /home.
10. **Profile editing works three ways.** Desktop edits inline, phones open `/settings/edit-profile`, and groups use an old form with a second h1. The Save/Cancel position changes every time (top banner, sticky footer, bottom-right, primary first).
11. **Settings is hard to find and inconsistent.**
    - On phones it shows a back arrow instead of the menu.
    - On desktop, the theme switch exists only in Settings → Appearance.
    - Group settings has two URLs.
    - Labels mix Title Case and sentence case.
    - `?tab=settings` on the profile still renders settings.
12. **Help's graph modal breaks the page** behind it: the title goes blank and the width cap is lost.
13. **Every page has a different header and width.** The first heading is h4, h3, h2, h1, an uppercase label or nothing. Widths run from 600 to 1400px, and Explore uses an 8px gutter. Moving between pages feels like moving between apps.
14. **The same thing looks different from page to page.** Two activity row designs, two app tiles and three endorsement row styles. Loading is a spinner or a skeleton, errors say "Retry" or "Try again", and an empty list is an `EmptyState`, a bordered box, a plain note, or nothing.
15. **Feedback has three always-on entry points** (the floating "Feedback Beta" pill, the drawer, the PWA bar), while sign out has one: inside the switcher, without confirmation.
