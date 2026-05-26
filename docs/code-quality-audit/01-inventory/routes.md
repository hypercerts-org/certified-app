# Inventory — routes & API

## Pages

Public:
- `/` (`page.tsx`), `/welcome`, `/about`, `/terms`, `/privacy`, `/dsa`, `/imprint`, `/manifest.ts`, `/robots.ts`, `/sitemap.ts`.
- `/error.tsx`, `/global-error.tsx`, `/not-found.tsx`.
- `/profile/[handle]` (server page), `/profile/page.tsx`.
- `/explore/page.tsx`, `/search/{page,layout}.tsx`, `/feed/page.tsx`, `/apps/{page,layout}.tsx`.

Gated:
- `/home/page.tsx`, `/notifications/{page,layout}.tsx`, `/settings/page.tsx`, `/settings/edit-profile/page.tsx`, `/settings/layout.tsx`.
- `/groups/{page,layout}.tsx`, `/groups/create/page.tsx`, `/groups/[groupDid]/{page,edit-profile/page,settings/page}.tsx`.
- `/create/{page,layout}.tsx`, `/endorsements/{page,layout}.tsx`.
- `/project/new/page.tsx`, `/project/[did]/[rkey]/page.tsx`, `/project/[did]/[rkey]/explore/page.tsx`.
- `/activity/[did]/[rkey]/page.tsx`, `/activity/[did]/[rkey]/explore/page.tsx`.
- `/workspace/page.tsx`.
- `/oauth/callback/page.tsx`.

## API routes (route.ts handlers)

Auth:
- `api/auth/callback-handler/route.ts`, `api/auth/login/route.ts`, `api/auth/logout/route.ts`, `api/auth/session/route.ts`.

XRPC proxy + atproto helpers:
- `api/xrpc/[...method]/route.ts`.
- `api/resolve-did/route.ts`, `api/resolve-handle/route.ts`, `api/search-actors/route.ts`.
- `api/indexer/route.ts` (+ `__tests__/route.test.ts`).
- `api/notifications/route.ts`.

Groups:
- `api/groups/register/route.ts`, `api/groups/memberships/route.ts`.
- `api/groups/[groupDid]/{activity,audit,bsky-profile,follow,handle,location,members,metadata,profile,project,role,upload-blob}/route.ts`.

Feedback / utility:
- `api/feedback/route.ts`, `api/geocode/route.ts`, `api/onboarding/clone-blob/route.ts`.

Well-known:
- `api/../.well-known/{jwks.json,oauth-client-metadata}/route.ts`.

## Layouts

`layout.tsx` at: root, welcome, settings, groups, notifications, apps, create, endorsements, search.

## Patterns to verify in findings

- Many group routes share scaffolding (CSRF → auth → agent → body parse → XRPC
  call → error sanitize). Could plausibly factor a shared helper. **High risk
  per project rules — API/contract surface stable, don't change shapes.**
  Limit to local helpers if at all.
- `resolve-did`, `resolve-handle`, `search-actors` are all read-only helpers
  with similar shape. Same caution.
- `[did]/[rkey]` shapes appear in both `activity/` and `project/` route trees.
  Duplication of URL parsing/error shape — find shared helper.
