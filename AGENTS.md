# Agent Instructions

This project uses **hb** (heartbeads) for issue tracking. Run `hb sync && hb ready` to find available work.

## Quick Reference

```bash
hb sync                # Sync with git
hb ready               # Find available work
hb show <id>           # View issue details
hb update <id> --status in_progress  # Claim work
hb close <id> --reason "<hash> <msg>"  # Complete work
hb list --all          # List all issues including closed
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - `npx tsc --noEmit && npx next build`
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   hb sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

---

## Project Overview

**Certified** is a web app for decentralized identity management built on the AT Protocol (atproto). Users get DIDs, handles, can link Ethereum wallets, manage connected apps, and control their data. The app connects to an ePDS (extended Personal Data Server) that handles OAuth + OTP email authentication.

**Production URL:** https://certified-app-hypercerts-foundation.vercel.app
**Repo:** https://github.com/hypercerts-org/certified-app

## Tech Stack

- **Framework:** Next.js 16.1.6 (App Router, Turbopack)
- **React:** 19.x
- **CSS:** Tailwind 3.4 + extensive custom CSS in `globals.css` (~2400 lines). New components use BEM-like classes with component prefixes (sidebar__, dash-card__, wallet-card__, etc.) in globals.css. Don't use Tailwind for layout in new components.
- **Auth:** AT Protocol OAuth 2.0 + OTP email codes via `@atproto/oauth-client-node` (server-side). No passwords for login — password management uses `requestPasswordReset` + `resetPassword` XRPC flow.
- **Wallet:** wagmi 2.x + viem 2.x for EIP-712 typed data signing (scoped to wallet page only via `settings/wallet/layout.tsx`)
- **State:** React Query (`@tanstack/react-query`) for server state, React context for auth
- **Deployment:** Vercel — production via `vercel deploy --prod`, staging via preview deploy + alias (see "Git & Deployment" below)
- **Issue Tracking:** heartbeads (`hb` CLI), stored in `.beads/` directory

## Design System & Conventions

### Visual
- **Font:** Inter everywhere. No JetBrains Mono. No uppercase text anywhere.
- **Border radius:** `var(--radius)` (4px) everywhere. Only `50%` for circles (dots, avatars).
- **Colors:** Sidebar bg `#0F2544` (navy), main content bg `#F7F8FA` (off-white), cards white with `var(--border-subtle)` border
- **Border variables:** `--border-subtle`, `--border-light`, `--border-default`, `--border-hover` (all derived from `rgba(15,37,68,...)`)
- **No search bar or bell icon** in the dashboard topbar — only the page title

### CSS
- All custom CSS lives in `src/app/globals.css` — component-prefixed BEM classes
- CSS variables defined in `:root` for colors, borders, radius, fonts
- `body` uses `var(--font-inter)` (set by `next/font` in layout.tsx)
- No duplicate `@import` for Google Fonts — font loaded via `next/font`
- Dead selectors and variables have been cleaned out; keep it tidy

### Components
- Use `next/image` (not `<img>`) for all images
- Use `next/link` (not `<a>`) for internal navigation
- Semantic HTML: `dl/dt/dd` for key-value pairs, `h2` for card titles (not h3), ARIA roles on errors (`role="alert"`) and loading states (`role="status"`)
- `aria-hidden="true"` on decorative elements (dots, icons)
- Focus-visible styles are globally defined for `a`, `button`, `[role="button"]`, `[tabindex]`

### Data
- `CONNECTED_APPS` and `EXPLORE_APPS` arrays live in `src/lib/constants/apps.ts` — single source of truth
- `getInitials()` utility lives in `src/lib/utils/initials.ts`
- API response types (`SessionResponse`, `ListRecordsResponse`, `PutRecordResponse`) in `src/lib/types/api.ts`

## Architecture

### Authentication Flow
1. User clicks "Sign in" → `POST /api/auth/login` with email → redirects to ePDS OAuth
2. ePDS sends OTP email → user enters code → redirects back to `/oauth/callback`
3. Callback hits `GET /api/auth/callback-handler` → stores OAuth tokens server-side, sets session cookie
4. Client calls `GET /api/auth/session` to check auth state
5. All API calls go through `authFetch()` → `POST/GET /api/xrpc/[...method]` proxy → server adds OAuth tokens → forwards to ePDS

