# certified.app redesign: design research

13 Nov 2026. Bracketed numbers point to the references at the end.

## Summary

Keep the notary character, but move it out of the chrome and into the content.

- **Navigation is always visible and labelled.** The same destinations appear at every width, in one of three forms: a sidebar at 1300px and up, a rail from 800 to 1299px, or five bottom tabs below 800px. These are Bluesky's breakpoints, and the repo already uses them.
- **The switcher shows who you publish as**, and acting as a group is flagged in three places.
- **Serif is kept for titles and names.** Everything else is Inter.
- **Collections are lists, and shadows are only for floating layers.**
- **There is no brand accent.**

"Modern" should come from fewer lines, quieter chrome and fast feedback. In Linear's words: "Structure should be felt not seen" [5].

**Today's repo has the hidden-menu problem.** On phones, the bottom bar holds Home, Explore, Create and Apps. Feed, Records, Profile, Settings and Help are only in a drawer. The desktop top bar also has a hamburger.

## A. Navigation

1. **Use one ordered set of destinations everywhere.** Your own areas come first, then the network, then apps: Home, Records, Feed, Explore, Apps. Below them sits a footer group: Profile, Settings, Help. Nothing should live only in a drawer or only in the avatar menu. [1][2]
2. **Adapt the navigation to the screen width:**
   - **1300px and up:** a sidebar about 240px wide, holding the switcher, the "New" button, the five labelled destinations and the footer group.
   - **800 to 1299px:** a rail about 76px wide, with each icon above its label.
   - **Below 800px:** a bottom bar.

   Bluesky switches at the same points [3], and Android pairs a bar on small screens with a rail on larger ones [7]. Vercel moved its tabs into a sidebar with a mobile bar in January 2026 [4]. Threads moved to a left rail in April 2026 because features "required multiple taps … to find" [8].
3. **Give phones five tabs.** Each has a 24px icon over a one-word label and is at least 44px tall. The navbar avatar opens the account menu. Home also shows Profile, Settings and Help as visible rows. [2][1]
4. **Take Create and Feedback out of the tabs.** Tabs navigate; they don't act [2]. Make "New" a primary button in the sidebar and in the Home and Records headers, and a "+" in the phone navbar. Move Feedback into Help.
5. **Delete the desktop hamburger.** Hidden navigation costs more on desktop than on phones [1].
6. **Mark the active item with a pill or a 2px bar plus the primary text colour.** Never change the font weight, because it shifts the layout [28]. Dim the sidebar so the content leads [5].
7. **Show only one badge.** Put it on Home, for new endorsements and follows [2].

## B. Account switcher and acting as a group

1. **Show the publishing identity on the trigger.** The trigger shows the avatar, name and handle of the identity that signs new records. When you act as a group, show the group's avatar with yours overlaid small, plus "as @you". Vercel and Stripe both put the switcher top-left [4][12], and Bluesky uses a profile card [3].
2. **Order the menu like this:**
   1. Active identity, with "View profile" and "Settings".
   2. **Act as:** your personal account, then your groups with your role, with a check mark on the current one.
   3. **Your other accounts.**
   4. **Add another account.**
   5. **Sign out**, with a confirmation step. Add "Sign out of all accounts" when more than one account is signed in.

   Bluesky orders it as accounts, profile, add, then sign out with a confirmation [3]. GitHub offers Remove on each account and sign out from all accounts [9]. Notion puts "Log out all" at the bottom [10], and Google offers sign out of all accounts [11].
3. **Keep accounts and groups apart.** Switching account means a different login and a different DID. Acting as a group means the same login with delegated rights. GitHub and Notion keep these in separate sections [9][10]. Slack hid its workspace rail in 2023, users pushed back, and Slack restored it [13].
4. **Make acting as a group unmissable.** Flag it in three places:
   - the trigger;
   - a banner reading "Acting as Ma Earth · you are @you, admin · Switch back";
   - a "Publishing as [avatar] Ma Earth" line above every submit button.

   Never rely on colour alone, and keep the existing `acting-as-bar.tsx`. Stripe's sandbox banner [12] and LinkedIn's "choose Page before commenting" [15] are precedents.
5. **On phones, open the same list in a bottom sheet from the avatar.** Long-press on Profile can be a shortcut but must not be the only path. Google [11], Bluesky [3] and GitHub Mobile [9] all work this way.
6. **After a switch, stay on the equivalent page and show a toast.** Vercel keeps you on the same page between scopes [4]. Show expired accounts with "Sign in again"; don't drop them [9].
7. **Name the account in the Settings header.** List connected apps there with a per-app revoke, as the PDS `/account` page does [14].

## C. Visual language

1. **Keep serif for page titles, profile names and record titles only.** Section, card and dialog titles use Inter 600. Linear pairs Inter Display headings with Inter [6], Geist uses sans headings [16], and Apple builds hierarchy from weight, size and leading together [29].
2. **Limit chrome to four text roles:**
   - title;
   - body, 14–16px;
   - label for navigation and menus, 13–14px at weight 500;
   - meta, 12–13px with tabular figures.

   Geist calls label-14 its "most common" menu style [16]. Primer uses rem units and keeps lines to about 80 characters [17].
