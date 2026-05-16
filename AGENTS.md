# Agent Instructions — Certified

This document is the canonical reference for coding agents working in this repository. It supersedes the shorter `AGENTS.md` and complements `README.md`. Read it end-to-end on a fresh clone; treat the file map and security rules as authoritative.

## Table of Contents

0. [Design Context](#0-design-context)
1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Quick Reference](#3-quick-reference)
4. [Environment Variables](#4-environment-variables)
5. [Architecture & Data Flow](#5-architecture--data-flow)
6. [Provider Tree & Layout System](#6-provider-tree--layout-system)
7. [Routing Map](#7-routing-map)
8. [Authentication Flow](#8-authentication-flow)
9. [API Routes Catalog](#9-api-routes-catalog)
10. [XRPC Proxy](#10-xrpc-proxy)
11. [CSS Conventions](#11-css-conventions)
12. [Component Conventions](#12-component-conventions)
13. [Hooks Catalog](#13-hooks-catalog)
14. [State Management](#14-state-management)
15. [Groups Feature](#15-groups-feature)
16. [Identity-Link / Wallet Attestation](#16-identity-link--wallet-attestation)
17. [Security Rules](#17-security-rules)
18. [SEO / GEO](#18-seo--geo)
19. [Git & Deployment](#19-git--deployment)
20. [File Map](#20-file-map)
21. [Known Limitations](#21-known-limitations)
22. [Common Pitfalls](#22-common-pitfalls)
23. [Adding a New Feature — Checklist](#23-adding-a-new-feature--checklist)
24. [Adding a New API Route — Checklist](#24-adding-a-new-api-route--checklist)
25. [Conventions: Errors, Loading, A11y](#25-conventions-errors-loading-a11y)

---

## 0. Design Context

`PRODUCT.md` at the repo root is the strategic design brief: register, primary user, brand personality (confident, principled, plain), anti-references (anchored on "visibly not-a-wallet"), and design principles. Read it before any UI/UX work. The `/impeccable` skill loads it automatically; humans should open it for any design decision that goes beyond a one-line copy or token tweak.

`DESIGN.md` is the visual companion: the "Notary's Ledger" North Star, a two-register layout doctrine (brand on `/welcome` and `/about`, product everywhere else with a centered narrow column up to ~1024px), the civic palette (Ink, Paper, Slate, Canvas, Sunken, Raised, Elevated, Annotation Green), Noto Serif and Instrument Serif italic typography with OpenType `tnum`/`case` directives, a three-step `--shadow-sm`/`md`/`lg` vocabulary on floating elements only, and twelve named rules across colors, typography, and elevation (No-Brand-Hue, Warm-Neutral, One-Voice-of-Color, Semantic-Token, Serif-Authority, One-Italic, 65-75ch, Weight-Ceiling-on-Inter, Uppercase-Plus-Tracking, Flat-By-Default, Floating-Only-Shadow, Hairline). Machine-readable tokens live in the YAML frontmatter; the sidecar at `.impeccable/design.json` carries shadows, motion, breakpoints, tonal ramps, and ready-to-render component snippets.

DESIGN.md describes the **target state**. Two migrations are implied. **(a) Token refactor:** replace concrete `--color-*` tokens with the semantic two-layer system (`--bg-canvas`, `--fg-primary`, `--border-default`, `--btn-primary-bg`, `--shadow-sm`/`md`/`lg`). The current `--color-*` tokens become legacy aliases. **(b) Component canonicalization:** the components in `src/components/ui/` (`<Button>` 4 variants by 3 sizes, `<Badge>`, `<Avatar>`, `<Input>`, `<Textarea>`) are the source of truth; BEM-style classes in `globals.css` (`.signin-modal__submit`, `.hero__btn-primary`, `.feedback-modal__submit`, `.landing-cta__btn`) are legacy and should migrate. `tailwind.config.ts` also holds stale tokens from a prior visual system (`navy: #0F2544`, `accent: #60A1E2`, the `elevation-1`..`elevation-4` shadows) that should be removed in the same pass. The system is light-only today; the semantic layer is structured so a future `[data-theme="dark"]` is a value-flip, not a refactor.

## 1. Project Overview

Certified is a passwordless identity platform built on **AT Protocol** (atproto), operated by the **Hypercerts Foundation**. It lets a user create one identity that travels across partner applications with full data portability and no vendor lock-in.

- **Primary user** — anyone signing in to a partner app via Certified, plus admins managing groups (organizations).
- **Two domains** — `certified.app` (this app, the BFF + UI) and `certified.one` (the ePDS / extended Personal Data Server that hosts user data). When a user signs up they get an atproto identity rooted at `certified.one`; they can also sign in with any external atproto handle.
- **AT Protocol context** — atproto identities are DIDs (`did:plc:...` or `did:web:...`). Each DID resolves to a DID document that points to a PDS service endpoint, where records are stored under collections (NSIDs) like `app.bsky.actor.profile` or the Certified-specific `app.certified.actor.profile`. This app does not run a PDS itself — it is a thin OAuth client + BFF that proxies XRPC calls.
- **Custom collections** the app reads/writes:
  - `app.certified.actor.profile` — Certified profile (display name, avatar, banner, etc.).
  - `app.certified.actor.organization` — group metadata (org type, urls, founded date).
  - `app.certified.actor.membership` — user-side record of group memberships.
  - `app.bsky.actor.profile` — fallback profile (for Bluesky discoverability).
  - `org.impactindexer.link.attestation` — EIP-712 wallet attestation linking an EVM address to a DID.
- **Group service** — a separate atproto service (currently `certified-group-service-production.up.railway.app`) that manages multi-user organizations. The app proxies all group operations through the user's PDS using a custom `certified_group` proxy pattern with custom NSIDs (`app.certified.group.*`).

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js **16.x** (App Router, React Server Components) |
| React | 19.x |
| Language | TypeScript 5 (strict, `paths: { "@/*": ["./src/*"] }`) |
| Styling | Tailwind CSS 3.4 (utilities only) + custom CSS in `globals.css` (BEM-like) |
| Atproto SDK | `@atproto/api` 0.19, `@atproto/oauth-client-node` 0.3, `@atproto/jwk-jose` 0.1 (`@atproto/oauth-client` 0.6 pulled in transitively) |
| Session/State store | Upstash Redis (`@upstash/redis`) — REST-based, serverless-safe |
| Server actions | None — all server work is in route handlers (`src/app/api/**`) |
| Wallets | `wagmi` 2.x + `viem` 2.x + `@tanstack/react-query` (mounted only on `/settings/wallet`) |
| Email | `resend` 6.x (feedback only; OTP emails are sent by the PDS) |
| Analytics | `@vercel/analytics` |
| Icons | `lucide-react` |
| Fonts | Inter (sans), Noto Serif (headline), Instrument Serif (alt) — via `next/font/google` |
| Hosting | Vercel |
| Lint | ESLint flat config extending `next/core-web-vitals` and `next/typescript` |
| Test runner | **None.** The "quality gate" is `next build` + `tsc --noEmit`. A behavioral plan lives at `tests/groups.test-plan.md`. |

> Note: Next.js 16 renamed `middleware.ts` to `proxy.ts`. The proxy handler is at `src/proxy.ts`.

## 3. Quick Reference

```bash
npm run dev              # next dev — http://localhost:3000
npm run build            # next build — production build (quality gate)
npm start                # next start — run production build locally
npm run lint             # eslint src/ --ext .ts,.tsx
npx tsc --noEmit         # type check only
```

When the user asks for a dev server, run `npm run dev` from the repo root. When verifying changes before reporting done, run `npm run build` — it is the only automated quality signal in the repo.

## 4. Environment Variables

Source: `.env.local.example` and `src/lib/utils/config.ts`.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PDS_URL` | yes | PDS / handle resolver URL. Defaults to `https://certified.one`. |
| `PUBLIC_URL` | production | Public URL of this app. Used to derive OAuth `client_id`, `redirect_uris`, and the CSRF Origin allowlist. Falls back to `http://localhost:3000` in dev. **For local atproto OAuth sign-in to actually complete, set this to `http://127.0.0.1:3000`** — see [§22 Common Pitfalls](#22-common-pitfalls) #3. |
| `COOKIE_SECRET` | production | HMAC secret for the `certified_session` cookie. Generate with `openssl rand -hex 32`. In dev a fallback string is used. |
| `UPSTASH_REDIS_REST_URL` | yes | Upstash REST URL. |
| `UPSTASH_REDIS_REST_TOKEN` | yes | Upstash REST token. |
| `ATPROTO_PRIVATE_KEY` | optional | EC P-256 private key. If set, the OAuth client switches to confidential (`private_key_jwt` with `ES256`) and exposes a JWKS at `/.well-known/jwks.json`. |
| `RESEND_API_KEY` | optional | Resend key for `/api/feedback`. |
| `RESEND_FROM_EMAIL` | optional | Override "from" header. Defaults to `Certified <no-reply@certified.one>`. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | optional | Adds WalletConnect connector to the wagmi config when set. |
| `NEXT_PUBLIC_GROUP_SERVICE_URL` | optional | Group service base URL. Defaults to the production Railway deployment. |
| `NEXT_PUBLIC_GROUP_SERVICE_DID` | optional | Group service DID (for `getServiceAuth` `aud`). Defaults to `did:web:certified-group-service-production.up.railway.app`. |

`PUBLIC_URL` is the most consequential variable — it is checked against the `Origin` header on every CSRF-protected route, baked into the OAuth client metadata, and used to build the `redirect_uris` array. If it does not match the deployed domain, sign-in and every POST will fail.

## 5. Architecture & Data Flow

```
┌─────────────────┐     authFetch        ┌──────────────────────┐
│ Client (React)  │ ───────────────────▶ │ /api/xrpc/[...method]│
│ - useProfile    │   /api/auth/session  │   (BFF / proxy)      │
│ - useOrg        │ ◀─────────────────── │                      │
│ - useSession    │                      │   uses session DID   │
└─────────────────┘                      │   restores OAuth     │
                                         │   session via Redis  │
                                         └──────────┬───────────┘
                                                    │
                                                    │ DPoP-bound
                                                    │ atproto agent
                                                    ▼
                              ┌─────────────────────────────┐
                              │ User's PDS (e.g. certified.one)│
                              └──────────────┬──────────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │ DID document → service ep    │
                              │ plc.directory or did:web     │
                              └─────────────────────────────┘
```

Key principles:

1. **Browser never holds tokens.** The OAuth tokens / DPoP keys live in Upstash Redis under `oauth:session:<did>` (30-day TTL). The browser only has the `certified_session` cookie, which is an HMAC-signed random session id mapping to a DID via `session:did:<sid>` in Redis (30-day TTL).
2. **All XRPC calls go through `/api/xrpc/[...method]`.** Never call the PDS from the browser directly with credentials — there are none. Use `authFetch()` from `src/lib/auth/fetch.ts`. It detects 401 and triggers the global `onUnauthorized` handler registered by `AuthProvider`, which clears auth state and asks the user to sign in again.
3. **Group operations** use a parallel set of routes under `/api/groups/**` because they require the AtpAgent's `withProxy("certified_group", groupDid)` pattern + custom NSID lexicons (`app.certified.group.*`). They do not share the `/api/xrpc/[...method]` handler.
4. **DID resolution is direct.** `resolvePdsUrl` and `resolveHandle` (in `src/lib/atproto/did.ts`) hit `plc.directory` or the `did:web` host with a 5s timeout; results are not cached server-side.

## 6. Provider Tree & Layout System

`src/app/layout.tsx` mounts the global tree:

```
<html>
  <head>… JSON-LD: Organization + WebSite …</head>
  <body>
    <Providers>                        // src/lib/providers.tsx (currently a passthrough)
      <AuthProvider>                   // OAuth state, modal, redirect overlay
        <OrgProvider>                  // Active group + memberships, persisted to localStorage
          <NavbarProvider>             // "default" | "transparent" navbar variant
            <a class="skip-nav">       // Skip-to-main link
            <Navbar />
            <main id="main-content">
              <AppShell>{children}</AppShell>   // .app-shell wrapper, skipped on /welcome
            </main>
            <Footer />                 // Single global footer on every page
            <FeedbackModal />          // Floating feedback button + modal
          </NavbarProvider>
        </OrgProvider>
      </AuthProvider>
    </Providers>
    <Analytics />
  </body>
</html>
```

Scoped providers (mounted only where used):

- `WagmiProvider` + `QueryClientProvider` — only in `src/app/settings/wallet/layout.tsx`. **Do not** lift these to the root; wagmi is heavy and only the wallet linking flow needs it.
- `AuthGuard` — in `settings/layout.tsx`, `connected-apps/layout.tsx`, and `groups/layout.tsx`. Redirects to `/welcome` when unauthenticated; renders a centered loading spinner while auth is initializing.
- `WelcomeLayout` (`src/app/welcome/layout.tsx`) — sets navbar variant to `"transparent"` while the user is on `/welcome`, and resets to `"default"` on unmount.

## 7. Routing Map

| Route | Type | Auth | Notes |
|---|---|---|---|
| `/` | client redirector (`HomeClient`) | mixed | Sends unauth → `/welcome`; sends auth → `/profile/{did}` (or `{activeOrg.groupDid}` if a group is active). The middleware (`src/proxy.ts`) also redirects unauth → `/welcome` at the edge so a noscript browser still bounces correctly. |
| `/welcome` | server | public | Landing page. Sets transparent navbar variant. JSON-LD: SoftwareApplication + FAQPage. |
| `/about` | server | public | About page. |
| `/terms` | server | public | Terms of Service. |
| `/privacy` | server | public | Privacy Policy. |
| `/dsa` | server | public | DSA compliance. |
| `/profile/[did]` | client | open (renders any DID) | Canonical profile URL. Handles both personal and group DIDs. |
| `/settings` | client | gated (AuthGuard) | If `activeOrg`, renders `OrgSettings`; otherwise account settings (handle, email, password, app-passwords placeholder, 2FA placeholder). |
| `/settings/edit-profile` | client | gated | Edit personal profile. |
| `/settings/my-data` | client | gated | Data export / view. |
| `/settings/wallet` | client | gated + Wagmi | EIP-712 wallet linking. The only route that loads wagmi/viem. |
| `/connected-apps` | client | gated | Lists `CONNECTED_APPS` from `src/lib/constants/apps.ts`. |
| `/groups` | client | gated | List groups, accept/leave/remove public membership. |
| `/groups/create` | client | gated | Register a new group. Enforces `MAX_SELF_CREATED_ORGS = 5`. |
| `/groups/[groupDid]` | client | gated | Group profile view. |
| `/groups/[groupDid]/edit-profile` | client | gated | Edit group profile + metadata. |
| `/groups/[groupDid]/apps` | client | gated | Apps view scoped to a group. |
| `/groups/[groupDid]/settings` | client | gated | Member management + audit log. |
| `/oauth/callback` | client | — | Receives the OAuth redirect. POSTs query string to `/api/auth/callback-handler`, then either `postMessage`s the parent window (iframe flow) or `window.location.replace("/")`. |
| `/.well-known/oauth-client-metadata` | server | public | Generated from `getOAuthClient().clientMetadata` + extras (`brand_color`, `tos_uri`, etc.). Cached `public, max-age=600`. |
| `/.well-known/jwks.json` | server | public | Generated from `getOAuthClient().jwks`. Cached `public, max-age=600`. |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` | server | public | See `src/app/sitemap.ts`, `robots.ts`, `manifest.ts`. |

Permanent redirects (in `next.config.ts`):
- `/settings/security` → `/settings`
- `/settings/account` → `/settings`
- `/settings/connected-apps` → `/connected-apps`

**Edge proxy / middleware** — `src/proxy.ts`:

```ts
export const config = { matcher: ["/"] }
```

Only `/` runs through the proxy. If `certified_session` cookie is missing it 307-redirects to `/welcome`. All other auth-gated pages rely on `AuthGuard` client-side. The redirect happens before React renders, so SSR / SEO crawlers always see `/welcome` for unauthenticated visits.

## 8. Authentication Flow

### Components

- **OAuth client** — `src/lib/auth/oauth-client.ts` builds a `NodeOAuthClient` (singleton). It registers Redis-backed state and session stores, leaves `handleResolver` at the SDK default (`AtprotoHandleResolverNode`, which does DNS-TXT + HTTPS `.well-known/atproto-did` resolution and works for any atproto handle, not just Certified-rooted ones), and conditionally enables `private_key_jwt` when `ATPROTO_PRIVATE_KEY` is set. In **loopback dev mode** (`NODE_ENV !== "production"` AND `PUBLIC_URL` is missing or `http://`) it skips the normal `${PUBLIC_URL}/.well-known/oauth-client-metadata` `client_id` and uses `buildAtprotoLoopbackClientMetadata` instead, because the spec only allows `https://` or the literal `http://localhost` (no port) as a `client_id`.
- **Stores** — `src/lib/auth/stores.ts` wraps Upstash Redis. `RedisStateStore` (10 min TTL) is for the short-lived OAuth flow. `RedisSessionStore` (30 day TTL) holds long-lived atproto sessions (tokens + DPoP key). Both key by `oauth:state:<key>` / `oauth:session:<key>`. **Dev fallback:** when Upstash creds are missing AND `NODE_ENV !== "production"`, the module switches to a process-local `InMemoryRedis` so a fresh clone can sign in locally without provisioning an Upstash database. State doesn't survive a server restart and isn't shared across workers — acceptable for dev only. A console warning fires on first use.
- **App session** — `src/lib/auth/session.ts` issues the `certified_session` cookie:
  - Cookie value = `<32-byte hex sessionId>.<HMAC-SHA256 signature>`.
  - Cookie attributes: `httpOnly`, `secure` in production, `sameSite=lax`, `path=/`, `maxAge=30 days`.
  - Server side, the session id maps to a DID in Redis (`session:did:<sid>`).
  - HMAC verification uses `crypto.timingSafeEqual` to avoid timing attacks.
- **CSRF** — `src/lib/auth/csrf.ts` checks `Origin` header against `new URL(PUBLIC_URL).origin`. If `Origin` is absent (some same-origin no-CORS posts) the request is allowed; if present it must match exactly. Wraps URL parsing in try/catch — any malformed origin returns 403.
- **authFetch** — `src/lib/auth/fetch.ts` wraps `fetch` and calls a registered `onUnauthorized()` listener on 401. `AuthProvider` registers this listener to clear `isAuthenticated`/`did`/`pdsUrl` and surface "Your session has expired."

### Sign-in (email or handle)

1. UI submits to `POST /api/auth/login` with `{ input, mode: "email" | "handle", prompt? }`.
2. Server CSRF-checks, sanitizes input (`sanitizeEmail` / `sanitizeHandle`), then calls `client.authorize(...)`. For `mode: "email"` it points at `PDS_URL` and adds `login_hint`. For `mode: "handle"` it calls `client.authorize(input, …)` and falls back to `https://` + input if the bare input fails.
3. Returns `{ url }`. The client `safeRedirect()`s — only `https:` URLs are allowed (and `http:` in dev). This intentionally allows cross-origin since OAuth bounces to external authorization servers.
4. The PDS UI may post a `switch-provider` message back to the modal (used when an existing user enters a handle on the wrong PDS). `AuthProvider` listens for it and re-runs the handle login flow.

### Callback

1. The PDS redirects to `/oauth/callback?code=…&state=…`. The page is rendered in the modal iframe; if not in an iframe it falls through to `window.location.replace("/")`.
2. The page client-fetches `GET /api/auth/callback-handler?<query>`, which:
   - calls `client.callback(params)` to complete the OAuth exchange,
   - **invalidates the existing `certified_session`** before creating a new one (defense against session fixation),
   - calls `createSession(did)` which writes to Redis and sets the cookie,
   - best-effort seeds `app.certified.actor.profile` and `app.bsky.actor.profile` with empty `self` records so other apps see the user immediately,
   - returns `{ did }`.
3. If the page is in an iframe, it `postMessage`s `{ type: "oauth-callback-complete", sub: did }` to the parent. `AuthProvider` listens, validates `event.origin`, and calls `refreshSession()`.

### Session lookup & sign-out

- `GET /api/auth/session` — reads cookie, looks up DID in Redis, calls `client.restore(did)` to confirm the upstream session is still valid; if `restore` throws, deletes both the local session and returns `{ did: null }`. The browser uses this on app load.
- `POST /api/auth/logout` — CSRF-checked. Calls `oauthSession.signOut()` upstream (best-effort), deletes the local session, returns `{ success: true }`. The client also calls `clearSessionCache()` for `useSession` and clears Auth state immediately (optimistic logout).

### `safeRedirect` in `auth-context.tsx`

Validates returned URLs to prevent protocol-injection (e.g. `javascript:`). Allows only `https:` (and `http:` in dev). Cross-origin is permitted on purpose — the OAuth flow lands on external authorization servers.

## 9. API Routes Catalog

### Auth

| Route | Method | CSRF | Auth | Description |
|---|---|---|---|---|
| `/api/auth/login` | POST | yes | none | Build authorization URL for email or handle login. Sanitizes input. Returns `{ url }`. |
| `/api/auth/callback-handler` | GET | n/a | none | Server-side OAuth code exchange. Invalidates old session, creates new one, seeds profile records. |
| `/api/auth/session` | GET | n/a | cookie | Returns `{ did }` or `{ did: null }`. Calls `client.restore(did)` to detect upstream invalidation. |
| `/api/auth/logout` | POST | yes | cookie | Calls upstream `signOut`, deletes Redis session and cookie. |

### XRPC proxy

| Route | Method | CSRF | Auth | Description |
|---|---|---|---|---|
| `/api/xrpc/[...method]` | GET | n/a | cookie | Whitelisted query methods (see [§10](#10-xrpc-proxy)). |
| `/api/xrpc/[...method]` | POST | yes | cookie | Whitelisted procedure methods. Enforces collection allowlist + repo ownership. |

### Groups

| Route | Method | CSRF | Auth | Description |
|---|---|---|---|---|
| `/api/groups/register` | POST | yes | cookie | Direct call to group service `app.certified.group.register` with service-auth JWT (`getServiceAuth` `lxm: "app.certified.group.register"`). Enforces `MAX_SELF_CREATED_ORGS = 5` by counting groups where the caller's member entry has `addedBy === ownerDid`. Sanitizes 5xx errors. |
| `/api/groups/memberships` | GET | n/a | cookie | Lists remote memberships from the group service. Server-side service-auth using `lxm: "app.certified.groups.membership.list"`. |
| `/api/groups/[groupDid]/profile` | GET | n/a | none | Reads `app.certified.actor.profile` from the group's PDS (resolved via DID document). Reads are public. |
| `/api/groups/[groupDid]/profile` | PUT | yes | cookie | Writes the org profile via `createGroupAgent(...).call("app.certified.group.repo.putRecord", …)`. |
| `/api/groups/[groupDid]/metadata` | GET / PUT | PUT yes | open / cookie | Same pattern for `app.certified.actor.organization`. |
| `/api/groups/[groupDid]/bsky-profile` | POST | yes | cookie | Creates an empty `app.bsky.actor.profile` record for discoverability. |
| `/api/groups/[groupDid]/handle` | PUT | yes | cookie | Calls `groupAgent.com.atproto.identity.updateHandle({ handle })` — proxied through PDS to group service. |
| `/api/groups/[groupDid]/members` | GET / POST / DELETE | POST/DELETE yes | cookie | List, add, remove members. |
| `/api/groups/[groupDid]/role` | PUT | yes | cookie | Set member role. Validates role is one of `member`, `admin`, `owner`. |
| `/api/groups/[groupDid]/audit` | GET | n/a | cookie | Query audit log. Filters: `actorDid`, `action`, `collection`, `limit`, `cursor`. |
| `/api/groups/[groupDid]/upload-blob` | POST | yes | cookie | 5MB cap, allowed types `image/jpeg|png|webp`. |

### Discovery

| Route | Method | CSRF | Auth | Description |
|---|---|---|---|---|
| `/api/resolve-handle` | GET | n/a | cookie | Calls `com.atproto.identity.resolveHandle`. Returns `{ did, handle }`. |
| `/api/resolve-did` | GET | n/a | cookie | Calls `resolveHandle(did)` (DID doc) + `app.bsky.actor.getProfile` for display name. Returns `{ did, handle, displayName }`. |
| `/api/search-actors` | GET | n/a | cookie | Calls `app.bsky.actor.searchActors`. `limit` clamped to 25. |

### Other

| Route | Method | CSRF | Auth | Description |
|---|---|---|---|---|
| `/api/feedback` | POST | yes | none | Resend email to `support@hypercerts.org`. Strips invisible Unicode from `message` and `email`. Validates email format. Sends a confirmation email to the user if they provided one. |
| `/.well-known/oauth-client-metadata` | GET | n/a | none | OAuth client metadata. `Cache-Control: public, max-age=600`. |
| `/.well-known/jwks.json` | GET | n/a | none | JWKS (only meaningful when `ATPROTO_PRIVATE_KEY` is set). |

## 10. XRPC Proxy

`src/app/api/xrpc/[...method]/route.ts` is the central proxy from the client to the user's PDS.

### Allowed GET methods

- `com.atproto.repo.getRecord`
- `com.atproto.repo.listRecords` (limit clamped to `[LIMIT_MIN=1, LIMIT_MAX=100]`)
- `com.atproto.server.getSession`
- `com.atproto.sync.getBlob` — returns binary; sets `Content-Type` from upstream

Anything else returns 400 `Unknown method`.

### Allowed POST methods

- `com.atproto.repo.createRecord`
- `com.atproto.repo.putRecord`
- `com.atproto.repo.deleteRecord`
- `com.atproto.repo.uploadBlob`
- `com.atproto.identity.updateHandle`
- `com.atproto.server.requestPasswordReset`
- `com.atproto.server.resetPassword`
- `com.atproto.server.requestEmailUpdate`
- `com.atproto.server.updateEmail`

For `createRecord` / `putRecord` / `deleteRecord`:
- `body.repo` must equal the session DID — cross-repo writes are 403.
- `body.collection` must be one of:
  - `org.impactindexer.link.attestation`
  - `app.certified.actor.profile`
  - `app.certified.actor.membership`
  - `app.certified.actor.organization`

If you need to write a new collection, **add it to `ALLOWED_WRITE_COLLECTIONS`** in `src/app/api/xrpc/[...method]/route.ts`. The proxy will silently 403 otherwise.

### Blob uploads

- `MAX_BLOB_SIZE = 4 * 1024 * 1024` (4 MB) — Vercel serverless has a ~4.5 MB request body cap.
- `ALLOWED_BLOB_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]`.
- Both `Content-Length` (when present) and the actual `arrayBuffer().byteLength` are checked.
- The group blob route (`/api/groups/[groupDid]/upload-blob`) uses **5 MB** and disallows GIF/SVG (only JPEG/PNG/WEBP).
- Client-side, `src/lib/atproto/profile.ts` enforces 4 MB on avatar/banner uploads; 4 MB matches the proxy cap.

### Error sanitization

`xrpcError(err)` extracts `status` (or `statusCode`) and `message`. **For status ≥ 500, `message` is replaced with `"Internal server error"`** to avoid leaking PDS internals. Stick to this pattern in any new BFF routes.

## 11. CSS Conventions

### Where styles live

- `src/app/globals.css` — single 4,700-line file containing all custom CSS (BEM-like classes with component prefixes: `.dashboard__topbar`, `.signin-modal__backdrop`, `.org-list__item`, etc.).
- Tailwind utilities are used freely *inside* JSX for one-off layout (`flex`, `mt-4`, `max-w-3xl`, etc.).
- Tailwind theme overrides live in `tailwind.config.ts` (custom colors `navy`, `accent`, `sky`, `deep`; custom font sizes `display`, `h1`–`h4`; custom shadows `elevation-1` through `elevation-4`; custom radii `button: 6px`, `card: 4px`, `sm: 2px`).

### CSS variables (declared in `:root`)

- Colors: `--color-primary`, `--color-navy`, `--color-accent`, `--color-off-white`, `--color-gray-100`, `--color-light-gray`, `--color-mid-gray`, `--color-dark-gray`, `--color-surface`, `--color-surface-container`, `--color-surface-container-low`, `--color-surface-container-high`, `--color-accent-hover`.
- Borders: `--border-subtle`, `--border-light`, `--border-default`, `--border-medium`, `--border-hover`, `--border-hover-soft`, `--border-strong`.
- Overlays: `--navy-overlay-30`, `--navy-overlay-70`, `--navy-overlay-85`.
- Semantic: `--color-success`, `--color-success-text`, `--color-warning`, `--color-error`, `--color-outline-variant`.
- Warning surface: `--color-warning-bg`, `--color-warning-border`, `--color-warning-text`.
- Focus / success accents: `--color-focus-green`, `--color-success-icon`.
- Transitions: `--transition-fast` (150 ms), `--transition-base` (250 ms), `--transition-slow` (400 ms cubic-bezier).
- Geometry: `--radius` (2px), `--navbar-height` (64px).

### Rules

1. **No `100vw`.** It triggers horizontal overflow when a scrollbar is present. Use `100%` with the parent providing the layout context. (Confirmed: globals.css contains zero `100vw` rules.)
2. **New components use BEM classes in `globals.css` for layout/structure**, Tailwind for in-component micro-adjustments. Don't reach for Tailwind utilities to recreate something a BEM class already covers.
3. **Reuse the CSS variables** above; don't hard-code colors or transitions in new rules.
4. **Skip-nav styles** are at the top of `globals.css`. Don't duplicate.

## 12. Component Conventions

- **Internal links:** `next/link`. Don't use `<a href>` for in-app routes.
- **SVG icons / button graphics:** raw `<img>` (not `next/image`) for SVG assets. `next/image` is reserved for raster assets where the optimizer adds value (see `partner-apps.tsx` for an example using `Image`).
- **Icons:** `lucide-react`. Don't import individual SVG icon files for new code.
- **Form inputs:** Use the `Input` and `Textarea` components in `src/components/ui/`. They wire up `aria-describedby` + `aria-invalid` + `id` + `useId()`-derived label associations automatically. If you need a bare input, replicate the pattern from `input.tsx` line for line.
- **Dropdown triggers:** `aria-haspopup` + `aria-expanded` (`navbar.tsx` has the canonical pattern).
- **Modals:** wrap the panel with `useFocusTrap<HTMLElement>(active)` from `src/hooks/use-focus-trap.ts`. It both traps Tab/Shift+Tab and restores focus to the previously focused element on close. The trap selector is `a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])`.
- **Skip-nav:** already wired in root layout (`<a href="#main-content" class="skip-nav">`). `<main id="main-content">` exists. Don't reintroduce.
- **External user-controlled URLs (e.g. `profile.website`):** validate the scheme before using as an `href`. Only allow `http:`, `https:`, `mailto:`, `tel:`; reject anything else (including `javascript:`, `data:`, `vbscript:`, malformed). A shared helper for this is tracked as a follow-up.
- **Avatars:** use `Avatar` from `src/components/ui/avatar.tsx` with `fallbackInitials={getInitials(name)}` from `src/lib/utils/initials.ts`.

## 13. Hooks Catalog

Located in `src/hooks/`:

| Hook | Purpose |
|---|---|
| `useSession()` | Cached session data (handle, email) from `com.atproto.server.getSession`. Module-level promise + result cache shared across all instances. `clearSessionCache()` exported for sign-out. Returns `{ handle, email, isLoading, error }`. |
| `useProfile()` | Loads the user's `app.certified.actor.profile`; if empty, falls back to `app.bsky.actor.profile`. Sets `isFallback: true` when using Bluesky. Returns `profile`, `isLoading`, `error`, `refetch`, `avatarUrl`, `bannerUrl`, `isFallback`. Uses `AbortController` per fetch. |
| `useOrgProfile()` | Loads the active group's profile + metadata via `useOrg().activeOrg`. Returns `orgProfile`, `orgMetadata`, `orgAvatarUrl`, `orgBannerUrl`, `isLoading`, `refetch`. |
| `useIdentityLinks(did)` | Fetches all attestations from the user's PDS, EIP-712-verifies EOA signatures with `viem.verifyTypedData`, marks ERC-1271 / ERC-6492 as `verified: false` ("On-chain verification not yet supported"). |
| `useAttestationSigning(did)` | Wagmi-based signer. Builds the EIP-712 message, calls `signTypedDataAsync`, then `storeAttestation` to persist. Returns `signAndStore`, `isSigning`, `isStoring`, `error`, `reset`. **Only valid inside `/settings/wallet` because it depends on the WagmiProvider.** |
| `useFocusTrap<T>(active)` | Focus trap for modals (see [§12](#12-component-conventions)). |

Group-creation limit hook is at `src/lib/groups/use-org-limit.ts` (`useOrgCreationLimit()`).

## 14. State Management

- **Auth state:** `AuthProvider` in `src/lib/auth/auth-context.tsx`. Holds `isLoading`, `isAuthenticated`, `did`, `pdsUrl`, `error`, `isModalOpen`, `isRedirectingToProvider`, plus actions `openSignIn`, `closeModal`, `submitEmail`, `submitHandle`, `signOut`. Also owns the `SignInModal` and `ProviderRedirectOverlay` components.
- **Active group:** `OrgProvider` in `src/lib/groups/org-context.tsx`. Persists the active org to `localStorage` under key `certified_active_org`. Initializes synchronously on first render (`getInitialOrg`) so the navbar avatar doesn't flicker. Refetches groups on auth change. When the auth state turns to "logged out", the active org is cleared.
- **Navbar variant:** `NavbarProvider` (`src/lib/navbar-context.tsx`). Two variants: `default` (opaque) and `transparent` (used on `/welcome`).
- **Wagmi:** scoped to `/settings/wallet/layout.tsx`. Mounts `WagmiProvider` with `config` from `src/lib/wagmi.ts` (chains: mainnet, base, optimism, arbitrum; connectors: injected, coinbaseWallet smart-wallet-only, walletConnect when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set; `ssr: true`).
- **No Redux / Zustand / Jotai.** Local component state + the three contexts above is the entire state model.

## 15. Groups Feature

### Mental model

A "group" = an atproto identity (its own DID + PDS) operated through the **group service** at `GROUP_SERVICE` (default Railway staging). Membership has three roles: `owner`, `admin`, `member`.

The **source of truth for "who is a member of what"** is the group service (queried via `app.certified.groups.membership.list`). The **user-side acceptance bit** is a record in the user's own PDS at `app.certified.actor.membership`. A user can be a member without an accepted record (private/pending) or be an accepted member (public).

### Routes & files

- UI: `src/app/groups/**` and `src/components/groups/**`.
- API: `src/app/api/groups/**` (see [§9](#9-api-routes-catalog)).
- Library: `src/lib/groups/`:
  - `constants.ts` — `GROUP_SERVICE`, `GROUP_SERVICE_DID`, NSIDs, `MAX_SELF_CREATED_ORGS = 5`.
  - `types.ts` — `Group`, `OrgRole`, `OrgMember`, `OrgProfile`, `GroupMetadata`, `OrgUrlItem`, `MembershipRecord`, `AuditEntry`, `RemoteMembership`, `CreateOrgParams`, `VerifiedAttestation`.
  - `api.ts` — client-side functions (`listMemberships`, `putMembership`, `deleteMembership`, `uploadOrgBlob`, `createBskyProfile`, `registerGroup`, `getOrgProfile`, `putOrgProfile`, `getOrgMetadata`, `putOrgMetadata`, `listOrgMembers`, `addOrgMember`, `removeOrgMember`, `setOrgMemberRole`, `queryOrgAuditLog`, `fetchRemoteMemberships`, `getSelfCreatedOrgCount`, `resolveGroups`).
  - `proxy-agent.ts` — server-side. Defines `GROUP_LEXICONS` (10 custom NSIDs under `app.certified.group.*`), exports `getAuthenticatedAgent()`, `createGroupAgent(agent, groupDid)` (uses `agent.withProxy("certified_group", groupDid)` and registers the lexicons), and `getServiceAuthToken(agent, lxm)` for the rare direct-call case (registration only).
  - `org-context.tsx` — provider/context.
  - `use-org-limit.ts` — group-creation limit hook.

### Custom NSIDs (lexicons)

Defined in `src/lib/groups/proxy-agent.ts`:

| NSID | Type | Purpose |
|---|---|---|
| `app.certified.group.register` | procedure | Register a new group (direct call). |
| `app.certified.group.repo.createRecord` | procedure | Proxied write. |
| `app.certified.group.repo.putRecord` | procedure | Proxied write. |
| `app.certified.group.repo.deleteRecord` | procedure | Proxied write. |
| `app.certified.group.repo.uploadBlob` | procedure | Proxied blob upload. |
| `app.certified.group.member.add` | procedure | Add member. |
| `app.certified.group.member.remove` | procedure | Remove member. |
| `app.certified.group.member.list` | query | List members. |
| `app.certified.group.role.set` | procedure | Set member role. |
| `app.certified.group.audit.query` | query | Query audit log. |

### Group creation limit

`MAX_SELF_CREATED_ORGS = 5`. Enforced both server-side (in `/api/groups/register`) and client-side (in `useOrgCreationLimit()`). A group is "self-created" when the user's member entry has `addedBy === ownerDid`. The server-side check fetches all memberships and member lists for those groups, then counts.

## 16. Identity-Link / Wallet Attestation

**Goal:** prove a DID controls an EVM address (and vice versa) by signing an EIP-712 message with the wallet and storing the attestation in the user's PDS.

### EIP-712 schema

Defined in `src/lib/identity-link/attestation.ts`:

```ts
ATTESTATION_DOMAIN = { name: "ATProto EVM Attestation", version: "1" }
ATTESTATION_TYPES = {
  Attestation: [
    { name: "did", type: "string" },
    { name: "evmAddress", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
}
```

`buildAttestationMessage(did, address, chainId)` returns both the typed-form (with bigints, for `signTypedData`) and the stored-form (with strings, for JSON serialization in the PDS record).

### Storage

- Collection: `org.impactindexer.link.attestation` (allowlisted in the XRPC proxy).
- rkey: `${address.toLowerCase()}-${chainId}` so the same wallet on the same chain overwrites itself.
- Record shape (`Attestation` type in `src/lib/identity-link/types.ts`): `{ $type, address, chainId, signature, message, signatureType: "eoa" | "erc1271" | "erc6492", createdAt }`.

### Verification

`useIdentityLinks(did)`:
- Lists all attestations from the PDS.
- For `signatureType === "eoa"`, verifies the signature client-side with `viem.verifyTypedData`. The recovered address must match `address` in the record.
- For `erc1271` / `erc6492`, returns `verified: false` with `verificationError: "On-chain verification not yet supported"`. **This is a known limitation.** The signing path can produce these signature types (smart contract wallets), but the verifier can't validate them yet — it would need a JSON-RPC eth_call to the contract's `isValidSignature(bytes32 hash, bytes signature)` per ERC-1271, plus ERC-6492 unwrapping for not-yet-deployed accounts.

### Wallet flow

`useAttestationSigning(did)`:
1. Checks `isAuthenticated` and wallet `isConnected`.
2. Builds the message.
3. `signTypedDataAsync(domain, types, message)`.
4. `storeAttestation(did, address, chainId, signature, storedMessage, "eoa")`.

This hook depends on `WagmiProvider`, so it only works under `/settings/wallet/`. If you want wallet linking elsewhere, lift the provider — but think hard before doing so (wagmi + viem are heavy).

## 17. Security Rules

These rules are mandatory. Treat any deviation as a regression.

### Server-side

1. **CSRF on every POST/PUT/DELETE** — call `checkCsrf(request)` at the top of any state-changing route handler. The check compares the `Origin` header against `PUBLIC_URL`. URL parsing is wrapped in try/catch; malformed origins return 403.
2. **Cookie verification uses `timingSafeEqual`** (`src/lib/auth/session.ts`). Don't replace it with `===`.
3. **HMAC every session id.** The cookie value is `<sessionId>.<HMAC>`. Truncating to "just sessionId" would let attackers forge any session.
4. **Invalidate the existing session before creating a new one** in `callback-handler/route.ts`. This prevents session fixation if the user reuses a tab where another session was active.
5. **Wrap Redis ops in try/catch.** Both `session.ts` and `stores.ts` do this; new BFF code must too. A Redis blip should not 500 the request unless absolutely necessary.
6. **Sanitize input twice** — client AND server (defense in depth). Use `stripInvisible`, `sanitizeEmail`, `sanitizeHandle` from `src/lib/utils/sanitize.ts`. The regex is `/[​-‏ - ⁠-⁯﻿­͏؜᠎]/g`.
7. **Sanitize 5xx errors.** Never echo `err.message` from upstream PDS errors when status ≥ 500 — return `"Internal server error"` (or a route-specific generic). The XRPC proxy and `/api/groups/register` both do this; copy the pattern. (4xx errors *can* echo upstream messages — those are usually validation errors a user can act on.)
8. **Repo ownership on writes** — for `createRecord`/`putRecord`/`deleteRecord`, `body.repo` must equal the session DID. Cross-repo writes are 403.
9. **Collection allowlist** — only the four `ALLOWED_WRITE_COLLECTIONS` can be written through the XRPC proxy. Add to that array consciously, not implicitly.
10. **Blob limits** — 4 MB cap (image MIME types only) on `/api/xrpc/[...method]` for `uploadBlob`; 5 MB on the group blob route. Both check `Content-Length` and the actual buffer size. Vercel has a hard ~4.5 MB body cap that constrains the XRPC proxy.
11. **Service-auth tokens are short-lived and per-LXM** — `getServiceAuthToken(agent, lxm)` issues a token bound to a single method. Don't cache or reuse.

### Client-side

12. **`safeRedirect()`** in `auth-context.tsx` — only `https:` (and `http:` in dev). Never call `window.location.href = serverProvidedUrl` directly.
13. **Validate `event.origin` on `postMessage`.** Both message listeners in `auth-context.tsx` do this. Copy the pattern.
14. **`authFetch()` for every authenticated XRPC call**, not raw `fetch`. The 401 interceptor is what surfaces session expiry.

### HTTP headers

`next.config.ts` sets these on every response:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY` (the OAuth callback iframe is same-origin, so this is fine)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

Don't override these per-route unless you have a specific reason.

## 18. SEO / GEO

- **JSON-LD:**
  - `Organization` (Hypercerts Foundation) and `WebSite` in `src/app/layout.tsx`. Includes legal address, contact point, `sameAs` for social profiles.
  - `SoftwareApplication` and `FAQPage` in `src/app/welcome/page.tsx`. The FAQPage entries are derived from `FAQ_ITEMS` in `src/components/landing/sections/faq-content.tsx`.
- **Title template:** `default: "Certified"`, `template: "%s — Certified"`. Pages export their own `title` via `metadata`.
- **OG / Twitter:** root defaults in `layout.tsx` (`/assets/certified-hero-1200x630.png`, `@hypercerts`). Pages override per-route. `metadataBase` is `https://certified.app`.
- **Canonical URLs:** every public page exports `alternates: { canonical: "https://certified.app/<path>" }`. Authenticated pages set `robots: { index: false, follow: false }` and don't bother with canonicals.
- **`robots.ts`** — allows `/`, `/welcome`, `/about`, `/terms`, `/privacy`, `/dsa`; disallows `/settings/*`, `/groups/*`, `/connected-apps`, `/oauth/*`, `/api/*`. Sitemap pointer at `https://certified.app/sitemap.xml`.
- **`sitemap.ts`** — five public URLs with `lastModified` dates (currently 2026-03-15 / 2026-04-01 / 2026-04-07).
- **`manifest.ts`** — PWA manifest. `start_url: "/welcome"`, `theme_color: "#f9f9f6"`, brandmark icons at 192/512.
- **`public/llms.txt`** — Markdown index for AI crawlers (similar to robots/sitemap but in prose).
- **`/.well-known/oauth-client-metadata`** — also an SEO-adjacent contract: changing `client_id` or `redirect_uris` invalidates existing OAuth sessions.

When adding a new public page: set `metadata.title`, `description`, `alternates.canonical`, and OG `url` + `images`. Add it to `sitemap.ts` and `robots.ts` (allow). Consider whether it deserves a JSON-LD entry.

## 19. Git & Deployment

- **Branches:**
  - `main` → production (`certified.app`)
  - `staging` → preview (`staging.certified.app`)
- **Workflow:** push to `staging`, open a PR to `main`. Vercel deploys both branches automatically.
- **Quality gate:** `npm run build` must succeed before pushing. There is no test suite to run; `tsc --noEmit` is implicit in `next build`.
- **`PUBLIC_URL`** must match the deployed domain on each environment, since `client_id`, `redirect_uris`, and the CSRF allowlist all derive from it.
- Don't commit secrets (`.env.local` is gitignored). `COOKIE_SECRET`, `UPSTASH_*`, `ATPROTO_PRIVATE_KEY`, `RESEND_API_KEY` live in Vercel envs.

## 20. File Map

```
certified-app/
├── AGENTS.md                           # Short pointer to README + this draft
├── README.md                           # Public README
├── next.config.ts                      # Headers, redirects, image remotePatterns, serverExternalPackages
├── tsconfig.json                       # strict, paths { "@/*": ["./src/*"] }, ES2017, react-jsx
├── tailwind.config.ts                  # Theme: navy/accent/sky/deep colors, h1-h4, elevation shadows
├── eslint.config.mjs                   # next/core-web-vitals + next/typescript
├── postcss.config.mjs                  # tailwindcss + autoprefixer
├── .env.local.example                  # Env var template
├── tests/
│   └── groups.test-plan.md             # Manual behavioral test plan (no automated tests)
├── public/
│   ├── llms.txt                        # AI crawler description
│   ├── assets/
│   │   ├── partners/                   # Partner app logos (maearth, gainforest, simocracy, hyperboards)
│   │   ├── certified_brandmark_black.{svg,png}
│   │   ├── certified_brandmark_black_{192,512}.png
│   │   ├── certified_wordmark_black.{svg,png}
│   │   ├── certified_signin_black.{svg,png}
│   │   ├── certified_signinwith_black.{svg,png}
│   │   ├── certified_poweredby_*.{svg,png}
│   │   ├── certified-hero-1200x630.png # OG image
│   │   └── guilloche_02.svg            # Decorative background, SVGO-optimized
│   ├── brand/                          # Partner-facing brand assets (brandmark, poweredby, signin, wordmark variants)
│   └── email/
│       └── otp-email-template.html     # Branded OTP email (referenced from oauth-client-metadata)
└── src/
    ├── proxy.ts                        # Next 16 proxy (was middleware.ts in 15) — redirects `/` → `/welcome` when no session cookie
    ├── app/
    │   ├── layout.tsx                  # Root layout: providers, JSON-LD, fonts, skip-nav, navbar/main/footer/feedback
    │   ├── globals.css                 # ALL custom CSS (~4.7k lines, BEM-like)
    │   ├── icon.png                    # Favicon
    │   ├── apple-icon.png              # Apple touch icon
    │   ├── manifest.ts                 # PWA manifest
    │   ├── robots.ts                   # robots.txt
    │   ├── sitemap.ts                  # sitemap.xml
    │   ├── error.tsx                   # Global error boundary
    │   ├── not-found.tsx               # 404 page
    │   ├── page.tsx                    # `/` — renders <HomeClient /> (redirector)
    │   ├── welcome/
    │   │   ├── layout.tsx              # Sets navbar variant to "transparent"
    │   │   └── page.tsx                # Landing + JSON-LD (SoftwareApplication, FAQPage)
    │   ├── about/page.tsx
    │   ├── terms/page.tsx
    │   ├── privacy/page.tsx
    │   ├── dsa/page.tsx
    │   ├── profile/[did]/page.tsx      # Canonical profile URL — renders <ProfileClient />
    │   ├── settings/
    │   │   ├── layout.tsx              # AuthGuard
    │   │   ├── page.tsx                # If activeOrg → OrgSettings; else handle/email/password/2FA placeholder
    │   │   ├── edit-profile/page.tsx   # Edit personal profile
    │   │   ├── my-data/page.tsx        # Data export view
    │   │   └── wallet/
    │   │       ├── layout.tsx          # WagmiProvider + QueryClientProvider (scoped here ONLY)
    │   │       └── page.tsx            # Wallet linking UI
    │   ├── connected-apps/
    │   │   ├── layout.tsx              # AuthGuard
    │   │   └── page.tsx
    │   ├── groups/
    │   │   ├── layout.tsx              # AuthGuard
    │   │   ├── page.tsx                # List groups (accept/leave/remove public)
    │   │   ├── create/page.tsx         # Register new group
    │   │   └── [groupDid]/
    │   │       ├── page.tsx            # Group profile view
    │   │       ├── edit-profile/page.tsx
    │   │       ├── apps/page.tsx
    │   │       └── settings/page.tsx   # Members + audit log
    │   ├── oauth/callback/page.tsx     # OAuth redirect target — postMessages parent or window.replace("/")
    │   ├── api/
    │   │   ├── auth/
    │   │   │   ├── login/route.ts             # POST {input,mode,prompt} → {url}
    │   │   │   ├── callback-handler/route.ts  # GET — completes OAuth, creates session, seeds profile records
    │   │   │   ├── session/route.ts           # GET — returns {did} or {did:null}
    │   │   │   └── logout/route.ts            # POST — signOut + delete session
    │   │   ├── xrpc/[...method]/route.ts      # The XRPC proxy
    │   │   ├── feedback/route.ts              # POST → Resend
    │   │   ├── resolve-handle/route.ts        # GET ?handle=
    │   │   ├── resolve-did/route.ts           # GET ?did=
    │   │   ├── search-actors/route.ts         # GET ?q=
    │   │   └── groups/
    │   │       ├── register/route.ts          # POST — register new group (enforces MAX_SELF_CREATED_ORGS)
    │   │       ├── memberships/route.ts       # GET — list user's group memberships
    │   │       └── [groupDid]/
    │   │           ├── audit/route.ts         # GET — audit log
    │   │           ├── bsky-profile/route.ts  # POST — create empty bsky profile
    │   │           ├── handle/route.ts        # PUT — update handle
    │   │           ├── members/route.ts       # GET/POST/DELETE
    │   │           ├── metadata/route.ts      # GET/PUT — app.certified.actor.organization
    │   │           ├── profile/route.ts       # GET/PUT — app.certified.actor.profile
    │   │           ├── role/route.ts          # PUT — set member role
    │   │           └── upload-blob/route.ts   # POST — 5MB image upload
    │   └── .well-known/
    │       ├── oauth-client-metadata/route.ts # OAuth client metadata
    │       └── jwks.json/route.ts             # JWKS (when ATPROTO_PRIVATE_KEY set)
    │
    ├── components/
    │   ├── landing/
    │   │   ├── landing-page.tsx           # Server-rendered landing assembly
    │   │   ├── home-client.tsx            # `/` redirector (auth → /profile/{did}, unauth → /welcome)
    │   │   ├── hero-signin-button.tsx     # Client island for hero CTA
    │   │   ├── orbiting-logos.tsx         # Animated logo orbit (IntersectionObserver-gated)
    │   │   └── sections/
    │   │       ├── built-for-trust.tsx
    │   │       ├── faq-accordion.tsx
    │   │       ├── faq-content.tsx        # FAQ_ITEMS array — also used by FAQPage JSON-LD
    │   │       ├── how-it-works.tsx
    │   │       ├── partner-apps.tsx
    │   │       ├── ready-cta-button.tsx
    │   │       ├── ready-cta-content.tsx
    │   │       └── what-you-get.tsx
    │   ├── layout/
    │   │   ├── app-shell.tsx              # .app-shell wrapper, skipped on /welcome
    │   │   ├── auth-guard.tsx             # Auth redirect with loading spinner
    │   │   ├── footer.tsx                 # Global footer (single instance, in root layout)
    │   │   └── navbar.tsx                 # Top nav with account switcher, mobile bottom sheet
    │   ├── dashboard/
    │   │   ├── custom-domain-modal.tsx
    │   │   └── username-card.tsx
    │   ├── groups/
    │   │   ├── add-org-modal.tsx
    │   │   ├── handle-search.tsx
    │   │   ├── membership-sync-modal.tsx
    │   │   └── org-settings.tsx
    │   ├── profile/
    │   │   ├── avatar-upload.tsx
    │   │   ├── banner-upload.tsx
    │   │   ├── profile-client.tsx
    │   │   └── profile-edit-form.tsx
    │   ├── identity-link/
    │   │   ├── identity-link-card.tsx
    │   │   └── link-wallet-flow.tsx
    │   ├── account/
    │   │   ├── email-section.tsx
    │   │   └── password-section.tsx
    │   └── ui/
    │       ├── avatar.tsx
    │       ├── badge.tsx
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── error-message.tsx
    │       ├── feedback-modal.tsx         # Floating feedback button + modal (avoids footer overlap via scroll listener on .landing-footer)
    │       ├── input.tsx                  # Canonical aria-describedby/aria-invalid pattern
    │       ├── loading-spinner.tsx
    │       ├── provider-redirect-overlay.tsx
    │       ├── sign-in-modal.tsx
    │       └── textarea.tsx
    │
    ├── hooks/
    │   ├── use-attestation-signing.ts     # Wagmi-only — must be inside /settings/wallet
    │   ├── use-focus-trap.ts              # Generic Tab/Shift+Tab trap + focus restore
    │   ├── use-identity-links.ts          # Lists + verifies wallet attestations
    │   ├── use-org-profile.ts             # Active org's profile + metadata
    │   ├── use-profile.ts                 # User's profile with bsky fallback (AbortController)
    │   └── use-session.ts                 # Cached handle+email (module-level promise cache)
    │
    └── lib/
        ├── auth/
        │   ├── auth-context.tsx           # AuthProvider, useAuth, sign-in modal, postMessage listeners
        │   ├── csrf.ts                    # checkCsrf — Origin === PUBLIC_URL check
        │   ├── fetch.ts                   # authFetch — 401 interceptor
        │   ├── oauth-client.ts            # NodeOAuthClient singleton, PDS_URL constant
        │   ├── session.ts                 # createSession/getSessionDid/deleteSession (HMAC + Redis)
        │   ├── stores.ts                  # RedisStateStore (10min) + RedisSessionStore (30day) + getRedis()
        │   └── types.ts                   # AuthState interface
        ├── atproto/
        │   ├── did.ts                     # resolveHandle + resolvePdsUrl (5s timeout, plc.directory + did:web)
        │   ├── profile.ts                 # getProfile/putProfile, uploadAvatar/uploadBanner, getAvatarUrl/getBannerUrl
        │   └── types.ts                   # CertifiedProfile, BlueskyProfile, hypercerts defs
        ├── groups/
        │   ├── api.ts                     # All client-side group API calls
        │   ├── constants.ts               # GROUP_SERVICE, GROUP_SERVICE_DID, MAX_SELF_CREATED_ORGS
        │   ├── index.ts                   # Re-exports
        │   ├── org-context.tsx            # OrgProvider, useOrg, localStorage persistence
        │   ├── proxy-agent.ts             # GROUP_LEXICONS, getAuthenticatedAgent, createGroupAgent
        │   ├── types.ts                   # Group, OrgRole, OrgMember, etc.
        │   └── use-org-limit.ts           # useOrgCreationLimit hook
        ├── identity-link/
        │   ├── attestation.ts             # ATTESTATION_DOMAIN/TYPES, buildAttestationMessage, buildRecordKey
        │   ├── pds.ts                     # listAttestations/storeAttestation/deleteAttestation (client-side)
        │   └── types.ts                   # Attestation, AttestationRecord, asHex helper
        ├── constants/
        │   └── apps.ts                    # CONNECTED_APPS — single source of truth for partner list
        ├── types/
        │   └── api.ts                     # Shared response types (SessionResponse, ListRecordsResponse, PutRecordResponse)
        ├── utils/
        │   ├── api.ts                     # extractError(res, fallback)
        │   ├── config.ts                  # PUBLIC_URL + PUBLIC_URL_STRICT
        │   ├── constants.ts               # LIMIT_MIN/MAX/DEFAULT, debounce timings
        │   ├── initials.ts                # getInitials()
        │   └── sanitize.ts                # stripInvisible/sanitizeEmail/sanitizeHandle
        ├── navbar-context.tsx             # NavbarProvider — "default" | "transparent" variant
        ├── providers.tsx                  # Currently a passthrough — placeholder for cross-cutting providers
        └── wagmi.ts                       # wagmi config (mainnet/base/optimism/arbitrum) + SUPPORTED_CHAINS
```

## 21. Known Limitations

- **No automated tests.** `tests/groups.test-plan.md` is a manual behavioral plan, not runnable. The quality gates are `npm run build` and `npx tsc --noEmit`.
- **2FA / TOTP** — not implemented on the ePDS. The `/settings` page shows a "This will be available soon" placeholder.
- **App passwords** — same status: placeholder card on `/settings`.
- **ERC-1271 / ERC-6492 verification** — `useIdentityLinks` returns `verified: false` for smart-contract-wallet signatures with `verificationError: "On-chain verification not yet supported"`. The signing path can produce these (the `signatureType` field exists), but the verifier doesn't make on-chain `isValidSignature` calls yet.
- **TypeScript `as` casts** — widespread on API request/response bodies (e.g. the XRPC proxy and most route handlers cast through `as`). Improving this requires pulling in the official atproto SDK input/output types per method; tracked separately.
- **Group service is staging-only** — default `GROUP_SERVICE` points at a Railway staging deployment. Don't rely on group data for production-critical flows.
- **No avatar / banner CDN** — image URLs are direct PDS `getBlob` calls. Heavy traffic would put load on the PDS.
- **No rate limiting** in the BFF beyond what Vercel and Upstash provide.
- **No structured logging** — `console.error("[Auth] …", err)` is the convention. Logs end up in Vercel's serverless logs.

## 22. Common Pitfalls

1. **`useAttestationSigning` outside `/settings/wallet`** — it depends on `WagmiProvider` which is mounted only in `src/app/settings/wallet/layout.tsx`. Calling it elsewhere will throw "useConfig must be used within WagmiConfig".
2. **Using `fetch` instead of `authFetch`** — the 401 interceptor is the only thing surfacing session expiry to the user. Raw `fetch` will silently fail.
3. **Origin check failures in dev** — if you set `PUBLIC_URL=https://certified.app` in `.env.local` and run `npm run dev` on localhost, every POST will 403. Match `PUBLIC_URL` to whatever host your browser actually hits (use `http://127.0.0.1:3000` if you want sign-in to work — see next pitfall).

3a. **atproto OAuth in dev requires the loopback metadata helper, not just `PUBLIC_URL`.** The spec only accepts a `client_id` that is either a real `https://` URL or the literal `http://localhost` origin (no port, no path). Pointing `client_id` at `http://localhost:3000/...` or `http://127.0.0.1:3000/...` makes `NodeOAuthClient` throw `URL must use the "https:" protocol` (Zod). The fix — already wired into `src/lib/auth/oauth-client.ts` — is to detect dev mode (`NODE_ENV !== "production"` AND `PUBLIC_URL` missing or `http://`) and swap to `buildAtprotoLoopbackClientMetadata({ scope, redirect_uris: ["http://127.0.0.1:<port>/oauth/callback"] })`. Notes:
   - The `client_id` becomes a virtual `http://localhost?redirect_uri=...&scope=...`, which is what the AS expects for loopback dev.
   - The `redirect_uri` host must be `127.0.0.1` (or `[::1]`); `localhost` is NOT allowed there even though it IS the only allowed `client_id` host. Yes, this is inverted from intuition; it's the spec.
   - Cookies don't cross `localhost` ↔ `127.0.0.1`. Pick one host for the whole flow. Since the redirect comes back on `127.0.0.1`, navigate to `http://127.0.0.1:3000/welcome`.
   - The PDS will show "atproto loopback client" on the consent screen instead of Certified branding. To get real branding in dev, run a tunnel (e.g. `cloudflared`, `ngrok`) and set `PUBLIC_URL=https://<tunnel>.example.com` so the production code path runs.
   - `ATPROTO_PRIVATE_KEY` is ignored in loopback dev mode — the helper hard-codes `token_endpoint_auth_method: "none"`.
4. **Wrong cookie name** — it's `certified_session`. Anything else (`session`, `sid`) is wrong.
5. **Forgetting to add a new write collection to `ALLOWED_WRITE_COLLECTIONS`** — `createRecord`/`putRecord`/`deleteRecord` will silently 403 with `Collection not allowed`.
6. **Cross-repo writes** — `body.repo` must equal session DID. If you need to write to another repo (e.g. a group's repo), use the `createGroupAgent` proxy pattern, not the XRPC proxy.
7. **OAuth callback in iframe vs. top window** — the page detects `window.parent !== window`. If you change the modal/iframe architecture, update both branches of `handleCallback`.
8. **`postMessage` without origin check** — both listeners in `auth-context.tsx` validate `event.origin === window.location.origin`. Don't drop this check.
9. **Lifting wagmi to root** — every page would pull in viem and wagmi (~hundreds of KB). Keep it scoped.
10. **Caching `getServiceAuth` tokens** — they're scoped per-LXM and short-lived. Always re-issue.
11. **Rendering user-controlled URLs as `href` without scheme validation** — `javascript:alert(1)` becomes a one-click XSS. Always allowlist schemes (`http:`, `https:`, `mailto:`, `tel:`) before assigning user-controlled values to `href`.
12. **`sitemap.ts` / `robots.ts` drift** — when you add a new public page, both must be updated. There is no automation.
13. **`100vw` in CSS** — causes horizontal scroll when a vertical scrollbar is present. Use `100%`.
14. **Treating `next.config.ts`'s `serverExternalPackages: ["@atproto/oauth-client-node"]` as optional** — it's not. Without it, the OAuth client fails to bundle correctly for serverless.
15. **`ATPROTO_PRIVATE_KEY` / JWKS coupling** — if you set `ATPROTO_PRIVATE_KEY`, the OAuth client switches to confidential auth and the published `oauth-client-metadata` includes a `jwks_uri`. Removing the var without updating the registered metadata can desync clients.

## 23. Adding a New Feature — Checklist

When adding any non-trivial feature:

1. **Decide the route.** Public or gated? Personal or group context (most pages must handle both — see how `/settings` checks `activeOrg`)?
2. **Layout & providers.** Does it need a layout? AuthGuard? Any new provider? If a new provider would only be used by one route, scope it locally (see `settings/wallet/layout.tsx`).
3. **API surface.** Will it call XRPC methods already supported by the proxy? If not, add them — and add their collection to `ALLOWED_WRITE_COLLECTIONS` if writing.
4. **Security:**
   - CSRF on POST/PUT/DELETE (`checkCsrf(req)`).
   - Sanitize user input client + server (`sanitizeEmail`, `sanitizeHandle`, `stripInvisible`).
   - Sanitize 5xx errors before returning.
   - Allowlist URL schemes (`http:`, `https:`, `mailto:`, `tel:`) before rendering any user-controlled URL as `href`.
   - `safeRedirect()` for any redirect target returned from the server.
5. **A11y:**
   - Form inputs: use `Input` / `Textarea` (they wire up `aria-describedby`/`aria-invalid` for you).
   - Modals: `useFocusTrap`.
   - Dropdowns: `aria-haspopup` + `aria-expanded`.
   - Skip-nav already present.
6. **CSS:** prefer adding BEM classes to `globals.css` for layout, Tailwind utilities for fine-grained tweaks. Reuse CSS variables.
7. **SEO (public pages only):**
   - `metadata.title`, `description`, `alternates.canonical`, OG `url`+`images`.
   - Add to `src/app/sitemap.ts`.
   - Update `src/app/robots.ts` allow-list.
   - Consider JSON-LD if it semantically fits (Article, BreadcrumbList, etc.).
   - Authenticated pages: set `robots: { index: false, follow: false }`.
8. **Observability:** if the feature can fail, log with `console.error("[Feature] …", err)` so it shows up in Vercel logs.
9. **Quality gate:** `npm run build` must pass. Manual smoke-test in the browser (sign in, exercise the feature, sign out — re-test in incognito for a clean session).
10. **Update this file** if the feature changes architecture, conventions, or security posture.

## 24. Adding a New API Route — Checklist

Use this for any new `src/app/api/**` route handler:

1. **Method-appropriate handler.** GET for reads, POST/PUT/DELETE for writes.
2. **CSRF check first** for mutating methods:
   ```ts
   const csrfError = checkCsrf(request); if (csrfError) return csrfError;
   ```
3. **Auth check second:**
   ```ts
   const did = await getSessionDid();
   if (!did) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
   ```
   For routes that need the atproto agent, prefer `getAuthenticatedAgent()` from `src/lib/groups/proxy-agent.ts` — it handles `client.restore` failures by deleting the session and returning `null`.
4. **Validate body shape** — typeof checks, allowlists for enums (see `role/route.ts` validating role ∈ `{member, admin, owner}`).
5. **Sanitize input** at the boundary even if the client also sanitized.
6. **Respect allowlists** — collection allowlist for XRPC, scheme allowlist for URLs, MIME-type allowlist for blobs.
7. **Try/catch the body** — handle malformed JSON explicitly:
   ```ts
   try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
   ```
8. **Sanitize errors:**
   - 4xx errors can echo upstream messages (they're usually validation-shaped).
   - 5xx errors must return a generic message — never echo upstream `err.message`.
9. **Log on the server side** with a route-tagged prefix: `console.error("[Route] …", err)`.
10. **Return shape consistency** — successful operations return `{ success: true }` for void operations, the upstream `data` object for queries, or domain-shaped JSON. Errors always return `{ error: string }`.
11. **Update `AGENTS.md` / this draft** if the route adds an endpoint to the public surface.

## 25. Conventions: Errors, Loading, A11y

### Error handling

- **Server side** — return `NextResponse.json({ error: "..." }, { status })`. Use `extractError(res, fallback)` from `src/lib/utils/api.ts` to pull error messages out of nested upstream responses on the client.
- **Client side** — store error in local component state, render via `<ErrorMessage>` component (`src/components/ui/error-message.tsx`). Don't `alert()`.
- **Auth errors** — surfaced through `AuthProvider.error` and the sign-in modal. Don't write a parallel auth-error system.
- **AbortController** — every long-running fetch in a hook should accept an `AbortSignal` and check `signal.aborted` before setting state. See `useProfile`, `useOrgProfile`, `OrgProvider` for the canonical pattern.
- **Catch and ignore** is fine for best-effort operations (avatar fetch, profile seeding). Catch and re-throw with a useful message for things the user must know about (sign-in failure, save failure).

### Loading states

- **Initial auth load** — `AuthProvider` exposes `isLoading`. Pages gated by `AuthGuard` show a centered spinner while it's true.
- **Per-card loading** — use the `LoadingSpinner` component (`src/components/ui/loading-spinner.tsx`).
- **Don't gate the navbar on `isLoading`** — render placeholders / skeletons so the layout is stable.
- **Optimistic state on sign-out** — `signOut` clears local state immediately, then fires the server cleanup in the background (best-effort).

### Accessibility

- `<a class="skip-nav">` and `<main id="main-content">` are wired up in the root layout.
- Form inputs use `Input` / `Textarea` which wire up `aria-describedby` + `aria-invalid` + label associations via `useId`.
- Modals trap focus with `useFocusTrap` and restore focus to the previously focused element on close.
- Dropdowns have `aria-haspopup` + `aria-expanded`.
- Buttons that purely contain icons need `aria-label` (or `title`) — see the small action buttons in `groups/page.tsx` (`title="Leave group"`, `title="Accept membership publicly"`).
- Decorative images have `alt=""` + `aria-hidden="true"` — see `home-client.tsx` for the loading screen logo.
- Color is never the sole signal — error states pair red with text, success pairs green with an icon.

## 26. Deep flow — process for substantial features

**Reference**: when the operator says "do this with the deep flow"
(or "deep-flow this issue", "use the deep flow"), apply the
process below. It is the default for any change beyond a
one-line fix, typo, dep bump, copy/string edit, or doc tweak.
For those mechanical changes, skip this and commit directly to
`staging`.

The operator sets a high bar on **security, code quality, and
performance**. The number of reviewers, the kinds of lenses,
and the number of rounds are **your judgement** — calibrated to
that bar, not to a formula. Diminishing returns set in fast;
stop when the next pass would be nit-picking.

### Branching (project-specific override)

Work happens **directly on `staging`**, not on per-feature
branches. When `staging` is in good shape, open a Draft PR
from `staging` into `main`. The operator merges; agents never
merge.

This overrides the global "feature-branch into staging"
default in `~/.claude/CLAUDE.md`. This repo's review cadence
is dense enough that `staging` is the natural integration
point.

### Order of operations

1. **Evaluate the request.** Does it actually make sense? Is
   the proposed shape the right one? Read the issue, the
   surrounding code, and the larger goal it serves.
   **Explicitly consider alternative implementations** — do
   not run with the first proposal in the issue. Enumerate
   the plausible approaches, then pick the one that best
   serves the larger goal, not the one quickest to ship.
   Record the alternatives and the rationale in the plan. If
   the request doesn't make sense, push back instead of
   building it.

2. **Plan.** Write `docs/<feature-or-issue>/plan.md` capturing:
   - the larger goal this serves
   - scope and file ownership
   - **alternatives considered, with rationale for the chosen
     path**
   - acceptance criteria
   - explicit out-of-scope items
   - rollback plan
   - any open questions for the operator

3. **Plan review.** Spawn multiple reviewer agents in
   parallel with different lenses (e.g. security, performance,
   GraphQL schema correctness, ATProto semantics, ops impact,
   API-consumer ergonomics, test coverage). Pick the count
   and mix yourself based on surface area and risk. Record
   decisions in `docs/<feature>/review-round-N.md` —
   accepted / rejected with a one-line rationale for each
   item. Update the plan in place. Run further rounds only if
   the previous round surfaced substantive items.

4. **Implement.** Commit directly to `staging`. Atomic commits
   with a clear scope tag. Match the existing commit-message
   convention (`Co-Authored-By:` trailer per Safety Rule 6).

5. **Local verification.** Run all four quality gates plus
   anything that exercises the new surface:
   ```bash
   go build ./...
   go vet ./...
   go test -race ./...
   golangci-lint run ./...
   ```
   Capture the pre-existing lint/test baseline so "no new
   errors" is a meaningful claim.

6. **Implementation review.** Same shape as plan review —
   parallel reviewers, different lenses, your call on count
   and mix. Apply accepted feedback in a follow-up commit. A
   follow-up round only if round 1 surfaced enough
   substantive items to justify one.

7. **Draft PR `staging → main`.** Body must link to the plan
   and review-decision docs, list breaking changes, state
   out-of-scope items, and include a test plan checklist.

8. **Make CI green.** Fix root causes. Never `--no-verify`.
   Never skip hooks. Loop until all checks pass.

9. **Stop.** The operator merges. Notify with the PR URL and
   a short summary of what shipped.

### Hard rules

- **Never merge.** Stopping at "PR Draft, CI green" is the
  contract.
- **Never `--force` push to `main`.** Avoid history rewrites
  on `staging` once you've pushed; it's the shared working
  branch.
- **Decisions belong in writing.** If a reviewer raises an
  item and you reject it, record the rationale in
  `review-round-N.md`. Future-you will not remember why.
- **No emojis** in code, commits, or PR bodies unless the
  operator asks. Keep the standard
  `Co-Authored-By:` trailer; nothing else.

### Verification commands for this repo

The Go commands above are illustrative (the doc travels
across repos). For certified-app the equivalent gate is:

```bash
npx tsc --noEmit
npx eslint src/ --ext .ts,.tsx
npx next build
```

Plus a smoke test of the changed surface in `next dev` when
the change is user-facing.
