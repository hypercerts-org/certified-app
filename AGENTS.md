# Agent Instructions

See `README.md` for project overview, architecture, and setup.

## Quick Reference

```bash
npm run dev              # Start dev server
npm run build            # Production build (quality gate)
npx tsc --noEmit         # Type check only
npm run lint             # ESLint
```

## Coding Conventions

### CSS
- All custom CSS lives in `src/app/globals.css` — BEM-like classes with component prefixes
- CSS variables defined in `:root` for colors, borders, radius, transitions
- Warning colors use `--color-warning-bg`, `--color-warning-border`, `--color-warning-text`
- Transitions use `--transition-fast`, `--transition-base`, `--transition-slow`
- New components: use BEM classes in globals.css, not Tailwind for layout
- No `100vw` (causes horizontal overflow with scrollbar) — use `100%` instead

### Components
- Use `next/link` for internal navigation, raw `<img>` for SVG buttons (not `next/image`)
- `aria-describedby` + `aria-invalid` on form inputs — see `input.tsx` and `textarea.tsx` for pattern
- `aria-haspopup` + `aria-expanded` on dropdown triggers — see `navbar.tsx`
- Focus trapping in modals — use `useFocusTrap` hook from `src/hooks/use-focus-trap.ts`
- Skip nav link exists in `layout.tsx` — `<main id="main-content">`

### Auth
- OAuth via `@atproto/oauth-client-node` (server-side only)
- Session cookie: `certified_session` (httpOnly, HMAC-signed)
- All API calls go through `authFetch()` → `/api/xrpc/[...method]` proxy
- CSRF Origin check on all POST routes (`src/lib/auth/csrf.ts`)
- Sanitize input: strip invisible Unicode chars client-side AND server-side (defense in depth)
- Sanitize error messages: never return raw `err.message` from auth routes to clients

### Routing
- Middleware (`src/middleware.ts`) redirects `/` → `/welcome` when no session cookie
- `/welcome` — landing page (server-rendered, transparent navbar)
- `/` — profile dashboard (authenticated only)
- `HomeClient` redirects to `/welcome` via useEffect if auth check fails (expired session)
- `AuthGuard` in `settings/layout.tsx` protects settings routes

### Layout System
- Root `layout.tsx` → Providers → AuthProvider → OrgProvider → NavbarProvider → Navbar + AppShell + Footer + FeedbackModal
- `/welcome` has its own `layout.tsx` that sets navbar variant to `"transparent"`
- `AppShell` wraps children in `.app-shell` div (skipped on `/welcome`)
- `Footer` renders on all pages (single footer, no duplicates)
- Feedback button avoids footer overlap via scroll listener on `.landing-footer`

### SEO / GEO
- JSON-LD: Organization + WebSite in `layout.tsx`, SoftwareApplication + FAQPage in `welcome/page.tsx`
- OG/Twitter meta: defaults in `layout.tsx`, overrides per page
- Title template: `"%s — Certified"` (layout), pages export specific titles
- `robots.ts`, `sitemap.ts`, `manifest.ts` in `src/app/`
- `public/llms.txt` for AI crawlers
- All public pages need `canonical` URL in `alternates`

## Security Rules

- Redis operations must be wrapped in try/catch (see `session.ts`)
- CSRF URL parsing is wrapped in try/catch (see `csrf.ts`)
- Invalidate existing session before creating new one in callback handler
- Collection allowlist for writes in XRPC proxy
- Blob uploads: 1MB max, allowed types: jpeg, png, webp, gif, svg+xml
- 5xx errors sanitized — never leak upstream error details

## Git & Deployment

- **Branches:** `main` (production), `staging` (preview/testing)
- **Quality gate:** `npm run build` must pass before pushing
- **Production:** `certified.app` — deploys from `main` via Vercel
- **Staging:** `staging.certified.app` — deploys from `staging` via Vercel
- **PR workflow:** push to `staging`, create PR to `main`
- **`PUBLIC_URL`** must match the deployed domain — OAuth client_id, redirect_uris, and CSRF check all derive from it

## File Map