3. **Build page headers from the same parts.** An optional visual, then the title, then one line of description (at most 65 characters, in the secondary colour), then a single primary action on the right. On narrow screens, move secondary actions into an overflow menu and add a parent link above the title [17][16].
4. **Lay collections out as rows separated by hairlines or space.** Only objects get a raised surface, such as a record preview or an app tile. Only menus, popovers, dialogs and sheets get shadows [5][16]. Before reaching for a border, try space or a background [19].
5. **Keep colour neutral.** Give each ramp step a fixed role: background, state, border or text [18][16]. Add no brand accent, and keep the status colours. Follow Linear's rule: "Don't compete for attention you haven't earned" [5].
6. **Use lucide icons at 20px in navigation and rows, 16px inline, with a 2px stroke** [20]. In navigation, always pair an icon with a label. Use fewer icons overall, and none on headings [5].
7. **Build empty states from four parts:** a 32px icon, a title, one informative sentence, and one Verb + Noun call to action (for example "New activity", never "Get started"). When filters return nothing, name the filter and offer "Clear filters" [16][17].
8. **Get loading and motion timing right.**
   - Skeletons match the final layout.
   - Delay loading indicators by 150–300ms, and once shown, keep them up for at least 300–500ms.
   - Motion lasts 150–250ms, eases out, and animates only transform and opacity [27][29].

## D. Page archetypes

- **Home.** One narrow column, in this order:
  1. Avatar, name, handle and DID (with copy), plus "View public profile" and "Edit profile".
  2. Counts for Activities, Projects, Endorsements and Followers.
  3. "Received recently".
  4. "Apps you use".
  5. "Groups you manage".

  Google's November 2025 Account page shows avatar, name and email with a shortcut row, and it dropped cards "for a simpler layout" [21]. GitHub's home defaults to "My Work" and puts the feed in a separate tab [22].
- **Public profile.** Avatar, name, handle, bio and counts, then tabs: Activities, Projects, Endorsements, Lists, About. The main action depends on the viewer: Follow and Endorse for others, Edit and Share for the owner. Bluesky's profile tabs are the model [3]. Read.cv closed in 2025 [30].
- **Records.**
  - **Layout:** a list by default, with a grid toggle. Projects come first, then loose activities. Google Drive's "On top" option does the same [23].
  - **Navigation:** inside a project, show a breadcrumb such as "Records / Project", where each crumb is a URL [17].
  - **Actions:** each row offers "Move to project…" and "Add contributor", and rows support multi-select. Contributors appear as an avatar stack.
- **Feed.** Tabs for "Following" and "Trusted endorsers", plus a filter button for Activities, Projects and Endorsements. Filters are kept in the URL [22][27].
- **Apps.**
  - **Directory:** search, category chips and tiles. Each tile shows a logo, name, one line of description, "Writes: …" and "Connected" when connected.
  - **Detail page:** what the app reads and writes, "Open app" and "Disconnect".

  Apple's App Store on the web, launched in November 2025, works this way [24].
- **Settings.** A section list sits beside the selected section. On phones the list becomes its own page, and each section has a back link [17].
  - **Sections:** Account & ID, Profile, Sign-in & devices, Connected apps, Groups, Notifications, Appearance.
  - **Stripe's split:** Personal, Account and Product settings [25].
- **Help.** "How can we help?" with search, five or six task topics, status and contact [26].

## E. Craft checklist

1. **Keep state in the URL:** tabs, filters, the open folder and pagination [27].
2. **Size things for touch.** Targets are at least 24px on desktop and 44px on touch, and phone inputs use at least 16px text. Never disable zoom [27][28][29].
3. **Give feedback on press.** Use `:active` with `scale(0.97)` over 100–160ms. Gate hover styles behind `(hover: hover) and (pointer: fine)`. Replace the tap highlight [29][28].
4. **Animate deliberately** [29][28]:
   - Don't animate frequent or keyboard actions.
   - Grow popovers from their trigger, never from `scale(0)`.
   - Make exits faster than entrances.
   - Use a cross-fade under reduced motion.
5. **Make submits predictable.** Loading buttons keep their label and add a spinner. Disable the button during the request, validate inline, and focus the first error [27].
6. **Follow and endorse optimistically.** On failure, roll back and show a message [28].
7. **Size the shell to the device.** Use `100dvh` and `viewport-fit=cover` with safe-area padding. Set a `theme-color` for each scheme, and put `overscroll-behavior: contain` on sheets [29].
8. **Answer three questions on every screen:** where am I, where can I go, and how do I get out [29].

## Do not

