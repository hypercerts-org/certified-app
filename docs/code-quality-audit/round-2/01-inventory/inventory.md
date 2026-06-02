# Round 2 — Re-inventory

Round 1 was the comprehensive inventory; round 2 only catalogs what
has changed since (or is freshly in scope).

## Top-level scale

| Tree | Files | LOC | Δ vs round 1 |
|------|-------|-----|--------------|
| `src/components/` | 130+ | ~32K | larger — many redesign-era additions |
| `src/hooks/` | 53 | n/a | +many (was ~28 in round 1) |
| `src/lib/atproto/` | 21 | 8360 | larger — collection.ts, trusted-evaluators.ts, follower-events.ts grew |
| `src/lib/utils/` | n/a | 1394 | +parse-subject-input.ts, +log-safe.ts |
| `src/lib/auth/` | n/a | 1271 | rate-limit added |
| `src/lib/groups/` | n/a | 1140 | stable |
| `src/lib/leaflet/` | n/a | 910 | new since round 1 |
| `src/lib/onboarding/` | n/a | 264 | stable |
| `src/app/` routes | 30 page.tsx | n/a | +explore subroutes, +settings/edit-profile, +project pages |
| Tests | 11 files | 215 cases | +many (was 154 → 157 after round 1) |

## High-LOC component subtrees

(Components ≥1K LOC subtree, descending)

- `src/components/profile/` — 9503 LOC across 16 files
  (profile-lists 1450, profile-endorsements ~1200, profile-sidebar 924,
  profile-overview 800+, endorsement-lists ~1300)
- `src/components/feed/` — 2583 LOC across 13 files
- `src/components/layout/` — 2270 LOC across 13 files
- `src/components/ui/` — 2031 LOC across 22 files
- `src/components/explore-page/` — 1977 LOC across 9 files (the
  recently-extracted ExploreListRow shell lives here)
- `src/components/leaflet/` — 1508 LOC across 7 files
- `src/components/search/` — 1410 LOC across 3 files
- `src/components/home/` — 1252 LOC across 2 files (home-feed.tsx
  is the bulk; the feed-event renderer + filter popovers are inlined)
- `src/components/groups/` — 1210 LOC across 4 files
- `src/components/project/` — 1205 LOC in a single file (project-
  detail.tsx)

## New since round 1 (notable)

- Hooks: `use-evaluator-endorsements`, `use-typed-lists`,
  `use-url-param`, `use-click-outside-close`, `use-remove-action`,
  `use-home-feed` (significantly extended), `use-explore` (significantly
  extended).
- Lib: `parse-subject-input`, `featured`, `trusted-evaluators`,
  `endorsement-lists-cache`, expanded `collection`/`badges`,
  `rate-limit` (HTTP layer added).
- Components: `ExploreListRow`, `AppDialogHeader`,
  `EvaluatorFilter`, `PasteUrisModal` + `PasteSubjectsModal`,
  `UpdatePreview`, etc.
- Routes: `/api/indexer` (proxy), `/api/resolve-handle`,
  `/explore/[handle]/[rkey]` style nested routes.
- Tests: parse-subject-input.test.ts, app-dialog.test.tsx,
  trusted-evaluators.test.ts, route.test.ts (indexer), expanded
  follower-events.test.ts + typed-lists.test.ts.

## Test coverage at a glance

- 11 test files, 215 passing cases.
- 53 hooks, **0 hook test files** — the biggest coverage hole.
- 21 atproto-lib files, 4 with adjacent tests (collection,
  follower-events, repo-write, typed-lists). 17 untested.
- 30 app routes, 1 route test (indexer proxy).

## Config + top-level files

- `package.json` — runtime deps; per the hard rules we won't change
  this in this audit.
- `next.config.ts` — read-only.
- `tsconfig.json` — read-only.
- `vitest.config.ts` — read-only.
- `eslint.config.mjs` — read-only (the round-1 baseline owns the
  rule set).
- `.env.example` — read-only.
