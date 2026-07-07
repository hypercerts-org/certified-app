# Magic Indexer → Hyperindex switch plan

## Context

Certified currently routes most indexed reads through the same-origin proxy in `src/app/api/indexer/route.ts`. That proxy is built around the Magic Indexer contract and defaults to:

```ts
https://magic-indexer-prod.up.railway.app/graphql
```

The goal is to remove the Magic Indexer dependency and run Certified against the hosted Hyperindex GraphQL API instead.

This is **not** a PDS-to-Hyperindex migration. PDS and Certified Group Service remain the source of truth for writes, deletes, conflict/swap checks, edit prefill, and blob reads. The migration is about replacing the Magic-compatible read proxy implementation operation by operation.

Current operation surface in `/api/indexer`:

- `Activities`, `ActivitiesByUris`, `AuthoredActivities`, `ContributedActivities`, `UserActivityCount`
- `Projects`, `UserProjects`, `ProjectsContainingCert`
- `Followers`
- `ReceivedEndorsements`, `EvaluatorEndorsements`, `AllEndorsements`, `EndorsementDefs`, `EndorsementClosure`
- `NetworkActors`, `NetworkActorsByKind`, `OrganizationDids`, `OrganizationDidsByLabel`, `NetworkActorsByDids`, `OrganizationDidsForSet`, `DidsByKindInSet`, `ActorWorkspaceCounts`
- `ProfileCount`, `OrganizationCount`, `ActivityCount`, `ProjectCount`, `AwardCount`
- `FundingReceipts`, `FundingReceiptsForActivity`
- `FollowerEvents`, `HydrateFeedPage`

Live Hyperindex already exposes the important typed roots for most of these groups:

- `orgHypercertsClaimActivity`
- `orgHypercertsCollection`
- `appCertifiedGraphFollow`
- `appCertifiedActorProfile`
- `appCertifiedActorOrganization`
- `appCertifiedBadgeAward`
- `appCertifiedBadgeDefinition`
- `appCertifiedBadgeResponse`
- `orgHypercertsFundingReceipt`
- `endorsementClosure`
- `recordTimeline`

The main known gap is the home feed: Hyperindex does not currently expose Magic’s custom `followerEvents` and `HydrateFeedPage` operations.

## Approach

Keep the app-facing `/api/indexer` operation contract stable while replacing each operation group behind the proxy with Hyperindex queries.

Recommended principles:

1. **Keep client hooks stable first.** Existing callers should continue posting `{ operationName, variables }` to `/api/indexer` while the server implementation changes.
2. **Introduce dual-backend routing during migration.** Let some operations use Hyperindex while unported/high-risk operations continue using Magic until their stage is complete.
3. **Port from least invasive to most invasive.** Start with count-only operations, then typed list queries, then joined/semantic surfaces, then home feed.
4. **Make every stage a separate PR.** Do not roll through stages automatically. Each stage should be implemented, reviewed, manually tested by the user, merged, and observed before the next stage begins.
5. **Use schema introspection as a stage gate.** `docs/hyperindex-feature-request.md` may be stale; re-check the live Hyperindex schema before each stage.
6. **Do not move writes.** PDS/CGS write paths remain unchanged.
7. **Remove Magic only after observability confirms no operation still depends on it.**

## Files to modify

Critical files:

- `src/app/api/indexer/route.ts`
  - endpoint selection;
  - operation allowlist;
  - operation-specific variable validation;
  - Magic vs Hyperindex query strings;
  - rate-limit/bypass headers.
- `src/lib/atproto/indexer.ts`
  - client helpers and result mappers for activities, projects, actors, endorsements, funding, counts.
- `src/lib/atproto/follower-events.ts`
  - home feed client; likely final/highest-effort stage.
- `src/hooks/use-home-feed.ts`
  - only if replacing Magic `followerEvents` with `recordTimeline` or a different feed model.
- `src/components/home/home-feed.tsx`
  - only if feed event/hydration shape changes.
- `.env.local.example`
  - replace Magic-specific indexer docs with Hyperindex-first config;
  - add temporary migration vars if needed.
