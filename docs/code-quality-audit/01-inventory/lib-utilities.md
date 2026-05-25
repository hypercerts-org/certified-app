# Inventory — lib utilities

Split into 8 sub-modules:

## src/lib/auth

- `auth-context.tsx` — AuthProvider, useAuth, sign-in modal, postMessage listeners.
- `csrf.ts` — `checkCsrf` (origin allowlist).
- `fetch.ts` — `authFetch` + 401 interceptor.
- `oauth-client.ts` — `NodeOAuthClient` singleton.
- `post-signin.ts` — post-signin redirect/onboarding hooks.
- `rate-limit.ts` — recently-added per-route rate limiter.
- `session.ts` — `createSession`/`getSessionDid`/`deleteSession`.
- `stores.ts` — Redis state + session stores.
- `types.ts` — `AuthState`.

## src/lib/atproto

- `activity.ts`, `activity-types.ts`, `activity-uri.ts`.
- `badges.ts`, `cert.ts`, `cert-context.ts`, `collection.ts`, `context-attachment.ts`.
- `did.ts` — resolveHandle/resolvePdsUrl.
- `endorsement-closure-cache.ts`, `follow.ts`, `indexer.ts`, `labeller.ts`, `location.ts`.
- `notifications.ts`, `profile.ts`, `project.ts`, `records-by-uri.ts`.
- `repo-write.ts`, `save-with-swap.ts`, `service-auth.ts`, `types.ts`, `workspace.ts`.
- Tests: `__tests__/collection.test.ts`, `__tests__/repo-write.test.ts`.

## src/lib/groups

- `api.ts` — client API calls.
- `constants.ts` — GROUP_SERVICE, MAX_SELF_CREATED_ORGS.
- `navigation.ts` — group-aware nav helpers.
- `org-context.tsx` — OrgProvider, useOrg, localStorage.
- `org-marker.ts`, `org-types.ts`, `personal-only.ts`.
- `proxy-agent.ts` — GROUP_LEXICONS, createGroupAgent.
- `types.ts` — Group, OrgRole, OrgMember.
- `use-org-limit.ts` — useOrgCreationLimit hook.

## src/lib/leaflet (tiptap editor)

- `embed-url.ts`, `from-tiptap.ts`, `guards.ts`, `to-tiptap.ts`, `types.ts`.

## src/lib/locations, map, navbar-context, notifications-context, providers

- `locations/geocode.ts`, `map/tiles.ts`.
- `navbar-context.tsx` — default|transparent.
- `notifications-context.tsx`.
- `providers.tsx` — passthrough (per AGENTS.md).
- `feedback-context.tsx` — feedback modal state.
- `onboarding/{dismissed-sentinel.ts, onboarding-context.tsx}`.

## src/lib/utils

- `api.ts` — `extractError`.
- `bounded-cache.ts` — LRU helper.
- `config.ts` — `PUBLIC_URL` + `PUBLIC_URL_STRICT`.
- `constants.ts` — LIMIT_MIN/MAX/DEFAULT etc.
- `did.ts` — DID validators (in addition to `lib/atproto/did.ts` resolvers).
- `format-date.ts`, `initials.ts`, `ip.ts`, `log-safe.ts`, `recently-viewed.ts`, `safe-url.ts`, `sanitize.ts`, `swap-drafts.ts`.
- Tests: `__tests__/api.test.ts`, `__tests__/log-safe.test.ts`, `__tests__/safe-url.test.ts`.

## src/lib/types

- `api.ts` — shared response types.

## Identity-link (legacy?)

The AGENTS.md older revision listed `src/lib/identity-link/` (attestation, pds,
types). I do not see it in the file tree dump above — verify if removed.

## Verification gotchas

- Multiple `did.ts` files: `src/lib/atproto/did.ts` (network resolvers) vs
  `src/lib/utils/did.ts` (validators). Different responsibilities, but the
  naming clash is a finding candidate.
