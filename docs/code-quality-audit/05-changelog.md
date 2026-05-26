# Changelog — overnight code-quality pass 2026-05-25

Branch: `feat/positioning-redesign`
Baseline SHA: `ff5f24ad29a381b7f0fde8d4bae6028408ef9fd4`
Commits made on top of baseline: 14 (1 docs + 10 Tier 1 + 3 Tier 2).

Tracks listed in the order they landed.

| # | SHA | Type | Track | Summary |
|---|-----|------|-------|---------|
| 1 | `1111160` | docs | n/a | Audit scaffold: baseline, inventory, findings, plan v2 |
| 2 | `d903a05` | chore | T01 | Drop dead exports (useActivities, awardAuthorDid, extractYouTubeId) |
| 3 | `e715967` | refactor | T09 | Rename local getBlueskyProfile in resolve-did route to avoid name clash |
| 4 | `cbdbc24` | refactor | T02 | feed/activity-detail: replace local formatDate with shared formatShortDate |
| 5 | `e78f365` | refactor | T08 | utils/api: dedupe redactSecrets onto log-safe; preserve Bearer/DPoP coverage |
| 6 | `9bf9e89` | chore | T05 | groups/handle-search: drop unused local isDid |
| 7 | `04f1763` | refactor | T04 | Collapse inline initials computation onto getInitials helper |
| 8 | `8fb3dc6` | refactor | T03 | Add formatMonthYear helper; adopt in profile-sidebar + inline-edit |
| 9 | `c0a5385` | refactor | T06 | Extract useMounted hook from three layout chrome components |
| 10 | `a4c1647` | refactor | T07 | Relocate use-layout-breakpoints to canonical src/hooks/ |
| 11 | `aa436d2` | refactor | T10 | api/groups: extract shared extractRecordRef helper for 4 route handlers |
| 12 | `cfd362a` | refactor | T12 | atproto/profile: centralize UploadedBlob->BlobRef cast via asBlobRef |
| 13 | `15a2879` | refactor | T13 | Extract xrpcGetRecordPath helper for BFF-proxied getRecord URLs |
| 14 | `0ca8db6` | test | T14 | log-safe: cover bare Bearer/DPoP fragments added in T08 |

## Aggregate impact

- 4 dead/unused exports removed; 1 demoted from export to internal.
- 1 file deleted (`src/hooks/use-activities.ts`); 1 file created
  (`src/hooks/use-mounted.ts`); 1 file moved (`src/lib/hooks/...` →
  `src/hooks/...`).
- 4 new shared helpers introduced — `formatMonthYear`,
  `extractRecordRef`, `asBlobRef`, `xrpcGetRecordPath`.
- 1 new shared hook introduced — `useMounted`.
- 11 `as unknown as ...` casts eliminated at consumer sites (the
  4 group routes' record-ref casts, the 7 BlobRef casts).
- 3 inline `getInitials`-equivalent computations consolidated.
- 2 inline `formatMonthYear`-equivalent computations consolidated.
- 1 inline `formatShortDate`-equivalent function consolidated.

## Gate progression

| Gate | Baseline (ff5f24a) | After all tracks |
|------|-------------------:|------------------:|
| `tsc --noEmit` errors | 0 | 0 |
| `eslint` errors | 0 | 0 |
| `eslint` warnings | 56 | 55 |
| `next build` | pass | pass |
| `vitest` tests | 154 passing | 157 passing |

No regression on any gate at any point. The lint count fell by 1 as a
T06 side effect; the test count rose by 3 from the T14 coverage
addition.

## Reverts

None. All 14 commits remain in history.

## What's NOT done

See `06-deferred.md` for the full list. Headline items intentionally
skipped:

- Splitting the 700–1200 LOC profile/activity/project components.
- Cross-cutting `pickAllowedFields<T>` generic tightening.
- Lexicon-coupled refactors of any kind.
- `next.config.ts`, `package-lock.json`, `.env*` — left untouched per
  the brief's hard rules.