- `src/app/api/indexer/__tests__/route.test.ts`
  - proxy trust boundary and variable validation tests.
- Relevant unit tests under:
  - `src/lib/atproto/__tests__/`
  - `src/hooks/__tests__/`
  - component tests for profile/explore/endorsement/funding surfaces as needed.

Documentation:

- Keep this migration spec current as stage boundaries or rollout rules change.
- `docs/hyperindex-feature-request.md` is pre-existing context; update it only when a stage verifies that a listed gap is stale or resolved.

## Reuse

Existing code to reuse rather than replace wholesale:

- `/api/indexer` trust boundary in `src/app/api/indexer/route.ts`:
  - same-origin proxy;
  - operation allowlist;
  - request body size cap;
  - CSRF check;
  - IP rate limiting;
  - per-operation variable validation.
- Existing domain mappers in `src/lib/atproto/indexer.ts`:
  - `nodeToActivityRecord`;
  - collection/project mappers;
  - funding and endorsement mapper patterns.
- Existing hooks/components:
  - `useUserIndexerActivities` and `ProfileCerts` for profile activities;
  - `useExplore` for Explore behavior;
  - endorsement caches/optimistic overlays;
  - funding lag-handling behavior.
- Existing tests around `/api/indexer` validation and user-facing hooks.

## Stages

### Stage 0 — Foundation and re-baseline

- [ ] Re-check the live Hyperindex schema for the operation group being prepared and record relevant findings in the PR notes.
- [ ] Add explicit endpoint config:
  - `HYPERINDEX_URL=https://api.indexer.hypercerts.dev/graphql`
  - temporary `MAGIC_INDEXER_URL=https://magic-indexer-prod.up.railway.app/graphql`
  - keep `INDEXER_URL` behavior backwards-compatible during migration.
- [ ] Refactor `/api/indexer` internally so each operation can choose a backend: Magic or Hyperindex.
- [ ] Add temporary logging/metrics for backend chosen per operation.
- [ ] Do not flip production behavior yet.

Acceptance:

- [ ] Existing app behavior unchanged.
- [ ] Tests still pass against the Magic-backed default.
- [ ] Existing Magic-backed behavior remains unchanged.

### Stage 1 — Counts first

Port count-only operations to Hyperindex:

- [ ] `ProfileCount`
- [ ] `OrganizationCount`
- [ ] `ActivityCount`
- [ ] `ProjectCount`
- [ ] `AwardCount`
- [ ] `UserActivityCount`
- [ ] `ActorWorkspaceCounts` if its inputs are simple enough; otherwise defer to actor/org stage.

Why first:

- Smallest payloads.
- Low UI risk.
- Easy Magic-vs-Hyperindex comparison.
- Good deployment/config canary.

Acceptance:

- [ ] Landing/welcome stats still render.
- [ ] Profile activity counts still render.
- [ ] Count differences are either zero or documented as expected semantic differences.

### Stage 2 — Activities

Port activity operations to Hyperindex:

- [ ] `Activities`
- [ ] `ActivitiesByUris`
- [ ] `AuthoredActivities`
- [ ] `ContributedActivities`

Translate Magic-specific arguments into Hyperindex filters:

- [ ] `authors` → `where.did.in`
- [ ] authored profile bucket → `where.did.eq`
- [ ] contributed profile bucket → `where.contributorDid.eq`
- [ ] URI batches → `where.uri.in`
- [ ] cert quality labels → `where.externalLabels.has/none`
- [ ] org/author labels → `where.authorLabels.has/none`
- [ ] search → Hyperindex-supported search path or typed `where` fallback, verified against live schema.

Acceptance:

- [ ] `/explore` activity results still load.
- [ ] Profile Activities tab still loads Created and Contributed buckets.
- [ ] Activity detail indexer fallback by URI still works.
- [ ] Quality filters and author/org filters preserve current behavior.

### Stage 3 — Projects and collections

Port project/collection operations:

- [ ] `Projects`
- [ ] `UserProjects`
- [ ] `ProjectsContainingCert`