### Key Auth Details
- `authFetch` is a thin wrapper around fetch that calls `/api/xrpc/...` proxy routes
- Server-side proxy reads session cookies and uses stored OAuth tokens
- Session cookie uses HMAC signature with timing-safe comparison
- CSRF Origin check on all POST routes
- 401 responses trigger client-side re-authentication
- `clearSessionCache()` is called on sign-out to prevent stale data

### Layout System
- `layout.tsx` (server component) → `Providers` → `AuthProvider` → `NavbarProvider` → `AppShell` → children
- `AppShell` (client component) conditionally renders sidebar for authenticated users on `/settings/*`
- Navbar hidden for authenticated users (sidebar replaces it), shown for unauthenticated (landing page)
- Footer hidden for authenticated users
- `settings/layout.tsx` wraps all settings pages in `AuthGuard` (centralized, not per-page)
- `AuthGuard` redirects to `/?returnTo=<path>` when unauthenticated

### Sidebar Navigation (5 items, in order)
1. Profile (`/settings/edit-profile`)
2. Connected Apps (`/settings/connected-apps`)
3. Wallet (`/settings/wallet`)
4. My Data (`/settings/my-data`)
5. Security (`/settings/security`)

### Mobile
- Hamburger menu triggers sidebar overlay with body scroll lock
- Escape key closes sidebar, focus returns to hamburger button
- All interactive elements have 44px minimum touch targets
- Sidebar auto-closes on navigation

### Wallet / Identity Link
- EIP-712 typed data signing for wallet attestations
- Random nonce per attestation (prevents replay)
- Client-side signature verification using viem's `verifyTypedData` (EOA only)
- ERC-1271/ERC-6492 (smart contract wallets) returns `verified: false` with explanation
- Runtime type guard (`isAttestation`) validates PDS records
- `asHex()` helper validates hex strings (no unsafe `as` casts)
- WagmiProvider scoped to `/settings/wallet` only (not app-wide) — saves ~140KB on other pages
- Supports Ethereum, Base, Optimism, Arbitrum chains

### API Proxy Security
- Collection allowlist for writes: only `org.impactindexer.link.attestation` and `org.hypercerts.profile`
- Blob uploads: 1MB max, allowed types: jpeg, png, webp, gif, svg+xml
- 5xx errors sanitized to "Internal server error" (no upstream leak)
- Repo DID validation on write operations

### Connected Apps
- "Connected" section: Ma Earth, GainForest, Silvi, Hyperboards (with real logos from `/public/assets/partners/`)
- "Explore more apps" section: Bluesky, Leaflet (with "Available" status)
- Data defined in `src/lib/constants/apps.ts`

### Session Management
- `useSession()` hook with module-level cache — only ONE `getSession` fetch per page load regardless of how many components use it
- Cache cleared on sign-out via `clearSessionCache()`
- Used by sidebar, home-client, and security page

### Performance
- Landing sections and dashboard components loaded via `next/dynamic` (code-split)
- No duplicate Google Fonts `@import` — font loaded via `next/font/google`
- WagmiProvider scoped to wallet page only
- `useProfile` and `useIdentityLinks` hooks use AbortControllers for cleanup
- `isLoading` initializes to `true` (not `false`) to prevent flash of empty content

## File Map

