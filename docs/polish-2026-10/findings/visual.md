# Visual pass (staging.certified.app, signed in as QA Tester; 1440 / 900 / 500 px; light + dark)

Note: Chrome's minimum window width is 500px, so "mobile" was checked at 500, not 390.

## Objective
- V1 /settings (and /settings/edit-profile, group settings): breadcrumb replaces the page title, top bar shows only the handle, never "Settings". navbar.tsx titled layout drops `pageTitle` when `breadcrumb` is set. Fix: pass `right: { text: "Settings", href: "/settings" }` (or render `breadcrumb.left / pageTitle`).
- V2 Floating Feedback button overlaps content on mobile browser widths (covers feed titles, last list rows). Bottom nav is PWA-only, so nothing reserves space for it. Fix: reserve bottom padding equal to button height + gap at <800px, or collapse to an icon button.
- V3 Left-rail "My activities" items render empty grey squares when an activity has no image (home, all widths). Projects in the same rail use an icon fallback. Fix: same icon fallback as projects.
- V4 Record detail "Project" row shows an empty grey thumbnail square when the project has no image.
- V5 Section-label inconsistency on record detail: SUMMARY (no icon), UPDATES (count in pill), FUNDING (no icon, no count), LOCATIONS (icon + bare count), CONTRIBUTORS (icon + bare count). Same component family should use one pattern.
- V6 "See all" link style differs: "See all →" (text arrow, record detail) vs "See all >" (chevron icon, profile, explore "Show all >"). Also label differs (See all / Show all).
- V7 Record detail Funding empty text is 16px while all sibling empty states are 14px.
- V8 Date formats mixed: ISO "2026-10-11" (feed, profile, record), relative "3d ago" (explore), and both in the same explore list ("5d ago" next to "2026-10-14").
- V9 Explore tablet (800-1099): title column starves because the author column keeps its desktop width; titles truncate to ~25 chars ("Community Led Biodiversit..."). Stack author under title below 1100.
- V10 Explore shows two search inputs on desktop/tablet (global top-bar search + "Search all of Explore"). Flagged in June plan PR7; still present.
- V11 Create page: the Rights `<select>` renders with native browser chrome, unlike every other field (inputs use token borders/radius).
- V12 Endorsement graph shows only a centred logo on grey for ~5-10s while loading; no text, no progress, no skeleton.
- V13 Locations block shows a large "No mappable coordinates" placeholder box (~120px) even when there is a named place. Hide the map frame when there are no coordinates; keep the place chip.

## Taste (proposals)
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

## DESIGN.md drift seen in the UI
- D1 §1 says "Mobile-native navigation: bottom tab bar"; the bar is PWA-only (bottom-nav-visibility.ts). Browser mobile uses hamburger + floating Feedback.
- D2 §1 says "no desktop sidebar"; desktop has a left rail (home, explore, settings) and a right rail (news).