- Put a destination only behind a hamburger, a drawer or the avatar menu.
- Use icon-only navigation or top-bar buttons. Touch has no tooltips.
- Put actions in the tab bar, or add a "More" tab.
- Hide or disable a navigation item because its section is empty. Explain the empty state instead [2].
- Signal acting-as by colour alone, or submit a form that doesn't name who is publishing.
- Mix accounts and groups in one unlabelled list.
- Use two primary buttons in one header, nest cards, or put shadows on cards.
- Use `transition: all`, `scale(0)` entrances, or UI motion longer than 300ms.
- Change font weight on hover or selection.

## Where sources disagree

- **Rail labels.** Android's rail shows labels [7]; Bluesky's 800–1299px rail is icons only [3]. Keep the labels, since the owner wants nothing hidden.
- **Accent colour.** Primer and Stripe use a blue accent. Geist and Linear are near-neutral. Recommendation: stay neutral.
- **Corner radius.** Geist uses 6, 12 and 16px [16], and Linear rounded its tabs in 2026 [5]. The repo uses 2px. This is the owner's call; I'd keep 2px.
- **Calling the start page "Home".** Apple prefers specific labels [29], but Google, GitHub and Bluesky all say "Home". Options to test: "Home", "Account", "My account".
- **Selected icons.** The HIG prefers filled icons [2], but lucide only ships outlines. Use the pill instead.

**Not verified:** Figma, Are.na, Credly and Slack's app directory. The Material 3 and HIG pages render with JavaScript only; the HIG was read through its JSON. Refactoring UI was read only through summaries, because Medium returned a 403.

## References

1. NN/g hidden-nav studies (2016): https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/ · https://www.nngroup.com/articles/find-navigation-desktop-not-hamburger/
2. Apple HIG, Tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
3. Bluesky social-app source (LeftNav.tsx, BottomBarWeb.tsx, breakpoints.shared.ts = 500/800/1100/1300, Profile.tsx): https://github.com/bluesky-social/social-app/tree/main/src/view/shell
4. Vercel, new dashboard navigation (22 Jan 2026): https://vercel.com/changelog/new-dashboard-navigation-available
5. Linear, Behind the latest design refresh (12 Mar 2026): https://linear.app/now/behind-the-latest-design-refresh
6. Linear, How we redesigned the Linear UI II (Mar 2024): https://linear.app/now/how-we-redesigned-the-linear-ui
7. Android, Build adaptive navigation: https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation
8. TNW, Threads web redesign (19 Apr 2026): https://thenextweb.com/news/threads-website-redesign-direct-messages-desktop
9. GitHub Docs, Switching between accounts: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/switching-between-accounts · https://github.blog/changelog/2023-11-03-multi-account-support-on-github-com/
10. Notion Help, workspaces: https://www.notion.com/help/create-delete-and-switch-workspaces
11. 9to5Google, Google account menu: https://9to5google.com/2025/10/12/google-account-menu-ios-redesign/ · https://9to5google.com/2023/01/20/google-account-material-you/
12. Stripe, sandboxes: https://docs.stripe.com/sandboxes/dashboard/manage · multiple accounts: https://docs.stripe.com/get-started/account/multiple-accounts
13. Slack switcher: https://tidbits.com/2023/09/21/how-to-restore-the-slack-workspace-sidebar/ · https://uit.stanford.edu/service/slack/redesign2023
14. atproto, Network account management (May 2025): https://atproto.com/blog/network-account-management
15. LinkedIn Help, comment as your Page: https://www.linkedin.com/help/learning/answer/a700698
16. Vercel Geist: https://vercel.com/geist/typography · /colors · /materials · /empty-state
17. GitHub Primer: https://primer.style/product/components/page-header/guidelines · https://primer.style/product/ui-patterns/navigation · https://primer.style/ui-patterns/empty-states · https://primer.style/product/getting-started/foundations/typography
18. Radix Colors, scale: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
19. Refactoring UI: https://refactoringui.com/ · https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886
20. Lucide icon guide: https://lucide.dev/guide/design/icon-design-guide
21. 9to5Google, Google Account web redesign (Nov 2025): https://9to5google.com/2025/11/28/google-account-web-redesign/
22. GitHub home dashboard (Aug 2025): https://github.blog/changelog/2025-08-28-improvements-to-the-home-dashboard-available-in-public-preview/ · feed filters (Sep 2023): https://github.blog/changelog/2023-09-06-updates-to-your-github-feed/
23. Google Drive Help: https://support.google.com/drive/answer/2375177
24. 9to5Mac, App Store web (Nov 2025): https://9to5mac.com/2025/11/03/apple-launches-rich-new-web-interface-for-the-app-store/ · https://vercel.com/marketplace
25. Stripe, Dashboard basics: https://docs.stripe.com/dashboard/basics
26. Vercel Help: https://vercel.com/help
27. Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
28. Rauno Freiberg, Web Interface Guidelines: https://interfaces.rauno.me/
29. Local skills: .claude/skills/emil-design-eng, apple-design, mobile-native (SKILL.md)
30. TechCrunch, Perplexity acquires Read.cv (17 Jan 2025): https://techcrunch.com/2025/01/17/perplexity-acquires-read-cv-a-social-media-platform-for-professionals/
