# Taste proposals (not applied)

Each item is a judgement call that was left for you. IDs match `findings/*.json`. Accept, reject or tweak; anything accepted can be done in a follow-up batch.

## From the visual pass (staging, signed in)

- T1 Profile header: 240px initials avatar dominates the left column on desktop; consider ~128-160px.
- T2 Profile stats cards: "Projects" card has one number and an empty right half; numbers and "created/contributed" labels sit far apart. Consider label-under-number or a single-row stat strip.
- T3 Group/profile actions: "Follow" and "Endorse" are both solid primary side by side; make one secondary.
- T4 Feed card: when author has no display name, the handle is shown twice (name line + @handle line). Show once.
- T5 Feed card titles truncate to one line with ellipsis; a 2-line clamp would keep most titles readable.
- T6 Feed images are centred narrower than the text column while the title below is indented to the text column; image and title edges don't align.
- T7 Endorsements empty state says "Use the New button above"; put the action in the empty state itself.
- T8 Explore left nav selected item is a solid black block, heavier than any other selected state in the app (settings nav uses the same; consider subtle bg + weight).
- T9 Settings opens with the DID as the first field; it is reference-only and technical. Move to the bottom / Advanced.
- T10 Apps page has no heading, only a sentence; cards have no visible "open" affordance.
- T11 Profile mobile tabs scroll horizontally with no edge fade; "Endorseme" is cut with no hint there is more.
- T12 Mobile profile header: "5 activity claims" uses a different term than the "Activities" tab.


## Owner decisions (2026-10-22)

All items below accepted as proposed, except O03 (skipped) and R01-R05 (rejections confirmed). Deferred decisions:

- Explore search: keep both inputs.
- Page h1: the chrome title is the h1 everywhere; pages use h2.
- Mobile toolbar controls: keep the visual size, extend the tap area to 44px.
- "Sync social graph": keep.
- Location typeaheads -> `<Combobox>`: dropped.
- Apostrophes: straight everywhere.
- "Copy AT URI": keep (copy-14 still renames the bulk-add dialog).

## Decisions the fixers deferred to you

- **Explore has two search inputs** (global top bar + "Search all of Explore"), flagged in June too (V10). Keep both, or drop one?
- **Chrome renders the page title as an `<h1>`, and some pages add their own** (shell-08). Most titled pages have no h1 of their own, so the chrome h1 stays for now. Decide: chrome title as h1 everywhere (pages use h2), or pages own their h1.
- **"Sync social graph" in personal Settings** vs "Import Bluesky follows" elsewhere (copy-30). The settings section syncs both ways, so it wasn't renamed.
- **Mobile toolbar controls are 28-30px** (PRF-14), below the 44px touch target. Deliberate density, or raise them?
- **Location typeaheads re-implement `<Combobox>`** (PRF-17). A refactor, not a polish fix.
- **App-wide straight vs curly apostrophes** (copy-38). Pick one.
- **"Bulk add by at-URI" / "Copy AT URI"** kept as-is for power users (copy-g7).

## From the code reviews

### App shell, navigation, primitives, settings

- **shell-33** (medium) `src/components/layout/desktop-top-bar.tsx:446` — The desktop icon nav (Home, Apps, Profile, Settings, Help) gives no visual indication of the current section. Only hover changes the colour, so on /settings or /apps nothing in the chrome shows where you are.
  - Proposed: Proposal: an active treatment matching the bottom-nav (color: var(--fg-primary) + heavier strokeWidth, or a 2px underline using var(--fg-primary)), keyed off pathname.