```
src/
├── app/
│   ├── globals.css                    # ALL custom CSS (~2400 lines)
│   ├── layout.tsx                     # Root layout (server component)
│   ├── page.tsx                       # Home page entry + metadata
│   ├── error.tsx                      # Global error boundary
│   ├── not-found.tsx                  # 404 page
│   ├── settings/
│   │   ├── layout.tsx                 # Centralized AuthGuard for all settings
│   │   ├── edit-profile/page.tsx
│   │   ├── connected-apps/page.tsx
│   │   ├── wallet/
│   │   │   ├── layout.tsx             # WagmiProvider scoped here
│   │   │   └── page.tsx
│   │   ├── my-data/page.tsx
│   │   └── security/page.tsx
│   ├── api/
│   │   ├── auth/                      # login, logout, session, callback-handler
│   │   └── xrpc/[...method]/route.ts  # XRPC proxy with security
│   ├── oauth/callback/                # OAuth redirect handler
│   ├── privacy/                       # Privacy policy page
│   ├── terms/                         # Terms of service page
│   └── .well-known/                   # OAuth client metadata, JWKS
│
├── components/
│   ├── landing/
│   │   ├── home-client.tsx            # Landing (unauth) + Dashboard (auth)
│   │   ├── orbiting-logos.tsx          # Animated logo orbit
│   │   └── sections/                  # 6 landing sections (code-split)
│   │       ├── what-you-get.tsx
│   │       ├── how-it-works.tsx
│   │       ├── partner-apps.tsx
│   │       ├── built-for-trust.tsx
│   │       ├── faq.tsx
│   │       └── ready-cta.tsx
│   ├── layout/
│   │   ├── app-shell.tsx              # Conditional sidebar wrapper + mobile header
│   │   ├── sidebar.tsx                # Left nav (5 items + user card + signout)
│   │   ├── navbar.tsx                 # Top nav (landing only)
│   │   ├── auth-guard.tsx             # Auth redirect with returnTo
│   │   └── footer.tsx                 # Hidden for auth users
│   ├── dashboard/
│   │   ├── sign-in-preview-card.tsx
│   │   ├── identity-overview-card.tsx
│   │   ├── recent-activity-card.tsx
│   │   └── connected-apps-list.tsx    # Compact list (dashboard sidebar)
│   ├── identity-link/
│   │   ├── identity-link-card.tsx     # Wallet list with verify/delete
│   │   └── link-wallet-flow.tsx       # Multi-step connect + sign
│   ├── account/
│   │   ├── password-section.tsx       # Set/change password
│   │   └── account-settings.tsx       # Legacy (Tailwind-heavy)
│   ├── profile/
│   │   └── profile-edit-form.tsx
│   └── ui/                            # Shared UI primitives
│       ├── button.tsx, input.tsx, textarea.tsx
│       ├── avatar.tsx
│       └── loading-spinner.tsx
│
├── hooks/
│   ├── use-session.ts                 # Cached session data (handle, email)
│   ├── use-profile.ts                 # Profile data with AbortController
│   ├── use-identity-links.ts          # Wallet attestations with verification
│   └── use-attestation-signing.ts     # EIP-712 signing flow
│
└── lib/
    ├── auth/
    │   ├── auth-context.tsx           # React auth provider
    │   ├── oauth-client.ts            # NodeOAuthClient singleton
    │   ├── session.ts                 # Cookie session helpers
    │   ├── stores.ts                  # In-memory state/session stores
    │   ├── csrf.ts                    # CSRF Origin check
    │   ├── fetch.ts                   # authFetch utility
    │   └── types.ts                   # Auth types
    ├── identity-link/
    │   ├── attestation.ts             # EIP-712 domain, types, message builder
    │   ├── pds.ts                     # PDS read/write with type guards
    │   └── types.ts                   # Attestation types + asHex helper
    ├── atproto/
    │   └── profile.ts                 # Profile fetch/update
    ├── constants/
    │   └── apps.ts                    # CONNECTED_APPS + EXPLORE_APPS
    ├── types/
    │   └── api.ts                     # API response types
    ├── utils/
    │   └── initials.ts                # getInitials() utility
    ├── providers.tsx                   # Minimal root provider (no wagmi)
    ├── navbar-context.tsx             # Navbar visibility context
    └── wagmi.ts                       # Wagmi config (injected, Coinbase, WC)

public/assets/
├── partners/                          # Real partner logos
│   ├── maearth_logo.jpeg
│   ├── gainforest_logo.jpeg
│   ├── silvi_logo.jpeg
│   ├── bluesky_logo.svg
│   ├── leaflet_logo.svg
│   ├── fundingthecommons_logo.jpeg
│   └── protocollabs_logo.png
├── hyperboards_brandmark.webp
├── certified_brandmark.svg/png
├── certified_wordmark_white.svg
├── certified_wordmark_darkblue.svg
├── certified_sign_in_button_darkblue.svg
└── otp-email-template.html
```

## Environment Variables

Required in `.env.local` (and Vercel Production + Preview):
```
COOKIE_SECRET=<32+ char secret for HMAC session cookies>
NEXT_PUBLIC_PDS_URL=<ePDS URL, e.g. https://epds1.test.certified.app>
PUBLIC_URL=<app URL, e.g. https://certified-app-hypercerts-foundation.vercel.app>
UPSTASH_REDIS_REST_URL=<Upstash Redis URL for OAuth state>
UPSTASH_REDIS_REST_TOKEN=<Upstash Redis token>
```

## Git & Deployment

- **Branches:** `main` (production), `staging` (preview/testing)
- **Build check:** `npx tsc --noEmit && npx next build` (must pass before deploy)
- **Config:** `next.config.ts` has `serverExternalPackages: ["@atproto/oauth-client-node"]`

### Deploying to production (`certified.app`)

```bash
git checkout main
vercel deploy --prod   # Uses Production env vars (PUBLIC_URL=https://certified.app)
# Auto-aliased to certified.app
```

