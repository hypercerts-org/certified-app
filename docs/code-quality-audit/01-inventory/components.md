# Inventory — components

Pulled from `find src/components -type f`. 117 files, ~28.7k LOC. Grouped by
folder; "primitive" = lives in `src/components/ui`, "feature" = everything
else.

## src/components/ui (primitives — canonical per DESIGN.md)

- `app-dialog.tsx` — Generic modal wrapper. Has a test (`__tests__/app-dialog.test.tsx`). Recently added; co-exists with several ad-hoc modals.
- `avatar.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx` — the documented primitives.
- `confirm-dialog.tsx` — Used by org-settings/profile flows; built on top of `app-dialog`.
- `feedback-modal.tsx` — Floating feedback CTA + dialog. Globally mounted from root layout.
- `sign-in-modal.tsx` — Sign-in dialog launched from `AuthProvider`.
- `provider-redirect-overlay.tsx` — OAuth handoff overlay.
- `error-message.tsx`, `empty-state.tsx`, `loading-spinner.tsx` — micro-primitives.
- `brandmark.tsx`, `feed-label-pill.tsx`, `smart-link.tsx`, `theme-toggle.tsx`, `edit-banner.tsx` — single-purpose UI bits.

## src/components/layout (chrome)

- `navbar.tsx` (424 LOC), `desktop-top-bar.tsx` (581), `desktop-left-rail.tsx` (385), `desktop-right-rail.tsx`, `mobile-sidebar.tsx`, `bottom-nav.tsx`, `site-drawer.tsx`, `site-footer.tsx`, `app-shell.tsx`, `auth-guard.tsx`, `page-title.tsx`, `account-switcher-list.tsx`.
- The "positioning redesign" introduced the desktop-rail family. Recent — refactor carefully.

## src/components/landing (welcome surface)

- `landing-page.tsx`, `home-client.tsx`, `hero-signin-button.tsx`, `orbiting-logos.tsx`.
- `sections/`: `built-for-trust.tsx`, `faq-accordion.tsx`, `faq-content.tsx`, `how-it-works.tsx`, `network-stats.tsx`, `partner-apps.tsx`, `ready-cta-button.tsx`, `ready-cta-content.tsx`, `what-you-get.tsx`.

## src/components/profile (the giant)

20 files, ~6.5k LOC. Largest in the repo:
- `profile-endorsements.tsx` (1206), `profile-overview.tsx` (1012), `profile-sidebar.tsx` (924), `endorsement-lists.tsx` (851), `profile-followers.tsx` (740), `profile-edit-form.tsx` (620), `endorse-people-modal.tsx` (518), `profile-groups.tsx` (458), `profile-header.tsx`, `profile-certs.tsx`, `profile-projects.tsx`, `profile-endorsements.tsx`, `endorse-reason-modal.tsx`, `avatar-upload.tsx`, `banner-upload.tsx`, etc.

## src/components/explore + explore-page

Two parallel folders — historical split. `explore/` contains views and
`cert-explore.tsx`; `explore-page/` contains list-row shapes and `explore.tsx`
(857 LOC). Strong candidate for the "duplicate folders" finding.

## src/components/feed

`activity-card.tsx`, `activity-detail.tsx` (1130), `activity-author.tsx`,
`activity-contributor.tsx`, `activity-feed.tsx`, `activity-card-skeleton.tsx`,
`cert-headline-byline.tsx`, `cert-locations-map.tsx`, `cert-projects.tsx`,
`feed-layout.tsx`, `image-edit-overlay.tsx`, `location-card.tsx`,
`user-feed.tsx`.

## src/components/groups

`add-org-modal.tsx`, `handle-search.tsx`, `membership-sync-modal.tsx`,
`org-settings.tsx` (679).

## src/components/{badges,context,dashboard,endorsements,leaflet,map,notifications,onboarding,project,right-rail,search,settings,workspace,account}

- `badges/` — response menus.
- `context/` — context updates list.
- `dashboard/` — `custom-domain-modal.tsx`, `username-card.tsx`.
- `endorsements/` — endorsement row + new-endorsement panel.
- `leaflet/` — tiptap editor and dialogs.
- `map/` — leaflet map (dynamic + skeleton).
- `notifications/` — row + skeleton.
- `onboarding/` — modal + banner + step components, plus a misplaced hook (`use-onboarding-commit.ts` lives under components/, not hooks/).
- `project/` — project-detail (1192).
- `right-rail/` — news section + rich text.
- `search/` — global, cert, and people search (cert-search 471, global-search 556, people-search 381).
- `settings/` — settings panel + sync-social-graph (702).
- `workspace/` — 4 layout variants + pane + types.
- `account/` — email + password sections.

## Notes & first impressions

- `src/components/explore` vs `src/components/explore-page` — strong duplication smell.
- `src/components/onboarding/use-onboarding-commit.ts` — a hook misplaced under `components/`.
- `feedback-modal` lives in `ui/` but is feature-shaped (uses a context).
- `profile-inline-edit-types.ts` and `explore-types.ts` — bare type files; check for thin abstraction.
- Several files >700 LOC (`profile-endorsements`, `profile-overview`, etc.) — too large to fit a single 8h refactor responsibly. Don't try to split them.
