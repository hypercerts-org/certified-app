# Certified redesign, November 2026: what changed

Done overnight on 12–13 November 2026, on `staging` only (`main` is untouched). The plan is in [plan.md](plan.md) and the research in [research/](research/). The work came in four steps:

1. Research.
2. A foundation step: shared page parts and one navigation.
3. Six page redesigns, done in parallel.
4. Two review rounds (six reviewers, each from a different angle), each followed by a fix round, then a final check for broken pages.

## The idea

The notary character stays: monochrome, warm greys, the 2px radius, and a serif for names and titles. It now lives in the content rather than in the navigation and page furniture. The app feels more modern because of five changes:

- the same navigation on every page;
- one page header pattern;
- rows instead of stacks of cards;
- quieter navigation and page chrome;
- nothing hidden in odd menus.

## Navigation

**Three destinations, in the same order everywhere:** Workspace | Network · Apps (added after the first review). Workspace is what your account holds and what you manage: the Overview (what Home was), the Records sections and Groups, behind one side list. Your personal account and each of your groups is a workspace: Workspace in the navigation shows the one you are in and switches between them (there is no separate "acting as" banner). Network is everyone's work, five pages: Feed, Explore, Graph (the endorsement network), Map (coming) and Funding (coming), picked from the Network menu. Apps are the other apps that work with your account.

**Desktop**

- One top bar: the wordmark with a Beta tag, the labelled destinations (Workspace, a divider, then Network and Apps), search, a black **New** button and your account.
- New offers: New activity, New project, New group.
- Profile, Settings and Help moved into the account menu.

**Phone**

- A bottom tab bar with the same three tabs (Workspace, Network, Apps), in every browser. Before, it only appeared in the installed app.
- The top bar shows the wordmark with a Beta tag, **+** (the New menu) and your avatar.
- Detail pages get a back chevron.
- The hamburger and the drawer are gone.

**Account menu** (a popover on desktop, a sheet on phones), top to bottom:

1. Your account, with View profile.
2. Switch account: you, then your groups with your role. Then New group.
3. Settings, Help, Send feedback. Appearance (light, dark or system) is in Settings only.
4. Sign in with another account. This now really asks who is signing in.
5. Sign out, after a confirmation.

**Acting as a group** reads "Acting as {Group} · {Role}" with "Switch to personal account".

**Duplicate pages removed**

- `/endorsements` redirects to Records → Endorsements.
- `/workspace` redirects to Records.

**Footer**: Help and Feedback, for everyone including signed-out visitors. It is the only Feedback button: the floating one is gone. The theme switch (Appearance) is in Settings only.

## Pages

- **Home**
  - The header is you: avatar, name, bio and website. No buttons: the name opens your profile, which has Edit.
  - Then Your records, as counts plus the latest items, and Endorsements and followers: endorsements received and given side by side, and followers.
  - Apps shows the first four partner apps.
  - On the right, level with the header, sit two white boxes: your ID (handle and Permanent ID, each copyable) and Your groups, each group with a Switch button.
  - On phones the order is: header, ID, groups, records, from others, apps.
- **Feed**
  - A page header.
  - Desktop has three columns:
    - the filters, led by "Trusted endorsers", with its explainer and a preview of each endorser;
    - the feed;
    - News from Certified, hidden when there are no posts.
  - Phones get a Filters button that opens a sheet.
- **Explore**
  - Search first, then type tabs.
  - A side list: Whole network, Accounts I follow, Endorsed accounts, Recently viewed.
  - Filters opens a sheet on phones.
