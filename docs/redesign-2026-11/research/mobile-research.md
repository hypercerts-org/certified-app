# Phone navigation for certified.app: research and recommendation (2026-11-13)

Primary sources where possible: Apple HIG (JSON), Android/Material docs, NN/g, and Bluesky's open-source code. Instagram and LinkedIn behaviour is from press coverage and is marked secondary. After its first full citation, a source is referred to by name only.

**Repo facts that shape this**
- `bottom-nav.tsx` has: Home, Explore (`search`), Create, Apps, and Feedback (a button that opens a modal).
- `personal-only.ts` hides Create, Records, Endorsements and Groups while you act as an organisation, so the tab bar changes shape with the account.
- `acting-as-bar.tsx` adds a second fixed banner under a navbar that auto-hides on scroll.

## 1. Tab bar

- **Use 4–5 tabs, and only for destinations.** Sources: Apple HIG Tab bars ("support navigation, not … actions"; "Avoid overflow tabs"), https://developer.apple.com/design/human-interface-guidelines/tab-bars; Android Layouts and navigation patterns (3–5 destinations), https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns; NN/g Mobile navigation patterns (5 or fewer), https://www.nngroup.com/articles/mobile-navigation-patterns/.
- **Label every tab with one word.** Sources: HIG; NN/g.
  - *Disagreement:* Bluesky ships icon-only tabs (https://github.com/bluesky-social/social-app/blob/main/src/view/shell/bottom-bar/BottomBar.tsx).
- **Never hide a tab for some accounts. Keep it, and explain on the page why it is empty.** Source: HIG ("Don't disable or hide tab bar buttons"). Today's `personal-only.ts` breaks this.
- **Move Create into a top-bar `plus` action.** Sources: HIG Toolbars (actions belong in toolbars), https://developer.apple.com/design/human-interface-guidelines/toolbars; Linear's mobile redesign ("Create Issue … at the top of every screen"), https://linear.app/changelog/2025-10-16-mobile-app-redesign; Instagram's 2025–26 redesign, which moved Create from the centre tab to the top-left (secondary: https://storrito.com/resources/what-instagrams-navigation-redesign-actually-changed/).
  - *Disagreement:* Material recommends a FAB for the one most important action (Android guide), and Bluesky uses a compose FAB. LinkedIn tests a centre "Post" tab (https://www.lindseygamble.com/blog/linkedin-experiments-with-removing-the-video-tab-in-select-countries).
  - Most of the ~10,000 donors rarely create anything, so a centre "+" would waste the best tab slot for them.
- **Take Feedback out of the tabs.** No source treats feedback as a section. Bluesky puts "Send feedback" in its menu footer (`Drawer.tsx`).

## 2. Profile, Settings, Help, sign-out, switcher

- **Put the acting account's avatar at the trailing end of the top bar. Tapping it opens an account bottom sheet.** Sources: Google's account menu (avatar at top-right, a sheet that slides up, account switching plus app settings), https://9to5google.com/2025/10/12/google-account-menu-ios-redesign/; Monzo (switch to the business account by tapping your profile picture on Home), https://monzo.com/help/account-and-profile/account-selector.
- **Add long-press on the avatar as a quick switch, but only as a shortcut.** Sources: GitHub Mobile (long-press Profile, which also shows unread counts per account), https://github.blog/changelog/2023-08-15-log-in-with-multiple-github-accounts-on-github-mobile/; Bluesky `BottomBar.tsx`.
  - *Disagreement:* GitHub, Bluesky and Instagram use a Profile **tab**. Here, Home already is "my account", so a Profile tab would duplicate it.
- **Draw organisation avatars as squares and people as circles.** Source: GitHub Primer Avatar, https://primer.style/react/Avatar.

## 3. Hamburger drawer

- **Remove the drawer.** The five tabs plus the account sheet cover every destination. Sources: NN/g Hamburger menus (2016; on phones, combo navigation was used in 86% of cases versus 57% for hidden navigation), https://www.nngroup.com/articles/hamburger-menus/; Android guide (the drawer "isn't as ideal as the navigation bar").
  - Material 3 Expressive deprecates the drawer (secondary: https://9to5google.com/2025/05/14/material-3-expressive-navigation/).
  - *Disagreement:* Bluesky keeps a drawer next to its tabs because it has more than five destinations.

## 4. Sheets, safe areas, targets, scroll

- **Use bottom sheets for short tasks: the account sheet, overflow menus, pickers, and Feed filters.**
  - Every sheet needs a grabber, a visible Close or Done button, and swipe-down and Back to dismiss.
  - Never stack one sheet on another.
  - Sources: HIG Sheets, https://developer.apple.com/design/human-interface-guidelines/sheets; NN/g Bottom sheets (2023), https://www.nngroup.com/articles/bottom-sheet/.
- **Open the filter sheet at medium height so it can expand to full height. Give it "Reset" and "Show N results".** Source: HIG Sheets (medium detent).
- **Make create and edit full-screen pages.** Source: HIG Sheets ("For complex or prolonged user flows, consider alternatives").
- **Build the sheet as a below-800px presentation of `<AppDialog>`.** This keeps repo rule 7.
- **Pad for the notch and home indicator.** Use `viewport-fit=cover` and `env(safe-area-inset-bottom)` on the tab bar and sheets, `100dvh`, and a `theme-color` for each colour scheme.
  - Sources: web.dev PWA app design, https://web.dev/learn/pwa/app-design; local `mobile-native` skill.
  - Test fixed bottom bars on iOS 26.1+ Safari with the keyboard opened and closed (https://bugs.webkit.org/show_bug.cgi?id=297779).
- **Make tabs and bar buttons at least 44×44 px.** Sources: HIG Buttons (44pt), https://developer.apple.com/design/human-interface-guidelines/buttons; Android accessibility (48dp), https://developer.android.com/guide/topics/ui/accessibility/apps; WCAG 2.5.8 (24px is the AA floor), https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html.
- **Never hide the bottom tab bar.** Source: HIG Tab bars.
- **Hide the top bar on scroll-down only on long feeds, and never while acting as an organisation.** Source: NN/g Sticky headers (2021; hide-and-reveal "work[s] moderately well"; use a 300–400ms slide), https://www.nngroup.com/articles/sticky-headers/.
  - *Disagreement:* Material treats collapsing top bars as standard (https://developer.android.com/develop/ui/compose/components/app-bars).

## 5. Headers and list/detail

- **Give top-level pages a large title that collapses into the compact bar on scroll. Keep it under 15 characters, and don't use the app name.** Source: HIG Toolbars.
- **Use a `chevron-left` icon with no "Back" text, and one primary action at most.** Source: HIG Toolbars.
- **Give each tab its own history.** Re-tapping the active tab returns to its top page, then scrolls to the top. Sources: HIG Tab bars ("preserving the current navigation state"); Bluesky `onPressTab`.
- **Push Records → project → activity as pages, with the tab bar still visible.** Back goes to the logical parent, which also covers standalone PWAs, since they have no browser back button. Source: web.dev PWA.
- **Put Projects, Endorsements, Follows and Lists as secondary tabs at the top of Records.** Source: Android guide.

## 6. Recommendation

**Tabs (labels always shown):**

| Label | Lucide icon | Notes |
|---|---|---|
| Home | `house` | |
| Feed | `activity` | |
| Explore | `compass` | Search field at the top of the page |
| Records | `folder` | When acting as an org: an explanation and a "Switch to personal account" button |
| Apps | `layout-grid` | Option: drop to four tabs if analytics show Apps is little used |

**Top bar:**

| Page type | Leading | Middle | Trailing |
|---|---|---|---|
| Home | Brandmark | — | `plus` (New activity / New project sheet), avatar |
| Feed | Title | — | `sliders-horizontal` with a count of active filters, avatar |
| Explore | Title | — | Avatar; a sticky search field sits under the bar |
| Records | Title | — | `plus`, avatar |
| Apps | Title | — | Avatar |
| Detail | `chevron-left` | Truncated title | One action, plus an `ellipsis` overflow sheet |
| Create / Edit (tab bar hidden) | "Cancel" | Title | "Save"; the form's first row says "As <account>" |

**Account sheet (opened from the avatar):**
1. The current account: avatar, name, handle, and a Personal or Organisation chip.
2. A "Switch to" row for each other account.
3. View public profile (`user-round`).
4. Settings (`settings`).
5. Help (`circle-help`).
6. Send feedback (`message-square`).
7. Sign out (`log-out`).

**Switching accounts:**
- When a switch finishes, close the sheet, show a short "Now acting as X" message, and stay on the current page if the new account can use it.
- While acting as an organisation, the avatar becomes a pill: square org avatar + name + `chevrons-up-down`. The pill is both the indicator and the switcher, and the top bar stays pinned.
- The pill replaces the separate fixed `acting-as-bar` on phones. It is my synthesis, not a single-source pattern.
- Hide `plus` for accounts that can't create.