```
src/
├── middleware.ts                       # Redirect / → /welcome when no session
├── app/
│   ├── layout.tsx                      # Root layout, providers, JSON-LD, skip nav
│   ├── page.tsx                        # Profile dashboard (auth only)
│   ├── globals.css                     # All custom CSS
│   ├── icon.png                        # Favicon
│   ├── manifest.ts                     # PWA manifest
│   ├── robots.ts                       # Robots.txt
│   ├── sitemap.ts                      # Sitemap
│   ├── error.tsx                       # Global error boundary
│   ├── not-found.tsx                   # 404 page
│   ├── welcome/                        # Landing page
│   │   ├── layout.tsx                  # Transparent navbar variant
│   │   └── page.tsx                    # Landing content + JSON-LD
│   ├── about/page.tsx                  # About page
│   ├── terms/page.tsx                  # Terms of Service
│   ├── privacy/page.tsx                # Privacy Policy
│   ├── dsa/page.tsx                    # DSA compliance
│   ├── settings/
│   │   ├── layout.tsx                  # AuthGuard for all settings
│   │   ├── page.tsx                    # Settings index
│   │   ├── edit-profile/page.tsx
│   │   ├── my-data/page.tsx
│   │   └── wallet/
│   │       ├── layout.tsx              # WagmiProvider (scoped here only)
│   │       └── page.tsx
│   ├── connected-apps/
│   │   ├── layout.tsx                  # AuthGuard
│   │   └── page.tsx
│   ├── groups/                         # Group management routes
│   ├── oauth/callback/page.tsx         # OAuth redirect handler
│   ├── api/
│   │   ├── auth/                       # login, logout, session, callback-handler
│   │   ├── xrpc/[...method]/route.ts   # XRPC proxy with security
│   │   ├── groups/                     # Group API routes
│   │   ├── feedback/route.ts           # Feedback email via Resend
│   │   ├── resolve-handle/route.ts
│   │   ├── resolve-did/route.ts
│   │   └── search-actors/route.ts
│   └── .well-known/                    # OAuth client metadata, JWKS
│
├── components/
│   ├── landing/
│   │   ├── landing-page.tsx            # Server-rendered landing sections
│   │   ├── home-client.tsx             # Profile dashboard (client component)
│   │   ├── hero-signin-button.tsx      # Client island for hero CTA
│   │   ├── orbiting-logos.tsx           # Animated logo orbit (IntersectionObserver)
│   │   └── sections/                   # Landing sections (server + client islands)
│   ├── layout/
│   │   ├── app-shell.tsx               # App wrapper (skipped on /welcome)
│   │   ├── navbar.tsx                  # Top nav with account switcher
│   │   ├── footer.tsx                  # Global footer (all pages)
│   │   ├── sidebar.tsx                 # Left nav for settings
│   │   └── auth-guard.tsx              # Auth redirect with returnTo
│   ├── dashboard/                      # Dashboard cards and lists
│   ├── groups/                         # Group management components
│   ├── profile/                        # Profile editing
│   ├── identity-link/                  # Wallet attestation
│   ├── account/                        # Email and password sections
│   └── ui/                             # Shared primitives (button, input, modal, etc.)
│
├── hooks/
│   ├── use-session.ts                  # Cached session data (handle, email)
│   ├── use-profile.ts                  # Profile data with AbortController
│   ├── use-org-profile.ts              # Organization profile
│   ├── use-identity-links.ts           # Wallet attestations
│   ├── use-attestation-signing.ts      # EIP-712 signing
│   └── use-focus-trap.ts              # Modal focus trapping
│
└── lib/
    ├── auth/                           # OAuth client, session, CSRF, fetch wrapper
    ├── groups/                         # Group API, context, constants, types
    ├── identity-link/                  # EIP-712 attestation, PDS read/write
    ├── atproto/                        # DID resolution, profile fetch/update
    ├── constants/apps.ts               # CONNECTED_APPS (single source of truth)
    ├── types/api.ts                    # API response types
    ├── utils/initials.ts               # getInitials() utility
    ├── navbar-context.tsx              # Navbar variant state
    ├── providers.tsx                   # Root provider (no wagmi)
    └── wagmi.ts                        # Wagmi config (wallet page only)

public/
├── llms.txt                            # AI crawler description
└── assets/
    ├── partners/                       # Partner app logos
    ├── certified_brandmark*.svg/png    # Brand assets
    ├── certified_wordmark*.svg/png     # Wordmarks
    ├── certified-hero-1200x630.png     # OG image
    ├── sign_in_with_certified*.svg/png # Sign-in button assets
    ├── guilloche_02.svg                # Decorative background (SVGO optimized)
    └── otp-email-template.html         # Branded OTP email
```

## Known Limitations

- **No test suite** — quality gates are `tsc --noEmit` + `next build`
- **2FA/TOTP** — not implemented on the ePDS, settings page shows placeholder
- **ERC-1271** — smart contract wallet signatures return `verified: false` (no on-chain verification)
- **TypeScript** — widespread `as` casts on API request/response bodies (improvement tracked separately)
