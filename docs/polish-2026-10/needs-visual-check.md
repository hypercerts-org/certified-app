# Needs a visual check

These changes pass type, lint, tests and the CLAUDE.md checks. They were not seen in a browser, mostly because they sit behind sign-in: local sign-in needs real Upstash credentials, and nothing was pushed to staging. Check each in light and dark, at desktop and below 800px, once the branch is on a preview or staging.

Already checked locally: `/terms` (one top bar on mobile), `/help` (top spacing; footer and Feedback button spacing on mobile), `/welcome` in dark mode, the 404 page, the dark top bar tint.

## App shell and primitives
- Settings top bar now reads "handle / Settings".
- Desktop "+" Create menu: now a Popover. Check position, look and arrow keys.
- Dialog headers: close button is now a 40/44px icon Button. Check spacing in feedback, confirm and delete dialogs.
- Toast and Banner dismiss buttons; toast position on mobile.
- Bottom sheet (mobile account switcher): exit animation on X, backdrop, Esc and drag; flick to dismiss.
- Acting-as bar on mobile: moves with the navbar; focus ring contrast.
- Error boundary pages (home, explore, endorsements, profile) now use EmptyState + Button.
- Settings section titles (`.sx-panel__title`) changed size to the canonical scale.
- Input / Textarea / Select focus ring: grey token ring instead of the old blue.

## Feed, record detail, explore
- Record detail section labels (Summary, Description, Updates, Funding, Locations, Contributors): one icon + label + count pattern. This also changes the section count style on create/edit pages, the project Updates heading and the fancy board.
- "See all" links with a chevron; Funding empty text 14px; no map frame when nothing is mappable; icon fallback for missing project and activity thumbnails (home rail too).
- Map expand button size and background.
- Feed filter panel: legends, Checkbox rows, 44px rows on mobile; "For you" disclosure; Load more button.
- Explore at 800-1099px: author under the title; sort / quality / confirmed-by triggers use the secondary style; error state with Try again.
- Funding amounts: grouped numbers in a fixed 9rem column.
- Endorsement graph: keyboard search (Combobox), loading text, reduced motion shows the settled layout.
- Endorsements: icon buttons (revoke, remove, refresh) are ghost style now; received rows wrap on phones.

## Profile, projects, groups, create
- Edit / Group settings / New activity, project, group buttons now render as links (`<Button href>`). Check size and the mobile icon-only state.
- Avatar upload: hover/focus overlay, touch badge.
- Profile edit footer buttons and the "Additional URLs" legend.
- Mobile profile with a very long name or handle.
- Contributor boards: tap and keyboard reveal.
- `/create`: Rights `<Select>` height next to the compact fields; clicking Publish on an empty form shows what's missing.
- Funding receipt modal: amount error placement; "12,50" is rejected with a hint.
- Unsaved-changes prompt on create activity / project / group and edit forms (uses the browser confirm, like inline profile edit).

## Public and onboarding
- Onboarding: focus ring on Replace avatar/banner, counter row layout, title sizes.
- Custom-domain dialog: 44px copy buttons make the DNS rows taller; header icon alignment.
- FAQ accordion look on /welcome and /help (questions are headings now).
- Workspace prototype heading sizes.

## Copy worth a glance
- OAuth callback failure: "Sign-in didn't finish" with a retry link.
- Bulk revoke on the Given tab: "Revoke selected" / "Revoke N endorsements?".
- New owner empty state on the profile Created tab ("Create an activity") and an Explore button on the empty home feed. These go slightly past "objective"; drop them if unwanted.
- Failed request messages are now plain language everywhere (`toUserErrorMessage` in `src/lib/utils/api.ts`).

## Taste pass (2026-10-22, commits 7977abdb..4bff3b09)

Check in light and dark, desktop and below 800px.

### Signed out / public (can be checked locally)
- Desktop "Sign in" button in dark mode; sign-in dialog without the empty header strip.
- `/settings` signed out: in-place sign-in prompt, "Settings" in the top bar.
- Bottom-nav labels at 375px (PWA only); mobile-sidebar theme toggle and legal row height.
- Landing: theme toggle skin in dark mode, hero h1 visible immediately, internal links in the same tab.
- Terms / Privacy contents list (1 and 2 columns) and anchor offset under the mobile navbar; /help title size.
- Profile: 160px desktop avatar, stat cards, Endorse as secondary, long names wrapping (3-line clamp), mobile tab edge fade with unfaded hairlines, auto-scroll on `?tab=endorsements`.
- `/apps` heading and open arrow; Not found page "Go to Explore".
- Endorsement graph control icons and chevron rotation.

### Behind sign-in
- Desktop icon nav active state; Explore filter and Settings nav subtle selected state.
- Popovers: enter animation and position (end-aligned and top-side menus, `align="center"`).
- Toast exit and the stack settling; drawer open/close timing.
- Mobile page slide: navbar and bottom nav stay still. Check on a phone that the navbar keeps its blur during the slide.
- Desktop tab switch (180ms, 12px); tour per-step card and initial dim fade, no keyboard hint on touch.
- Home feed: skeleton cards (hidden for the first 200ms), 2-line titles, image aligned with the title, handle-only byline, follows-error Retry.
- `/endorsements`: skeleton rows, both empty states, revoke dialog naming the person.
- Project detail: Edit / ghost Delete buttons, Add activity / Cancel / Edit anyway, title wrapping next to the actions.
- Record funding modal: role segmented control, amount error, iOS font size.
- Group settings audit log (handles, relative time); "Add several at once" dialog; group About empty state; Settings with the DID section last.
- Mobile endorsement / followers / groups toolbars: 44px tap areas, and tapping into the search field places the caret normally.
- Delete / revoke dialogs: "Delete <thing>?" titles.