- **shell-34** (medium) `src/components/layout/desktop-top-bar.tsx:572` — The signed-out 'Sign in' button is an image of a solid black pill with white text (certified_signin_black.svg) with no dark-mode variant. On the dark canvas (#18181b) the pill's edge disappears and it reads as floating text. The mobile navbar already swapped to <Button variant="secondary">Sign in</Button> for a similar reason.
  - Proposed: Proposal: either use <Button variant="primary" size="sm">Sign in</Button> (theme-aware tokens), or ship a light SVG variant swapped under [data-theme="dark"].
- **shell-35** (low) `src/components/settings/settings-panel.tsx:339` — On desktop /settings the breadcrumb shows only '@handle'. The word 'Settings' appears nowhere visible (the h1 is sr-only), so the page title is just the selected sub-page h2 ('Account').
  - Proposed: Proposal: make the breadcrumb '@handle / Settings' (right: { text: "Settings", href: "/settings" }) so the chrome names the page.
- **shell-36** (low) `src/components/layout/bottom-nav.tsx:58` — Bottom-nav items are icon-only on touch: Tooltip is suppressed on coarse pointers, and there is no visible label. The CSS comments still describe an 'icon+label cluster'. Icons like LayoutGrid ('Apps') and Newspaper ('Home') are ambiguous without text.
  - Proposed: Proposal: add a small 0.6875rem label under each icon (as .desktop-top-bar__icon-label already does on desktop).
- **shell-37** (low) `src/components/ui/sign-in-modal.tsx:81` — Sign-in renders <AppDialogHeader title="" ...>, which draws an empty header strip with a border-bottom hairline above the brandmark. The result is a visible divider with no title.
  - Proposed: Proposal: render only the close button (or add a 'borderless' option to AppDialogHeader) for title-less dialogs.
- **shell-38** (low) `src/components/layout/auth-guard.tsx:20` — A signed-out visit to /settings (or any AuthGuard route) silently router.replace('/')s away with no explanation and no return-to. The SignedOutPrompt primitive exists for this case on other personal surfaces.
  - Proposed: Proposal: render <SignedOutPrompt title="Sign in to manage your settings" .../> in place, or redirect with ?next= so sign-in returns the user to the deep link.
- **shell-39** (low) `src/components/right-rail/news-section.tsx:45` — The News section's error state ('Couldn't load posts.') has no retry. Post timestamps show only relative time with no absolute date on hover.
  - Proposed: Proposal: add a ghost 'Try again' action on error, and title={new Date(createdAt).toLocaleString()} on the <time>.
- **shell-40** (low) `src/app/styles/layout.css:9` — The mobile-sidebar theme cycle toggle (.theme-toggle-cycle, 36x36) and the legal links (.mobile-sidebar__legal-link, 0.75rem inline text) are below 44px. Both render only under 800px.
  - Proposed: Proposal: grow .theme-toggle-cycle to 44x44 (keeping the negative margins), and give the legal links padding: 8px 0 / display:inline-block.

### Feed, record detail, explore, endorsements, graph

- **feed-29** (low) `src/components/visualization/endorsement-graph.tsx:941` — Zoom controls use text glyphs ('+', '−', '⤢') and three hand-inlined SVGs (fullscreen, chevron, external-link), while the rest of the app uses lucide icons at fixed sizes. The glyphs render at font-dependent sizes and weights.
  - Proposed: Use lucide Plus, Minus, Scan/Maximize2, Maximize/Minimize, ChevronDown and ArrowUpRight at size 16 and strokeWidth 1.75 to match the other icon buttons.
- **feed-30** (low) `src/components/home/home-feed.tsx:333` — Home feed, explore results, endorsements lists and the activity detail all load behind a centered spinner, though <Skeleton> and ActivityCardSkeleton exist. The spinner-to-content jump causes layout shift on the feed's main surface.
  - Proposed: Proposal: render 3-4 skeleton cards that match .home-feed__card (avatar circle, two text lines, 1:1 image box) for the initial feed load, and skeleton rows for endorsement lists.