Use Hyperindex `orgHypercertsCollection` with:

- [ ] `where.type` for project collections.
- [ ] `where.did` for profile/user projects.
- [ ] `where.items.any` / URI containment for projects containing an activity.
- [ ] label and author-label filters where current UI applies them.

Acceptance:

- [ ] Explore Projects still works.
- [ ] Profile Projects tab still works.
- [ ] Activity detail linked projects still works.
- [ ] Project cards preserve title, banner, description, item/activity count behavior.

### Stage 4 — Follow graph reads

Port follow/follower reads:

- [ ] `Followers`

Use Hyperindex `appCertifiedGraphFollow`.

Out of scope for this stage:

- home feed event generation from follows;
- follow/unfollow writes.

Acceptance:

- [ ] Profile Followers tab still loads and paginates.
- [ ] Follower counts match expected semantics.
- [ ] Follow/unfollow writes continue using existing PDS/CGS paths.

### Stage 5 — Actor/profile/organization lookup

Port actor and organization operations:

- [ ] `NetworkActors`
- [ ] `NetworkActorsByKind`
- [ ] `OrganizationDids`
- [ ] `OrganizationDidsByLabel`
- [ ] `NetworkActorsByDids`
- [ ] `OrganizationDidsForSet`
- [ ] `DidsByKindInSet`
- [ ] `ActorWorkspaceCounts` if not completed in Stage 1.

Important checks:

- [ ] Confirm how Hyperindex represents organization marker records vs actor profiles.
- [ ] Confirm search semantics for profile display name/description/handle needs.
- [ ] Confirm author-label/org-label filtering parity.
- [ ] Avoid reintroducing N+1 profile resolution where current Magic joins avoided it.

Acceptance:

- [ ] Global search still returns accounts and records.
- [ ] Workspace actor picker still works.
- [ ] Explore account/org filters still work.
- [ ] Profile pages still resolve display metadata correctly, with existing resolve-did fallback intact.

### Stage 6 — Endorsements

Port endorsement operations:

- [ ] `ReceivedEndorsements`
- [ ] `EvaluatorEndorsements`
- [ ] `AllEndorsements`
- [ ] `EndorsementDefs`
- [ ] `EndorsementClosure`

Known caveat:

- Magic currently returns inline `response { state weight createdAt }` on award nodes.
- Hyperindex exposes `appCertifiedBadgeResponse`, but award nodes do not appear to include the same inline response join.
- Plan for this stage should either:
  - issue a second Hyperindex query for responses and merge client/proxy-side; or
  - add/confirm a Hyperindex response join before switching.

Acceptance:

- [ ] Profile Received endorsements tab preserves accepted/rejected/default behavior.
- [ ] Given endorsements still work.
- [ ] `/endorsements` management page still works.
- [ ] `/endorsement-graph` still renders with expected edge count and filtering.
- [ ] Trusted evaluator expansion still works.

### Stage 7 — Funding

Port funding operations:

- [ ] `FundingReceipts`
- [ ] `FundingReceiptsForActivity`

Use Hyperindex `orgHypercertsFundingReceipt`, but verify funding semantics before flipping:

- [ ] sender/recipient/third-party role fields;
- [ ] activity/record target filtering;
- [ ] payment fields;
- [ ] confirmation/provenance fields;
- [ ] existing post-write indexer lag handling.

Acceptance:

- [ ] Explore Funding loads.
- [ ] Activity Funding tab loads.
- [ ] Funding detail modal still shows parties, payment metadata, and provenance correctly.
- [ ] Recording funding still writes through existing write path and reconciles after Hyperindex catches up.

### Stage 8 — Home feed / Magic-only resolver replacement

This is the hardest and least Hyperindex-ready stage.

Current Magic-only operations:

- [ ] `FollowerEvents`
- [ ] `HydrateFeedPage`

Hyperindex currently exposes `recordTimeline`, but not equivalent `followerEvents` / `HydrateFeedPage` resolvers.

Choose one path before implementation:

- [ ] **Option A — App-side rebuild with `recordTimeline`:** query timeline records for followed DIDs, classify event kinds in app/proxy code, hydrate typed records separately, and rebuild pagination/folding behavior.
- [ ] **Option B — Add Hyperindex resolver(s):** implement `followerEvents` and possibly hydration support in Hyperindex, keeping Certified’s current feed contract closer to unchanged.
- [ ] **Option C — Temporary hybrid:** run everything except home feed on Hyperindex, keep Magic only for home feed until Option A or B is ready.

Recommendation:

- Use Option C during the staged migration if the priority is to move most of the app off Magic quickly.
- Decide between Option A and Option B after measuring how much of Magic’s feed behavior must be preserved exactly.

Acceptance:

- [ ] Home feed still paginates stably.
- [ ] Feed still supports followed authors and trusted evaluator expansion.
- [ ] Feed still renders activity, project, endorsement, evaluation, measurement, hyperboard, and update events.
- [ ] Project-with-activity folding behavior is preserved or intentionally changed.
- [ ] No Magic requests remain after this stage is complete.

### Stage 9 — Remove Magic

Only after all operation groups have moved:

- [ ] Remove Magic fallback URL from `src/app/api/indexer/route.ts`.
- [ ] Remove `MAGIC_INDEXER_URL` temporary config.
- [ ] Update `.env.local.example` to make Hyperindex the only documented indexer endpoint.
- [ ] Remove Magic-specific comments and compatibility branches.
- [ ] Update docs to reflect stock Hyperindex support.
- [ ] Confirm production/staging observability shows zero Magic traffic.

Acceptance:

- [ ] App runs with only Hyperindex configured.
- [ ] No code path references `magic-indexer-prod` or `magic-indexer-dev`.
- [ ] Smoke tests pass across Explore, profiles, projects, endorsements, funding, and home feed.

## Verification

Automated checks:

- [ ] Unit tests for `/api/indexer` trust boundary and variable validation.
- [ ] Mapper tests for activity, project, actor, endorsement, and funding nodes.
- [ ] Hook tests for profile Activities, Projects, Followers, Endorsements, and Funding where existing coverage exists.
- [ ] Stage-specific schema checks for the operation group being migrated.

Manual/browser checks on staging:

- [ ] `/welcome` stats.
- [ ] `/explore` All/Activities/Projects/Accounts/Funding.
- [ ] Profile page tabs:
  - Activities;
  - Projects;
  - Followers;
  - Endorsements;
  - Lists if dependent on migrated operations.
- [ ] Activity detail:
  - Overview;
  - Funding;
  - linked projects;
  - updates if affected by feed/detail changes.
- [ ] Project detail.
- [ ] `/endorsements`.
- [ ] `/endorsement-graph`.
- [ ] Signed-in home feed after Stage 8.

Stage-specific comparison checks:

- [ ] For each migration stage, document the small fixed sample of DIDs/URIs used to compare old vs new behavior.
- [ ] Record known semantic differences before flipping production.
- [ ] Monitor request error rate and empty-result rate after each stage.

## Rollout cadence

This migration should proceed **one manual PR at a time**. The assistant should not automatically continue from one stage into the next. After each stage is implemented, it should be raised as its own PR for review and user-led manual testing before merge.

Per-stage cadence:

- [ ] Implement exactly one operation group/stage in a dedicated branch/PR.
- [ ] Run local automated checks and stage-specific manual checks.
- [ ] Open a PR for that stage with:
  - a concise summary of migrated operations;
  - manual test instructions;
  - known parity differences, if any;
  - rollback notes for that stage.
- [ ] Wait for user review and manual testing. Do not start the next stage while the PR is still under review.
- [ ] Merge only after the user confirms the stage works.
- [ ] Deploy the merged stage through the normal deployment flow.
- [ ] Monitor production error rate, empty-result rate, and any stage-specific parity metrics.
- [ ] Keep per-operation backend routing in place until the final removal stage so a stage can be rolled back without reverting unrelated migrated operations.
- [ ] Start the next stage only after the previous stage is merged, deployed, and stable in production.