### Deploying to staging (`staging.certified.app`)

```bash
git checkout staging
vercel deploy          # Preview deploy — uses Preview (staging) env vars
vercel alias set <deployment-url> staging.certified.app --scope hypercerts-foundation
```

**⚠️ CRITICAL:** Do NOT use `vercel deploy --prod` for staging. The `--prod` flag uses Production env vars where `PUBLIC_URL=https://certified.app`. This breaks OAuth login because:
- The OAuth `client_id` and `redirect_uris` are derived from `PUBLIC_URL` (see `src/lib/auth/oauth-client.ts`)
- The CSRF origin check compares `Origin` header against `PUBLIC_URL` (see `src/lib/auth/csrf.ts`)
- If `PUBLIC_URL` doesn't match the actual domain, OAuth redirects go to the wrong place and CSRF rejects all POST requests

Vercel env var setup for this to work:
- **Production:** `PUBLIC_URL=https://certified.app`
- **Preview (staging branch):** `PUBLIC_URL=https://staging.certified.app`
- Preview deploys from the `staging` branch pick up the branch-scoped override automatically.

## Completed Work (All Epics Closed)

All heartbeads issues are closed. Zero open issues remain.

### 1. OAuth Migration (epic `5g6`) — Server-side OAuth
Migrated from browser-based `@atproto/oauth-client-browser` to server-side `@atproto/oauth-client-node`. Created API proxy routes, session cookies, CSRF protection.

### 2. OAuth Hardening (epic `zny`) — Production security
HMAC timing-safe comparison, CSRF Origin checks, repo DID validation, 401 interceptor, session rotation, dependency cleanup.

### 3. Identity Link / Wallet (epic `eex`) — EIP-712 wallet linking
Full wallet attestation system: EIP-712 signing, PDS storage, client-side verification, multi-chain support.

### 4. Password Management (epic `700`) — Set/change password
PasswordSection component using `requestPasswordReset` + `resetPassword` XRPC flow.

### 5. ePDS Branding (epic `kqx`) — Branded login screen
OAuth client metadata colors, branded OTP email template.

### 6. Landing Page v1 (epic `5v7`) — Initial landing redesign
Hero, CTA buttons, content sections.

### 7. Landing Page v2 (epic `ysx`) — Final landing with 6 sections
What You Get, How It Works, Partner Apps, Built for Trust, FAQ, Ready CTA. Animated mesh gradient hero. Deleted `/why-certified`.

### 8. Authenticated App Redesign (epic `oxt`, 13 tasks) — Sidebar layout
Left sidebar nav, right sidebar cards, connected apps, edit profile, security, my data, wallet pages. Mobile hamburger sidebar. Responsive CSS.

### 9. Post-Design Fixes — Polish
Footer hidden for auth users, loading states, wallet page, connected apps split, security nav position.

### 10. Code Review Fixes (epic `dqp`, 14 tasks + 1 integration bug) — Comprehensive audit
10-reviewer audit covering security, CSS, mobile, components, a11y, data flow, TypeScript, routing, performance. All fixes implemented:
- **Security:** Random nonces, ERC-1271 bypass fix, collection allowlist, blob limits, sanitized errors
- **A11y:** Color contrast (WCAG AA), focus-visible, ARIA roles, semantic HTML, FAQ aria-labelledby
- **Performance:** Removed duplicate font import, scoped WagmiProvider, code-split with next/dynamic
- **Architecture:** Shared constants, useSession hook, centralized AuthGuard, API response types, asHex helper
- **Mobile:** 44px touch targets, body scroll lock, Escape key, focus management, content overflow
- **Routing:** settings/layout.tsx, error.tsx, not-found.tsx, returnTo URL, sidebar active state
- **Integration bug:** useSession cache cleared on sign-out

## Known Limitations / Future Work

- **2FA/TOTP:** Not implemented on the ePDS — security page shows "coming soon" placeholder
- **ERC-1271 verification:** Smart contract wallet signatures return `verified: false` (on-chain verification not yet supported)
- **My Data:** Fetches `org.hypercerts.claim.activity` records — collection may not exist for most users, so empty state is shown
- **`account-settings.tsx`:** Legacy component, heavily Tailwind — not yet migrated to BEM CSS
- **No test suite:** No unit or integration tests exist. Quality gates are `tsc --noEmit` + `next build`.
- **`certified_brandmark 2.png`:** Duplicate untracked file in `public/assets/` — can be deleted