- **feed-31** (low) `src/components/home/home-feed.tsx:357` — The feed empty states ('You're not following anyone yet', 'No activity yet') and the record 'Not found' page (src/app/[actor]/[type]/[rkey]/page.tsx:52) are dead ends with no next action. The follow-list error Banner says 'Please try again later' with no retry.
  - Proposed: Proposal: add an action (for example 'Explore accounts' linking to /explore?show=accounts) to the not-following empty state, 'Go to Explore' on Not found, and a Retry button on the follows error banner.
- **feed-32** (low) `src/app/endorsements/page.tsx:71` — The endorsements empty states are bare <p class="endorsements-empty"> (a 240px centered muted line), while other surfaces use <EmptyState icon title description>. The ConfirmDialog copy also mismatches: the title is 'Revoke endorsement' but the body says 'Do you really want to delete this endorsement?'.
  - Proposed: Proposal: use <EmptyState icon={Award} …> for both tabs, and change the dialog body to 'Revoke your endorsement of {name}? You can endorse them again later.'
- **feed-33** (low) `src/app/styles/home.css:124` — The home sidebar section headings (h2.home-section__title) are 0.7rem uppercase eyebrows, and the feed filter headings are 0.6875rem uppercase. Both are below the canonical type scale and read as microcopy. Hard rule 6 asks headings to use text-h* + font-headline, but these are deliberately eyebrow-style nav labels.
  - Proposed: Proposal: either keep the eyebrow style and demote the element to a non-heading label (with an aria-labelledby section), or move to a canonical small-heading token. This is an owner decision.

### Profiles, projects, groups, create, funding

- **PRF-19** (low) `src/components/project/project-detail.tsx:962` — The project head actions (.project-detail__edit-btn and .project-detail__delete-btn, raw <button> plus Tooltip), .project-detail__add-cert-btn (1303), .project-detail__add-cert-cancel (1324) and .project-detail__desc-preserve-cta (1254) are bespoke button vocabularies instead of <Button> (variant secondary/ghost, size sm, size icon with aria-label).
  - Proposed: Migrate to <Button>. The delete trigger becomes <Button size="icon" variant="ghost" aria-label="Delete project">. Review the visual delta first.
- **PRF-22** (low) `src/components/profile/profile-projects.tsx:186` — Load-error EmptyStates (projects, groups at profile-groups.tsx:177, followers at profile-followers.tsx:326/416) show the raw error message and offer no recovery action.
  - Proposed: Pass an action={<Button size="sm" variant="secondary" onClick={retry}>Try again</Button>} and use a friendly description, logging the raw error.
- **PRF-32** (low) `src/app/groups/[groupDid]/edit-profile/page.tsx:185` — The page H1 is just "Edit", and the save button reads "Save Changes" (Title Case), while profile-edit-form uses "Save changes" (sentence case).
  - Proposed: Use "Edit group profile" and "Save changes".
- **PRF-33** (low) `src/components/groups/org-settings.tsx:1094` — Audit log rows show the actor as a raw DID and the timestamp via bare toLocaleString() (seconds included, no relative time), which is hard to scan next to the rest of the app's hydrated identities and formatted dates.
  - Proposed: Render the actor with HydratedIdentityRow or an @handle (DID in title), and format the date with the shared date helper (formatShortDate or relative time, with the full timestamp in <time title>).
- **PRF-34** (low) `src/components/funding/funding-receipt-form-modal.tsx:175` — The funding form hand-rolls role radio pills (.funding-form__direction) and raw inputs and textareas (.funding-form__input) instead of <SegmentedControl>/<Radio> and <Input>/<Textarea>, so it duplicates focus, error and size chrome.
  - Proposed: Migrate to the ui primitives (SegmentedControl for role, Input with label for amount, date and details, Textarea for notes) and delete the duplicated funding-form.css input rules.

### Public pages, onboarding, dashboard

- **PUB-27** (low) `src/components/landing/sections/explore-profiles.tsx:33` — Internal links ('Explore the network' and each profile row) open in a new tab (target=_blank) from the landing page. That breaks back-button flow for a same-site destination and isn't announced.
  - Proposed: Proposal: open internal /explore and profile links in the same tab. If new-tab is intentional, add visually hidden '(opens in new tab)' text.
- **PUB-28** (low) `src/components/landing/landing-topbar.tsx:34` — The landing theme toggle is a bespoke icon-only <button class=lp-topbar__theme> rather than <Button size="icon">. ui/theme-toggle.tsx also exists. It is accessible (aria-label present), but it adds another icon-button vocabulary (hard rule 8/10).
  - Proposed: Proposal: render <Button size="icon" variant="secondary" aria-label> with an lp- modifier for the hairline and off-white skin, or document the landing exception in DESIGN.md §10.
- **PUB-29** (low) `src/app/terms/page.tsx:31` — Terms (622 lines) and Privacy (513 lines) are long numbered documents with no in-page table of contents or anchor ids on the section headings, so readers can't jump to or deep-link a clause.
  - Proposed: Proposal: add id slugs to each h2 and a compact contents list under 'Last updated'.
- **PUB-30** (low) `src/components/tour/product-tour.tsx:530` — The tour card always shows 'Tip: use the ← and → arrow keys…', including on touch devices where there is no keyboard.
  - Proposed: Proposal: hide .product-tour__kbd-hint under @media (hover: none) / (pointer: coarse).
- **PUB-31** (low) `src/app/help/page.tsx:29` — /help puts its H1 inside the first <section> with mb-4. The other legal-style pages use a standalone H1 with mb-8 followed by a meta line, so the help page's heading rhythm differs from its siblings.
  - Proposed: Proposal: move the H1 above the prose block with mb-8 to match privacy, terms, dsa and imprint.

### Motion

- **M09** (low) `src/app/styles/layout.css:470` — Bottom-nav press: `transition: transform` is declared only inside `:active`, so the press animates in 150ms but release snaps back from 0.92 instantly (visible pop). Scale 0.92 is also deeper than the 0.95-0.98 range used everywhere else (Button 0.98, navbar back 0.95, top-bar sign-in 0.97).
  - Proposed: Move `transition: color var(--transition-fast), transform var(--transition-fast)` to `.bottom-nav__item` base and use `transform: scale(0.95)` on :active. Update DESIGN.md §4 line 321 to match (M30).
- **M16** (medium) `src/app/styles/view-transitions.css:49` — Mobile page slide animates the whole `root`, so the fixed navbar and bottom nav slide out with the page — persistent chrome should stay put (the desktop path already avoids this for the same reason).
  - Proposed: Give `.navbar` `view-transition-name: site-navbar` and `.bottom-nav` `view-transition-name: bottom-nav`, and add `::view-transition-group(site-navbar), ::view-transition-group(bottom-nav) { animation: none; }` (guard against duplicate names when the navbar is hidden).
- **M17** (medium) `src/app/styles/view-transitions.css:96` — Desktop tab switch (profile / project / activity tabs, tens of times a day) re-mounts the panel with a 300ms, 64px slide+fade. For a frequent action that is long and travels far; the content also starts at opacity 0 so it feels like a delay.
  - Proposed: `tab-panel-in-*`: `from { opacity: 0; transform: translateX(±12px) }`, `animation: 180ms cubic-bezier(0.16,1,0.3,1) both`. Keep the reduced-motion `animation: none`.
- **M21** (low) `src/components/ui/drawer.tsx:104` — Site drawer uses `duration-300 ease-out` (Tailwind's weak default curve) both ways; DESIGN.md says the sidebar slides in with the house spring curve. Exit at the same 300ms as entry feels sluggish when dismissing.
  - Proposed: Panel: `ease-[cubic-bezier(0.16,1,0.3,1)] duration-300` when opening, `duration-200` when closing (`open ? 'duration-300' : 'duration-200'`). Backdrop: `duration-200`.
- **M22** (low) `src/components/ui/toast.tsx:281` — Toasts fade/rise in (150ms) but vanish instantly on dismiss/auto-timeout; the remaining stack jumps.
  - Proposed: On dismiss mark the toast `leaving`, apply `opacity:0; transform: translateY(8px)` with `transition: opacity 150ms ease-out, transform 150ms ease-out`, remove on transitionend (motion-reduce: remove immediately).
- **M23** (low) `src/app/styles/fancy-contributor-board.css:155` — Deluxe board tile hover: 700ms `ease` sheen glide, -3px lift + scale(1.025), shadow-lg, ungated on touch (tap leaves the tile lifted). Every tile also carries `transform: translateZ(0)` (line 103) — a permanent compositor layer per tile — and the 22s ambient drift animates a blur(8px) layer forever.
  - Proposed: Gate all `.fancy-tile:hover*` rules in `@media (hover: hover) and (pointer: fine)`; sheen `transform 400ms ease-out`; drop `translateZ(0)` (the hover transition promotes on demand). Keep the drift (reduced-motion covered) but consider pausing it off-screen via IntersectionObserver.
- **M25** (low) `src/app/styles/feed.css:749` — Three different pulse recipes: Tailwind `animate-pulse` (2s, opacity 1->0.5, cubic-bezier(0.4,0,0.6,1)) for <Skeleton>, `map-skeleton-pulse` (1.4s, 0.4->0.7), LoadingSpinner (pulse at 1.5s). DESIGN.md documents 0.4->1 over 1.4-1.5s. Skeletons also start pulsing on frame 1, so sub-300ms loads flash a skeleton.
  - Proposed: Override Tailwind `pulse` in tailwind.config.ts: `keyframes.pulse { '0%,100%': {opacity:'1'}, '50%': {opacity:'.5'} }`, `animation.pulse: 'pulse 1.5s ease-in-out infinite'`; delete map-skeleton-pulse in favour of `animate-pulse`. Optionally fade skeletons in with `animation: modalFadeIn 150ms ease-out 200ms both` so fast loads never show them.
- **M28** (low) `src/app/styles/landing.css:492` — Hero copy starts at opacity 0 and staggers 600ms with 0-300ms delays (last line settles at ~900ms). The h1 is the LCP element; hiding it until the animation runs delays LCP and the stagger is 100ms (above the 30-80ms band).
  - Proposed: Exclude the h1 from `.lp-hero__reveal` (or start it at `opacity: 1` and animate only `transform: translateY(8px)`); stagger 60ms; duration 500ms.
- **O01** (low) `src/components/ui/popover.tsx:533` — OPPORTUNITY (spatial consistency, occasional): Popover/menus (account menu, row overflow menus) appear instantly with no link to their trigger.
  - Proposed: On the panel: `transition: opacity 120ms ease-out, transform 120ms cubic-bezier(0.16,1,0.3,1); transform-origin: top right` (top left for align=start); `@starting-style { opacity: 0; transform: scale(0.97) translateY(-2px); }`. No exit animation (close instantly). Reduced motion: opacity only.
- **O02** (low) `src/components/tour/product-tour.tsx:430` — OPPORTUNITY (preventing jarring change, rare/first-run): tour card and spotlight teleport between steps.
  - Proposed: Key the card by step and enter with `@starting-style { opacity: 0; transform: translateY(4px) }`, `transition: opacity 180ms ease-out, transform 180ms cubic-bezier(0.16,1,0.3,1)`. Fade the dim panels in once on tour start (200ms ease-out). Do NOT animate the panels' top/left/height between steps (layout props).
- **O03** (low) `src/components/ui/switch.tsx:64` — OPPORTUNITY (feedback): Switch thumb slides with Tailwind default easing; no press feedback.
  - Proposed: Thumb `ease-[cubic-bezier(0.16,1,0.3,1)] duration-150`; on track `:active` widen feel with thumb `scale(0.94)` — skip if it fights the 2px design language; keep current otherwise.
- **R01** (low) `src/components/ui/segmented-control.tsx:128` — REJECTED: sliding active-pill indicator on segmented controls / underline tabs. Tens of times a day, information-dense filters; colour change at 150ms is the right amount.
  - Proposed: None — keep transition-colors.
- **R02** (low) `src/app/styles/feed.css:352` — REJECTED: press-scale / hover-lift on feed cards and list rows. Large surfaces scaling reads as wobble, and the feed is scanned constantly; the existing bg/border hover is enough.
  - Proposed: None.
- **R03** (low) `src/components/feed/feed-layout.tsx:31` — REJECTED: staggered entrance for feed/explore items and infinite-scroll pages. Core navigation surface seen 100+ times; stagger delays reading.
  - Proposed: None.
- **R04** (low) `src/lib/view-transitions.tsx:1` — REJECTED (for this pass): migrating to React 19 `<ViewTransition>` / Next `experimental.viewTransition` for shared-element card->detail morphs. Experimental flag + redesign of navigation; out of scope for a polish pass. Revisit when stable.
  - Proposed: None now; fix M15/M16 on the current provider.
- **R05** (low) `src/components/visualization/endorsement-graph.tsx:803` — REJECTED: adding hover pulse/animated edges to the endorsement graph. Functional data the user is reading; decoration hinders.
  - Proposed: None.

### Robustness and mobile feel

- **R25** (medium) `src/app/styles/layout.css:2003` — The desktop profile H1 (.profile-sidebar__name) is nowrap with an ellipsis and has no title attribute, so a 64-character display name is cut off on the one page that exists to show it. On desktop, .project-detail__title (project-detail.css:234) also truncates the H1 to one line (it does have a title attribute) even though titles can be up to 80 graphemes.
  - Proposed: Let detail-page H1s wrap: `white-space: normal; overflow-wrap: anywhere;`, with an optional 2-3 line clamp. Keep ellipsis for list rows and bylines only.
- **R26** (low) `src/app/[actor]/page.tsx:455` — The mobile profile tab strip (.profile-tabs) scrolls sideways with a hidden scrollbar, no edge fade and no snap. When a deep link selects an off-screen tab (e.g. the header's 'Endorsed by' link to ?tab=endorsements), the active tab stays out of view.
  - Proposed: On tab change, call `activeTabEl.scrollIntoView({ inline: "nearest", block: "nearest" })`. Add `scroll-snap-type: x proximity` plus a mask-image edge fade so users can see there are more tabs.
- **R27** (low) `src/app/styles/layout.css:440` — Bottom-nav items and other icon+label controls have no `user-select: none` or `-webkit-touch-callout: none`. Long-pressing a bottom-nav tab selects its label or opens the iOS link-preview callout, which feels like a web page rather than an app.
  - Proposed: Add `user-select: none; -webkit-touch-callout: none;` to .bottom-nav__item, and the same to the Button primitive's base class. Leave content links alone.

### Copy and terminology

- **copy-14** (medium) `src/components/profile/list-modals.tsx:310` — Dialog "Bulk add by at-URI" with help text about NSIDs, at://, did:plc. Reachable from profile lists by normal users.
  - Proposed: Title "Add several at once"; help "Paste links to activities or profiles, one per line." Accept certified.app URLs; keep at-URI support silently.
- **copy-17** (low) `src/components/profile/endorsement-lists.tsx:1011` — Row error "Not a DID, handle, or profile URL" (also aria-labels "Bulk add people by handle or DID" lines 511/1161).
  - Proposed: "Not a handle or profile link."
- **copy-20** (medium) `src/components/ui/sign-in-modal.tsx:75` — Sign-in switch "Or sign in with ATProto/Bluesky" uses the ATProto abbreviation (FAQ and settings say "AT Protocol"); "Connecting..." on line 77 uses three dots.
  - Proposed: "Or sign in with Bluesky or another AT Protocol account"; "Connecting…".
- **copy-21** (low) `src/components/contributor-board/add-edit-contributor-dialog.tsx:182` — Field "Handle or DID" and error "Enter a valid handle or DID" (line 133).
  - Proposed: Label "Handle", help "e.g. alice.bsky.social"; error "Enter a handle like alice.bsky.social."
- **copy-22** (low) `src/components/groups/org-settings.tsx:873` — Add-member search placeholder "Search by handle or DID".
  - Proposed: "Search by name or handle".
- **copy-29** (low) `src/components/settings/settings-panel.tsx:104` — Section titled bare "DID" (and profile-sidebar "Copy DID"). Description is good but the title is an acronym.
  - Proposed: Title "Account ID (DID)"; copy button "Copy account ID".
- **copy-34** (low) `src/app/[actor]/page.tsx:598` — "Click Edit profile to add an About section" (also project-detail.tsx:1342 "Click “Add activity” above"). Mobile-first app; "Click" plus pointing at UI instead of offering the action.
  - Proposed: Put an "Edit profile" / "Add activity" button in the empty state; description "Add an About section so people know who you are."
- **copy-41** (low) `src/components/groups/org-settings.tsx:1222` — "Are you sure you want to remove this member from the group?" says nothing about consequences; title lacks the member name.
  - Proposed: Title "Remove @handle?"; message "They'll lose access to act as this group. You can add them again later."
- **copy-42** (low) `src/components/groups/org-settings.tsx:1256` — "Remove group" body says "This deletes the group from the service only" and refers to "promote the account": verb mix (remove/delete) and jargon (service, promote).
  - Proposed: Title "Turn @handle back into a regular account?"; body "The group features go away. The account and everything it published stay."
- **copy-43** (low) `src/components/settings/settings-panel.tsx:157` — "Promote this account to a group account" / groups/import "Sign in to promote an account": "promote" is internal jargon.
  - Proposed: "Turn this account into a group".
- **copy-44** (low) `src/components/project/project-detail.tsx:1429` — Delete titles inconsistent: "Delete this project" / "Delete this activity" vs "Delete update", "Delete list", "Revoke endorsement?" (some with ?, some without).
  - Proposed: Pattern "Delete <object>?" with a question mark everywhere; confirm label repeats the verb+object.
- **copy-45** (low) `src/lib/tour/tour-steps.ts:124` — "This is where you can see all the apps that are built with Certified on AT Protocol." Wordy and ambiguous (built with Certified?).
  - Proposed: "Other apps that work with your Certified account. Sign in to any of them with the same account."
- **copy-46** (low) `src/components/feed/activity-edit-route.tsx:516` — "We couldn't reach this record's home server, so we only have a partial copy." Good next step but "record's home server" is semi-jargon.
  - Proposed: "We couldn't load the full activity, so editing now could lose details. Try again in a minute."