- **Apps**: one app tile, shared with Home, in a grid.
- **Records** (the workspace)
  - Kinds down the left: Projects and activities, Endorsements, Followers, Lists.
  - Projects are folders of their activities, plus "Without a project". Each activity row shows contributor avatars and tags for its other projects.
  - **Select several activities, then "Add to project…"**: a picker with "New project from selection". Saving is immediate and comes with Undo. Each folder has "Add activities" and "Remove from project".
  - Endorsements has Received, Given and Endorsement lists, with Show and Hide for received ones.
  - Followers has two tabs: Followers (who follows you) and Following (who you follow). Old `?kind=following` links open the Following tab.
  - Lists has a tab per kind: Activities, Projects, Accounts and Endorsements (endorsement lists, also under Endorsements). Each tab has its own "New list".
  - While acting as a group, Records points you to the group's profile.
- **Public profile**
  - The header shows banner, avatar, name, handle, bio, links, the Permanent ID, and an organisation's type, location and founding date.
  - A trust line: "Endorsed by A, B and N others".
  - One tab strip under the header on every width. Every tab is now rows.
  - Your own profile shows "This is how others see your profile."
  - **One profile editor**: `/{handle}?edit=1`. Home and Settings link to it, and `/settings/edit-profile` redirects there.
- **Record pages** (activity and project)
  - One header: the title, the author, Edit and ⋯.
  - The tabs are in the page.
  - Labels are in sentence case.
  - A project's activities show as rows.
- **Create and edit**
  - Each form has a page header with a back link and one action bar ("Publishing as …", Cancel, Publish). The bar stays at the bottom of the screen.
  - Create and Edit now use the same form.
- **Settings**
  - The header names the account the settings apply to.
  - Sections are listed down the left, and each section is a set of rows.
  - "Social graph" leads its section, with "Sync with Bluesky" (and what it does) under it.
- **Help**: a contents list, an article, and a Send feedback button at the end. The content is the same.

## Accessibility and robustness (from the reviews)

- **Keyboard and focus**
  - Every menu works with the keyboard, including menus that open over the page: focus moves into the menu and the arrow keys work.
  - Phone sheets move focus inside and block the page behind them.
  - Dialogs give focus back to the control that opened them.
- **Headings**: exactly one h1 per page.
- **Inputs on phones**: 16px text, so the screen doesn't zoom in.
- **Fixed bars**
  - Bars never cover the field you're typing in.
  - Sticky elements sit below the acting-as bar.
- **Loading and errors**
  - Loading shows skeletons, never a "0".
  - Load errors show inline with "Try again".
- **Records data**
  - Records loads all of your projects, up to 500, and says so when it stops there.
  - A failed project load no longer looks like "all without a project".

## Rules and docs

- **CLAUDE.md rule 6**: section headings inside a page use `text-section` (Inter 600). The serif is kept for page titles, names and record titles.
- **DESIGN.md** documents:
  - the new building blocks (`PageContainer`, `PageHeader`, `SectionHeader`, `SideNav`, `StatRow`);
  - the shell;
  - `--chrome-top` and `--bg-selected`;
  - neutral counts and the single error pattern;
  - the changelog.

## Open questions and follow-ups

- **Radius**: still 2px. A more "modern" look could use a softer radius; that's a brand decision for you.
- **Workspace on phones**: its six sections are one row of pills that scrolls sideways (the current one scrolled into view), so the last ones start off-screen.
- **Profile**: the endorsement-list manager moved from the profile's Endorsements tab to Records. The tab now links there.
- **Group profile editing**: `/groups/{did}/edit-profile` remains for admins who aren't currently acting as the group.
- **Not redesigned**:
  - the landing page (`/welcome`), which has its own header;
  - group records, which can't be managed from Records; the page points to the group's profile instead.
- **Small cleanup left**:
  - `ProfileEditForm` and its CSS are now used only by a preview page;
  - `profile-projects.css` and `profile-groups.css` contain only comments;
  - the `.profile-certs*` rules in `layout.css` are dead;
  - `usePageRecordMenu` and `not-found-marker` have no remaining users.
- **Builds**: Turbopack builds can't run on this machine (a local port restriction). Webpack compiles, and Vercel's staging builds pass.
