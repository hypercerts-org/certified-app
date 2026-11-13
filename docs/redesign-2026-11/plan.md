# Certified redesign, November 2026: plan

Owner brief (2026-11-13): give certified.app a newer, more modern design across every page, and make it intuitive and simple, with no menus hidden in odd places. The destinations are Home (my account), Explore (the network), Feed (what's happening), Apps, Records (my workspace), the public profile, Settings, Help, and an account switcher.

Research behind this plan (scratchpad, not committed): design practice (navigation, switcher, visual language, page archetypes, craft), phone navigation, Records UX, and profile/home/explore. Bluesky's web client uses our exact breakpoints (800/1100/1300), so its layouts map onto ours.

## 1. Direction

Keep the notary character, but carry it in the content rather than in the chrome. The app stays monochrome, with a near-black primary, warm greys and the 2px radius. Noto Serif is now kept for the things that are named: page titles, account names and record titles. Everything else is Inter. The modern feel comes from:

- one clear navigation that looks the same on every page;
- one page header pattern;
- fewer lines and boxes;
- lists made of rows rather than stacks of cards;
- quieter chrome, so the content leads;
- fast feedback.

The aim is that each page answers three questions: where am I, where can I go, and how do I get back.

## 2. Navigation

There are five destinations, in the same order everywhere: **Home · Feed · Explore · Records · Apps**. Nothing lives only in a drawer.

**Desktop (800px and up): one top bar**

- On the left, the brandmark (linking to Home), then the five destinations as labelled links (icon plus word). The current one gets a sunken pill and the primary text colour, with no weight change.
- On the right, in order:
  - the search field (`/` focuses it);
  - a **New** button that opens a menu: New activity, New project, New group;
  - the **account button**: avatar, name and handle. While acting as a group it shows the group (square avatar) and "as @you".
- Profile, Settings, Help and the desktop hamburger leave the bar.

**Phone (below 800px)**

- The top bar shows the brandmark on Home and the page title elsewhere. Detail pages show a back chevron. On the right are a `+` (the New menu, as a bottom sheet) and the avatar (the account sheet).
- The bottom tab bar has Home, Feed, Explore, Records and Apps, each with a 24px icon over a label and at least 44px tall. It never hides tabs.
- No hamburger, and no drawer.

**Account menu** (a popover on desktop, a bottom sheet on phones), in this order:

1. **Current account:** avatar, name, handle, a "Personal" or "Group · role" tag, and **View profile**.
2. **Switch account:** your personal account first, then each group with your role, with a check on the current one. Then **New group**.
3. **Settings**, **Help** and **Send feedback**.
4. **Sign out**.

**Acting as a group** must be impossible to miss. It shows in three places: the account button shows the group, the existing acting-as bar stays, and Create forms keep their "publishing as" line.

**Records while acting as a group** stays in the navigation. The page explains that records are managed on the personal account and offers a "Switch to personal account" button, rather than hiding the tab.

**Duplicates removed:**

- `/endorsements` redirects to `/records?kind=endorsements`.
- `/workspace` (a prototype) redirects to `/records`.

### Fixes from the audit of today's app

- **Phone bottom tab bar.** Today it appears only in the installed app. In a phone browser everything sits behind the hamburger. The new tab bar shows in every phone browser.
- **Phone profile pages.** Today they show only a floating back button, with no menu, no switcher and no title. They get the normal phone top bar.
- **Four disagreeing menus become one set.** Today these are the desktop links, the phone drawer, the installed-app bar and the switched-off `SiteDrawer`.
- **Endorsements in one place.** Today they are managed in three places, with three wordings. `/records?kind=endorsements` becomes the one place, and the profile tab links to it for the owner. Wording: Show / Hide.
- **Account switcher.** "Switch account" today is an unlabelled icon that replaces the session. In the new menu it is a labelled row. Group rows show the group's handle with your role as a tag. "New group" is in the menu.
- **Signed-out dead ends.** `/create` and `/project/new` get a Sign in button. The installed-app bar no longer shows Create to signed-out visitors.
- **Help graph pop-up.** Today it blanks the page title and breaks the page width. Both are fixed.

### Headings and the h1

- Top-level pages render a **`PageHeader`**, whose title is the page's visible `<h1>`.
- The desktop top bar no longer shows a page title. The phone top bar shows the brandmark on top-level pages, and a back chevron with a compact title on detail pages.
- **Fallback for pages without a `PageHeader`:** the chrome still renders the page title as an h1. It is visually hidden on desktop and visible in the phone bar on detail pages, so every page keeps exactly one h1.
- **How the chrome knows:** `PageHeader` registers itself through `navbar-context` (`useRegisterPageHeader`). The chrome reads `useHasPageHeader()` and skips its own h1 when a header is present.

## 3. Visual system

These changes go into tokens and primitives. `tokens.css` stays the only place values live.

**Type roles**

- **Title:** `font-headline` at `text-h1` / `text-h2` / `text-h3`, for page titles, profile names, record titles, and empty-state and dialog titles.
- **Section title:** Inter 600 at 1rem (new utility `text-section`), for section headings inside a page.
- **Body:** 15–16px.
- **Label:** 13–14px at weight 500.
- **Meta:** 12–13px with tabular numbers.

CLAUDE.md rule 6 is updated to allow `text-section` for section headings.

**`PageHeader` primitive.** This is one pattern for every page:

- an optional back link or parent above;
- the title (serif `text-h2`);
- one line of description in the secondary colour;
- actions on the right, with at most one primary.

On phones the actions wrap below the title.

**`PageContainer` widths**

- `narrow`: 720px, for Help and forms.
- `default`: 1120px.
- `wide`: 1280px, for the profile.

All use the same gutters: 16px on phones, 24px on tablets, 32px on desktop.

**`SideNav` primitive.** One vertical list of sections, used by Records, Settings and Explore. Each item has an icon, a label and an optional count. On phones it becomes a horizontally scrolling pill row.

**`SectionHeader` primitive.** A section title, an optional description and an optional action or "See all" link.

**Surfaces**

- Lists are rows separated by hairlines.
- Only objects get a surface: account card, app tile, record preview.
- No nested cards.
- Shadows only on floating layers.

**Icons.** Lucide, 20px in navigation, 16px inline. A navigation icon always has a label, and headings have none.

**Empty states.** A 32px icon, a title, one sentence and one Verb + Noun action. "Nothing matches" names the filter and offers to clear it. Never show "0" or "none" while loading; show skeletons shaped like the content instead.

**Motion.** 150–250ms with ease-out, on transform and opacity only. Press feedback is scale 0.97. Reduced motion falls back to a fade.

## 4. Pages

| Page | What changes |
|---|---|
| **Home** | Same blocks as now: the account card with profile and ID, your groups, your records, from others, and apps. They are restyled with PageHeader, SectionHeader and rows. Count tiles become a quieter inline stat row. Loading shows skeletons, not zeros. |
| **Feed** | PageHeader ("Feed"). Desktop keeps three columns (filters, feed, news). The phone keeps the "For you" filter, opened as a bottom sheet. |
| **Explore** | Search first, then type chips (All, Activities, Projects, Accounts), then the sections. The left SideNav keeps Recently viewed, Accounts I follow, Endorsed accounts and All, with Featured inside All. |
| **Apps** | PageHeader, then a responsive grid of app tiles (logo, name, one-line description, "Open"). |
| **Records** | SideNav for kinds. Projects / Activities keeps folders (the owner's request). Activities can be selected (a checkbox per row), which brings up an action bar with "Add to project…": a picker with search and one checkbox per project, ending in "New project from selection". Each project folder gets "Add activities" and "Remove from project". Activity rows show contributor avatars and the other projects they belong to. While acting as a group the page shows the explanation and a switch button. |
| **Profile** | A cleaner header: avatar, serif name, handle, bio, links, and Follow/Endorse or Edit/Share. A trust line names who endorsed the account. The tabs are tidied, and an owner bar reads "This is how others see your profile" with a link back to Home. |
| **Settings** | SideNav sections and PageHeader. Each section is rows (label, explanation, control), and the header names the account the settings apply to. |
| **Help** | PageHeader, a contents SideNav and readable article columns. The content is the same. |

## 5. How the work is done

1. **Foundation** (one pass, on `staging`): the primitives (PageHeader, PageContainer, SideNav, SectionHeader), type roles, the shell (top bar, account menu and sheet, bottom tabs, phone top bar, New menu), the redirects, and the docs (DESIGN.md, CLAUDE.md rule 6).
2. **Pages**, in parallel, each in its own worktree and owning its own files: Home + Apps, Feed + Explore, Records, Profile, Settings + Help. Merged into `staging` one by one.
3. **Review round 1:** browser checks on staging (desktop, signed in), headless phone screenshots of the local preview, and independent reviewers on intuitiveness, consistency, accessibility and design-rule compliance. Then fixes.
4. **Review round 2:** a fresh set of reviewers, then fixes.
5. **Morning summary** for the owner: what changed, screenshots, open questions.

## 6. Guardrails

- Everything stays on `staging`. Nothing goes to `main`.
- Tokens only (no raw colours), the 800/1100/1300 breakpoints, the `--z-*` tokens, `<AppDialog>` for dialogs, and the `Button size="icon"` + `aria-label` pattern.
- Dark mode must keep working.
- Data, hooks and write paths stay as they are unless a page needs a new action (Records: add to or remove from a project).
- Every commit must pass `npx tsc --noEmit`, `npm run lint`, `npm run lint:css` and `npx vitest run`.
