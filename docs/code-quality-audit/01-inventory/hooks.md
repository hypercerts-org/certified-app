# Inventory — hooks

46 files under `src/hooks/`. Plus `src/lib/hooks/use-layout-breakpoints.ts`
(misplaced) and `src/components/onboarding/use-onboarding-commit.ts` (also
misplaced).

## Auth / session / profile

- `use-session.ts` — module-level promise cache (handle+email).
- `use-profile.ts`, `use-user-profile.ts`, `use-profile-pds.ts`, `use-author-info.ts` — overlapping profile-resolution. Confirm responsibilities — possible reuse target.
- `use-profile-inline-edit.ts`, `use-profile-responses.ts`, `use-own-response-states.ts`.

## Activities / projects / context

- `use-activities.ts`, `use-activity.ts`, `use-user-activities.ts`, `use-user-indexer-activities.ts`.
- `use-project.ts`, `use-project-items.ts`, `use-user-projects.ts`, `use-cert-projects.ts`.
- `use-cert-context.ts`, `use-context-updates.ts`, `use-contributor-information-record.ts`, `use-contributor-info.ts`.

## Endorsements / followers / following / rights

- `use-endorsements.ts`, `use-endorsement-lists.ts`, `use-received-endorsements.ts`, `use-trusted-endorsed-dids.ts`.
- `use-followers.ts`, `use-following.ts`, `use-followed-dids.ts`, `use-bluesky-follows.ts`.
- `use-rights.ts`, `use-network-counts.ts`, `use-pending-awards-count.ts`.

## Groups

- `use-private-memberships.ts`, `use-user-groups.ts`, `use-org-marker.ts`, `use-org-profile.ts`, `use-social-graph-sync.ts`.
- (`src/lib/groups/use-org-limit.ts` — separate location, alongside its constants.)

## UI / layout helpers

- `use-focus-trap.ts`, `use-body-scroll-lock.ts`, `use-bottom-sheet-drag.ts`, `use-scroll-hide-navbar.ts`.
- `src/lib/hooks/use-layout-breakpoints.ts` — only file under lib/hooks; mislocated.

## Misc

- `use-bsky-posts.ts`, `use-explore.ts`, `use-global-feed.ts`, `use-notifications-feed.ts`, `use-location.ts`, `use-workspace.ts`.
- `use-onboarding-commit.ts` lives in `src/components/onboarding/` — should be under hooks/.

## Patterns to verify in findings

- Module-level caches (`use-session.ts`, `use-author-info.ts`) — design choice
  per AGENTS.md, do not remove.
- AbortController + isMounted are the canonical pattern per AGENTS.md §25.
  Check hooks deviating from it.
- Overlap between profile-, user-, and pds- profile hooks.
- Overlap between follow*/endorse* hooks: counts, ids, full payloads should
  share infrastructure.
