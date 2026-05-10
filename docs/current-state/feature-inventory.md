# Certified — Current State Feature Inventory

**Purpose.** A planning-grade snapshot of every feature shipped today, grouped by user-facing surface, with a status column that's honest about beta / placeholder / gap items. Use this as the input for "what's next" — the gaps and placeholder rows are deliberate planning seeds.

**Scope of this snapshot.** Branch: `staging` at HEAD `6fc27d2`. Source-level walk done end-to-end (`src/app/**`, `src/components/**`, `src/hooks/**`, `src/lib/**`). Public routes were browser-verified; gated routes were *not* browser-verified in this session — the OAuth `prompt=login` policy required a fresh OTP per attempt and we exhausted that path. Anything described below comes from reading the page component plus the underlying API/hook, not from a live render — flagged where it matters.

**For deeper reading,** see `AGENTS.md` (the canonical architecture reference), `PRODUCT.md` (brand and design register), `DESIGN.md` (semantic tokens and component canon), and `README.md` (env vars).

---

## 0. TL;DR — what this app is today

Certified is a passwordless atproto identity client + thin BFF, operated by the Hypercerts Foundation. The user creates an identity hosted on `certified.one` (the Hypercerts ePDS), or signs in with any external atproto handle. The app itself is an OAuth client and a proxy to the user's PDS — it does not own user data and never holds tokens in the browser.

Three first-class user objects:

1. **Personal identity** — a DID with handle, email, profile (display name / about / website / avatar / banner), and an extensible PDS record set.
2. **Groups** — separate atproto identities operated through a custom group service (`app.certified.group.*` lexicons), with membership roles (owner/admin/member) and an audit log. Users can create up to **5 groups**.
3. **Linked wallets** — EVM addresses linked to the DID via EIP-712 signed attestations stored in the user's PDS at `org.impactindexer.link.attestation`.

The surface mixes a brand register (`/welcome`, `/about`) and a product register (everything gated). Sign-in is OTP-only; there are placeholders for app passwords and 2FA.

---

## 1. Status legend

| Status | Meaning |
|---|---|
| **Shipped** | Functionality is implemented end-to-end and exercised by current UI. |
| **Beta** | Functionality works but has a visible "beta" caveat or depends on staging infra. |
| **Placeholder** | UI is present, copy explicitly says "available soon" — no backing implementation. |
| **Gap** | Behavior is partial or known-incomplete; documented as a limitation. |

---

## 2. Identity & sign-in

The OAuth flow is the most security-sensitive surface in the app. Section 8 of `AGENTS.md` is canonical.

| Feature | Where | Status | Notes |
|---|---|---|---|
| Hero "Sign in with Certified" button (default flow) | `src/components/landing/hero-signin-button.tsx` → `useAuth().openSignIn()` → `submitDefault()` in `auth-context.tsx` | Shipped | One-click default flow: posts `{mode: "default"}` to `/api/auth/login`, server returns the PDS authorization URL, browser navigates. PDS handles email + OTP. |
| Sign-in modal — email mode | `SignInModal` component (`src/components/ui/sign-in-modal.tsx`), wired to `useAuth().submitEmail` | Shipped | Email submitted to `/api/auth/login` with `mode: "email"` + `login_hint`. Sanitised via `sanitizeEmail`. |
| Sign-in modal — atproto handle mode | Same modal, view toggle, `useAuth().submitHandle` | Shipped | Hits `/api/auth/login` with `mode: "handle"`. Falls back to `https://` + input on resolution failure. Allows external PDS handles (Bluesky etc.). |
| Hero secondary "Use AT Protocol or Bluesky account" | `hero-signin-button.tsx` → `openSignInModal("atproto")` | Shipped | Manual fallback that opens the modal in atproto-handle view. |
| OTP entry on PDS | Rendered by `auth.certified.one` | Shipped | 6-box auto-submit form. Verified in browser this session — screenshot `02-otp-prompt.png`. |
| Authorization / consent on `certified.one` | Rendered by the PDS | Shipped | Standard OAuth consent showing requested scopes (`Email`, `Identity`, `Bluesky`, `Repository`, `Authenticate`). Verified in browser — screenshot `10-post-auth.png`. |
| `switch-provider` postMessage handoff | `auth-context.tsx:113-150` | Shipped | If the PDS modal posts `{type: "switch-provider", input}`, the app re-runs the handle flow and shows `ProviderRedirectOverlay` while bouncing. |
| OAuth callback exchange | `src/app/api/auth/callback-handler/route.ts` | Shipped | Server-side code exchange; **invalidates any prior `certified_session`** before issuing a new one (defense vs. session fixation); seeds empty `app.certified.actor.profile` and `app.bsky.actor.profile` for new users. |
| `oauth/callback` page | `src/app/oauth/callback/page.tsx` | Shipped | Iframe-aware: `postMessage`s parent on completion, otherwise `window.location.replace("/")`. |
| App session cookie (`certified_session`) | `src/lib/auth/session.ts` | Shipped | `<32-byte hex>.<HMAC-SHA256>`, `httpOnly`, `secure` in prod, `sameSite=lax`, 30-day TTL. HMAC verified with `crypto.timingSafeEqual`. |
| Edge redirect for unauth `/` | `src/proxy.ts` (Next 16 proxy, `matcher: ["/"]`) | Shipped | 307 → `/welcome` if cookie missing, before SSR. Confirms via curl: `200 /welcome`, `307 / → /welcome`. |
| AuthGuard for gated routes | `src/components/layout/auth-guard.tsx` (mounted in each gated `layout.tsx`) | Shipped | Client-side; redirects to `/welcome` once `isAuthenticated === false`. |
| Session lookup | `GET /api/auth/session` | Shipped | Returns `{did}` after re-validating with `client.restore(did)` upstream — detects revoked tokens. |
| Sign-out | `POST /api/auth/logout` + `useAuth().signOut()` | Shipped | Best-effort upstream `signOut`, deletes Redis session + cookie, clears `useSession` cache, optimistic local state reset. |
| OAuth client metadata + JWKS | `/.well-known/oauth-client-metadata`, `/.well-known/jwks.json` | Shipped | 10-minute `Cache-Control`. JWKS only meaningful when `ATPROTO_PRIVATE_KEY` env is set (confidential client). |
| Loopback dev mode | `src/lib/auth/oauth-client.ts` | Shipped | Auto-switches to `buildAtprotoLoopbackClientMetadata` when `PUBLIC_URL` is unset / http. Allows local dev without a public HTTPS host. |
| In-memory Redis fallback | `src/lib/auth/stores.ts` | Shipped (dev) | When Upstash creds are missing in non-prod, swaps to a process-local store with a console warning. State is not shared across workers — dev only. |
| App passwords | `src/app/settings/page.tsx` | **Placeholder** | "This will be available soon." card. No backing API. |
| Two-factor authentication | `src/app/settings/page.tsx` | **Placeholder** | Same: explicit "available soon" copy; no implementation. |
| Password change (PDS-managed) | `EmailSection` placeholder + `PasswordSection` (`src/components/account/password-section.tsx`) | Shipped | Hits PDS `com.atproto.server.requestPasswordReset` then `resetPassword` — the PDS emails a reset code. Note this is an **active password feature** even though the primary login is OTP — keep in mind when planning auth UX. |
| Email change | `EmailSection` (read-only display today) | Gap | The XRPC proxy whitelists `requestEmailUpdate` and `updateEmail`, so backend support exists, but the current `email-section.tsx` has no edit affordance. |

---

## 3. Personal profile & account

| Feature | Where | Status | Notes |
|---|---|---|---|
| Canonical profile view | `/profile/[did]` → `ProfileClient` | Shipped | Loads `app.certified.actor.profile`; falls back to `app.bsky.actor.profile`. Displays display name, handle, about, website, identifier (DID), banner, avatar. Same component renders group profiles when `app.certified.actor.organization` metadata is present. |
| Profile auto-seed on first login | `callback-handler/route.ts` | Shipped | Empty profile records are written to both Certified and Bluesky collections so partner apps see the user immediately. |
| Edit personal profile | `/settings/edit-profile` → `ProfileEditForm` | Shipped | Display name (≤64), about (≤256, with live char count), website (`normalizeWebsiteUrl` — accepts bare hosts, prepends `https://` on save), avatar upload, banner upload. |
| Avatar upload | `AvatarUpload` (`src/components/profile/avatar-upload.tsx`) | Shipped | Goes through XRPC proxy `uploadBlob`. 4 MB cap (matches Vercel body cap). Allowed: JPEG/PNG/WEBP/GIF/SVG. |
| Banner upload | `BannerUpload` | Shipped | Same constraints. UI hides the banner area when no image is set (recently fixed in `12ce79f`). |
| Username display + edit | `UsernameCard` (`src/components/dashboard/username-card.tsx`) | Shipped | Distinguishes "ours" (subdomain of PDS) vs custom domain handles. Edit triggers `com.atproto.identity.updateHandle` via the XRPC proxy. |
| Choose Certified subdomain | Same component, "subdomain" mode | Shipped | Picks `<prefix>.<pdsHostname>` when current handle is empty / non-Certified. |
| Custom domain (DNS-based handle) | `CustomDomainModal` (`src/components/dashboard/custom-domain-modal.tsx`, 353 lines) | Shipped | 3-step flow: enter domain → show TXT record (`_atproto.<domain>` → DID) → verify by triggering `updateHandle`. Cleans pasted protocols/paths; surfaces specific DNS-not-yet-propagated copy on failure. |
| My Data — claims log | `/settings/my-data` | Shipped | Lists records from collection `org.hypercerts.claim.activity` on the user's PDS via `listRecords`. Empty state copy. Empty if collection doesn't exist. |
| Email read display | `EmailSection` | Shipped | Read-only. (Edit is a Gap, see §2.) |
| Recent activity card | `RecentActivityCard` | Unverified — exists but currently not wired into any rendered page. Worth confirming before cleanup. |
| Sign-in preview card | `SignInPreviewCard` | Unverified — same: defined in `dashboard/`, not referenced from any page in the current build. Likely retired. |
| Identity overview card | `IdentityOverviewCard` | Unverified — defined in `dashboard/`, not visible in routes. Retired? |
| Connected apps list (dashboard) | `ConnectedAppsList` | Unverified — defined but not mounted from any page. The standalone `/connected-apps` route uses its own inline rendering. |

> **Planning seed (dashboard cleanup):** Several `dashboard/*` cards (recent-activity, sign-in-preview, identity-overview, connected-apps-list) appear unmounted — either retire them or repurpose into a unified profile-detail dashboard.

---

## 4. Groups (organisations)

The most feature-rich domain. Beta-flagged by the team. `AGENTS.md` §15 is canonical.

| Feature | Where | Status | Notes |
|---|---|---|---|
| Groups list | `/groups` | Shipped | Lists all memberships from the group service merged with local PDS membership records. Empty state with create CTA. |
| List sort (joined ↔ name, both directions) | `/groups/page.tsx:28-75` | Shipped | Stable sort with decorate-sort-undecorate; collapses to an icon + native `<select>` once >1 group. |
| Membership role badges | Same page, navbar account switcher | Shipped | Roles: `owner`, `admin`, `member`. |
| Leave group | Modal in `/groups/page.tsx:227-251` | Shipped | Calls `removeOrgMember` (group service) + best-effort `deleteMembership` on user's PDS. Owners cannot leave — button greyed with tooltip. |
| Create group | `/groups/create` | Shipped | Validates name (≤64) + handle (lowercase alphanumeric + hyphens, 2–32). 6 sequential calls: register → empty bsky profile → org profile (display name, createdAt) → empty org metadata → membership record on user PDS → refresh + navigate. |
| Self-creation cap (5 groups) | `MAX_SELF_CREATED_ORGS = 5` enforced at `/api/groups/register` AND in `useOrgCreationLimit` UI gate | Shipped | "Self-created" defined as `member.addedBy === userDid`. UI shows a "limit reached" state. |
| Active group switcher | Navbar account switcher | Shipped | `OrgProvider` (`src/lib/groups/org-context.tsx`) persists active org to `localStorage` (`certified_active_org`); navbar collapses link set when acting as a group (no `/groups` link). |
| Group profile view | `/groups/[groupDid]` | Shipped | Profile + DID + role + quick links to Apps and Settings. Edit-profile button for owner/admin. |
| Edit group profile | `/groups/[groupDid]/edit-profile` | Shipped | Display name, about, website, founded date (date input), avatar/banner. Org-scoped blob upload (`/api/groups/[groupDid]/upload-blob`, 5 MB, JPEG/PNG/WEBP only — no GIF/SVG). |
| Group apps view | `/groups/[groupDid]/apps` | Shipped | Same partner-app catalog as `/connected-apps` but framed as the group's. |
| Group members + role management | `/groups/[groupDid]/settings` and `OrgSettings` component | Shipped | Members list with handles resolved via `/api/resolve-did`. Add member (DID/handle, role: member/admin). Remove member with `confirm()`. Role change via dropdown — owners only can promote to owner. Pagination at 5/page. |
| Group handle update | `PUT /api/groups/[groupDid]/handle` | Shipped | Calls `com.atproto.identity.updateHandle` via the group proxy. UI only on `/groups/[groupDid]/settings` ("Handle" card — currently read-only display; edit affordance not present). |
| Audit log | `/groups/[groupDid]/settings` (admin only) → `queryOrgAuditLog` | Shipped | Lists `app.certified.group.audit.query` results. Pagination at 20/page. Result badge (success/error). |
| Group profile auto-fallback to bsky | Same pattern as personal profiles | Shipped | The group registration flow seeds `app.bsky.actor.profile` for cross-app discoverability. |
| Membership change detection | `MembershipSyncModal` (`src/components/groups/membership-sync-modal.tsx`) | Shipped | Diffs remote-vs-local membership and prompts the user to acknowledge role changes / removals on next visit. Wired by `OrgProvider`. |
| "Groups are in beta" banner | (seen in source, banner copy in `AGENTS.md` §21) | **Beta** | Group service defaults to a Railway staging deployment; team explicitly warns not to use group data for production-critical flows. |

> **Planning seed (groups productionisation):** the group service is staging; surface metadata (founded date, organization type, urls, location) is partially defined in `GroupMetadata` but only `foundedDate` has UI. `organizationType` and `urls` exist on the read path (rendered on the profile view) but no edit affordance.

---

## 5. Connected apps (partner catalogue)

| Feature | Where | Status | Notes |
|---|---|---|---|
| Partner app catalogue | `/connected-apps` reads `CONNECTED_APPS` from `src/lib/constants/apps.ts` | Shipped | Static list: Ma Earth, GainForest, Simocracy, Hyperboards. External links with `noopener noreferrer`. |
| Group-scoped catalogue | `/groups/[groupDid]/apps` | Shipped | Same data, framed as "use your group's identity to get started". |
| OAuth handoff to partner apps | (Implicit — partner app drives OAuth using `certified.app` as PDS) | Shipped | Architecture: partner apps embed Certified sign-in; the same OAuth client metadata at `/.well-known/oauth-client-metadata` serves both the app itself and partner integrations. |

> **Planning seed (real connected-apps):** today this is a static curated list. The atproto OAuth model already gives users a list of authorized apps via the PDS — surfacing **the user's actually-connected apps** (with revoke-grant) is an obvious next feature.

---

## 6. Linked wallets / identity-link

EVM ↔ atproto cross-attestation. Source: `AGENTS.md` §16.

| Feature | Where | Status | Notes |
|---|---|---|---|
| Link wallet flow | `/settings/wallet` → `IdentityLinkCard` → `LinkWalletFlow` | Shipped | Steps: Connect (Wagmi connectors) → confirm chain + address → sign EIP-712. |
| Supported chains | Mainnet, Base, Optimism, Arbitrum (`src/lib/wagmi.ts`) | Shipped | Chain IDs hard-coded with display labels. |
| Connectors | `injected`, `coinbaseWallet({preference: "smartWalletOnly"})`, optional `walletConnect` | Shipped | WalletConnect only enabled when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set. |
| EIP-712 attestation schema | `ATTESTATION_DOMAIN` / `ATTESTATION_TYPES` in `src/lib/identity-link/attestation.ts` | Shipped | Domain `"ATProto EVM Attestation" v1`. Fields: did, evmAddress, chainId, timestamp, nonce. |
| Storage | PDS collection `org.impactindexer.link.attestation`, rkey `<address>-<chainId>` | Shipped | Same wallet on same chain overwrites itself. Allowlisted in the XRPC proxy. |
| List linked wallets | `useIdentityLinks` hook | Shipped | Fetches from PDS; returns chain icon, truncated address, relative timestamp, verified badge. |
| Verify EOA signatures | `useIdentityLinks` via `viem.verifyTypedData` | Shipped | Recovered address must match record. |
| Verify smart-contract signatures (ERC-1271 / ERC-6492) | `useIdentityLinks` | **Gap** | Returns `verified: false` with `verificationError: "On-chain verification not yet supported"`. The signing path can produce these (`signatureType` field), but the verifier doesn't make `eth_call` to `isValidSignature` yet. |
| Remove wallet link | Trash icon → `deleteAttestation` | Shipped | In-row confirm ("Remove?") then PDS `deleteRecord`. |
| Wallet provider boundary | `/settings/wallet/layout.tsx` | Shipped | `WagmiProvider` is **only** mounted under `/settings/wallet/`. Lifting it elsewhere is an explicit cost (wagmi + viem are heavy). |

> **Planning seed (verifier upgrade):** ERC-1271 verification needs an `eth_call` per chain; ERC-6492 needs unwrapping for not-yet-deployed smart accounts. Both are tracked as gaps.

---

## 7. Public / brand surface

`/welcome` and `/about` are the brand-register screens; `PRODUCT.md` §2 explicitly allows them more expressive freedom than the gated app.

| Feature | Where | Status | Notes |
|---|---|---|---|
| `/welcome` landing | `src/app/welcome/page.tsx` → `LandingPage` | Shipped + browser-verified | Hero ("One account. Any app."), `WhatYouGet`, `HowItWorks` (3 steps), `PartnerApps`, `BuiltForTrust`, `FaqSection` (5 Q&A — shared with FAQPage JSON-LD), `ReadyCtaSection`. Sets navbar variant to `transparent`. |
| Hero CTA | `HeroSignInButton` | Shipped | Triggers default OAuth (no email collection in app). |
| Orbiting partner logos | `OrbitingLogos` | Shipped | IntersectionObserver-gated animation; `prefers-reduced-motion` respected. |
| `/about` | `src/app/about/page.tsx` | Shipped + browser-verified | Long-form content explaining Certified, AT Protocol, the Hypercerts Foundation. |
| `/terms` | `src/app/terms/page.tsx` (619 lines) | Shipped + browser-verified | Terms of Service. |
| `/privacy` | `src/app/privacy/page.tsx` (484 lines) | Shipped + browser-verified | Privacy Policy. |
| `/dsa` | `src/app/dsa/page.tsx` (317 lines) | Shipped + browser-verified | EU Digital Services Act compliance. |
| Floating feedback widget | `FeedbackModal` (`src/components/ui/feedback-modal.tsx`, 351 lines) | Shipped | Mounted globally in root layout. Bottom-right button; opens modal (or bottom sheet on mobile, with drag handle); submits to `POST /api/feedback` → Resend → `support@hypercerts.org`. Sends a confirmation email when the user provides one. Avoids overlapping the footer via scroll-based offset. |

---

## 8. SEO / GEO / PWA

| Feature | Where | Status | Notes |
|---|---|---|---|
| Sitemap | `src/app/sitemap.ts` | Shipped + browser-verified | 200 OK at `/sitemap.xml`. |
| Robots | `src/app/robots.ts` | Shipped + browser-verified | 200 OK at `/robots.txt`. |
| PWA manifest | `src/app/manifest.ts` → `/manifest.webmanifest` | Shipped | Brand icons (192/512), theme colour. |
| OG / Twitter card | `welcome/page.tsx` metadata | Shipped | `/assets/certified-hero-1200x630.png` referenced. |
| JSON-LD: SoftwareApplication | `welcome/page.tsx` | Shipped | `applicationCategory: "SecurityApplication"`, `creator: Hypercerts Foundation`. |
| JSON-LD: FAQPage | `welcome/page.tsx` (uses shared `FAQ_ITEMS`) | Shipped | 5 Q&A entries — single source of truth for both UI and structured data. |
| `llms.txt` for AI crawlers | `public/llms.txt` | Shipped | Brief description of the app for LLM crawlers. |
| Skip-to-main link | Root `layout.tsx` | Shipped | A11y on-ramp described in `PRODUCT.md`. |

---

## 9. Layout / cross-cutting UI

| Feature | Where | Status | Notes |
|---|---|---|---|
| Top navbar | `src/components/layout/navbar.tsx` (420 lines) | Shipped | Two link sets (personal vs. group active). Account switcher dropdown with role-sorted org list (owner > admin > member, accepted-first). Two variants (`default`, `transparent`) controlled by `NavbarProvider`. Scroll-pinned background. |
| Mobile bottom-sheet menu | Same file | Shipped | Drag-handle expand/collapse/dismiss. |
| Footer | `src/components/layout/footer.tsx` | Shipped | Single instance in root layout. Skipped on `/welcome` (replaced by `landing-footer`). |
| AuthGuard | `src/components/layout/auth-guard.tsx` | Shipped | Shows loading spinner; redirects to `/welcome` after auth check fails. Wraps every gated layout. |
| Sign-in modal | `SignInModal` | Shipped | Two views (certified email / atproto handle). Focus trap (`useFocusTrap`). Backdrop click closes. |
| Provider redirect overlay | `ProviderRedirectOverlay` | Shipped | Shown briefly while bouncing to a non-Certified PDS during `switch-provider` flow. |
| Focus trap hook | `useFocusTrap<T>(active)` | Shipped | Used by sign-in modal, feedback modal, anywhere else a modal is rendered. Restores focus on close. |
| Avatar component | `src/components/ui/avatar.tsx` | Shipped | Supports `src`, `fallbackInitials`, sizes (sm/md/lg), `bordered`. Initials via `getInitials` (`src/lib/utils/initials.ts`). |
| Form input + textarea | `src/components/ui/input.tsx`, `textarea.tsx` | Shipped | Auto-wires `aria-describedby`/`aria-invalid`/`id`/label associations via `useId`. Canonical pattern. |
| Button | `src/components/ui/button.tsx` | Shipped | Variants: primary, secondary, ghost, destructive. Sizes: sm/md. `loading` state. |
| Error message | `src/components/ui/error-message.tsx` | Shipped | Inline, `role="alert"`. |
| Loading spinner | `src/components/ui/loading-spinner.tsx` | Shipped | `role="status"`, `aria-live="polite"` patterns used at call sites. |
| Card / Badge | `src/components/ui/card.tsx`, `badge.tsx` | Shipped | Generic primitives. |
| Global skip-nav | Root `layout.tsx` | Shipped | `<a href="#main-content">`, `<main id="main-content">`. |
| Global error boundary | `src/app/error.tsx` | Shipped | Generic Next 16 error UI. |
| 404 | `src/app/not-found.tsx` | Shipped | Custom 404 page. |

---

## 10. State management

| Concern | Where | Notes |
|---|---|---|
| Auth state | `AuthProvider` (`src/lib/auth/auth-context.tsx`) | `isLoading`, `isAuthenticated`, `did`, `pdsUrl`, `error`, modal flags + actions. Owns `SignInModal` and `ProviderRedirectOverlay`. |
| Active group | `OrgProvider` (`src/lib/groups/org-context.tsx`) | Persists to `localStorage`. Initial state read synchronously to avoid navbar avatar flicker. Refetches groups on auth change. |
| Navbar variant | `NavbarProvider` (`src/lib/navbar-context.tsx`) | `default` vs `transparent`. |
| Wagmi (wallet) | Scoped to `/settings/wallet/layout.tsx` | Avoids loading wagmi+viem on every gated page. |
| Cached session metadata | `useSession` (`src/hooks/use-session.ts`) | Module-level promise cache for `getSession` (handle, email). `clearSessionCache()` on sign-out. |
| Profile cache | `useProfile`, `useOrgProfile` | Per-fetch `AbortController`. Falls back to `app.bsky.actor.profile`. |
| **No** Redux / Zustand / Jotai | — | Local state + the four contexts above. |

---

## 11. Backend / API surface

`AGENTS.md` §9 + §10 are canonical.

### Auth
- `POST /api/auth/login` (CSRF) — returns `{url}` for any of `mode: email|handle|default`.
- `GET /api/auth/callback-handler` — server-side OAuth code exchange + cookie issue.
- `GET /api/auth/session` — returns `{did}` after upstream `client.restore`.
- `POST /api/auth/logout` (CSRF) — upstream signOut + cookie delete.

### XRPC proxy (`/api/xrpc/[...method]`)
**Allowed reads:** `repo.getRecord`, `repo.listRecords` (limit 1–100), `server.getSession`, `sync.getBlob`.
**Allowed writes:** `repo.createRecord|putRecord|deleteRecord`, `repo.uploadBlob`, `identity.updateHandle`, `server.requestPasswordReset|resetPassword|requestEmailUpdate|updateEmail`.
**Write collection allowlist:** `org.impactindexer.link.attestation`, `app.certified.actor.profile`, `app.certified.actor.membership`, `app.certified.actor.organization`. Anything else → 403 silently. **To add a new collection, append to `ALLOWED_WRITE_COLLECTIONS`.**
**Blob limit:** 4 MB; JPEG/PNG/WEBP/GIF/SVG.
**Error sanitisation:** ≥500 status → `"Internal server error"` (no upstream leak). New BFF routes must follow this pattern.

### Groups (10 endpoints)
- `POST /api/groups/register` (CSRF) — service-auth call to `app.certified.group.register`. Enforces 5-group cap.
- `GET /api/groups/memberships` — lists the user's group memberships from the service.
- For each `[groupDid]`: GET/PUT `profile`, GET/PUT `metadata`, POST `bsky-profile`, PUT `handle`, GET/POST/DELETE `members`, PUT `role`, GET `audit`, POST `upload-blob` (5 MB, JPEG/PNG/WEBP only).

### Discovery
- `GET /api/resolve-handle` — `com.atproto.identity.resolveHandle`.
- `GET /api/resolve-did` — DID-doc resolution + Bluesky display name.
- `GET /api/search-actors` — `app.bsky.actor.searchActors` (limit clamped 25).

### Other
- `POST /api/feedback` (CSRF) — Resend; strips invisible Unicode; sends user-confirmation email.
- `GET /.well-known/oauth-client-metadata` — `Cache-Control: public, max-age=600`.
- `GET /.well-known/jwks.json` — JWKS (only meaningful when `ATPROTO_PRIVATE_KEY` set).

### Custom group lexicons (`app.certified.group.*`)
`register`, `repo.{createRecord,putRecord,deleteRecord,uploadBlob}`, `member.{add,remove,list}`, `role.set`, `audit.query`. Defined in `src/lib/groups/proxy-agent.ts`.

---

## 12. Security posture

| Item | Status | Notes |
|---|---|---|
| CSRF check on all mutating routes | Shipped | `Origin` header == `PUBLIC_URL`. Absent header allowed for same-origin. |
| Cross-repo write block | Shipped | `body.repo === sessionDid` enforced in proxy. |
| Collection allowlist | Shipped | Hard-coded set in `route.ts`. |
| HMAC session cookie | Shipped | `crypto.timingSafeEqual` to prevent timing attacks. |
| Session fixation defense | Shipped | Old session invalidated before new one issued in callback. |
| External URL validation | Shipped (per call site) | `safeRedirect` allows only `https:` (and `http:` in dev). User-controlled `profile.website` validation has a documented TODO for a shared helper. |
| Upstream error masking | Shipped | ≥500 → "Internal server error". |
| Secret redaction in xrpc logs | Shipped (recently `e448085`) | Logs no longer leak access tokens. |
| Rate limiting in BFF | **Gap** | Only what Vercel + Upstash provide. |
| Structured logging | **Gap** | `console.error("[Auth] …")` convention; logs go to Vercel serverless logs. |
| Automated tests | **Gap** | `tests/groups.test-plan.md` is a manual plan. Quality gates are `npm run build` + `npx tsc --noEmit`. |

---

## 13. Design tokens & styling

`DESIGN.md` is canonical. Surface summary:

- All custom CSS in `src/app/globals.css` (~4.7k lines, BEM-like with component prefixes: `.dashboard__`, `.signin-modal__`, `.org-list__`, etc.). Tailwind utilities used inside JSX for one-off layout.
- Custom Tailwind theme in `tailwind.config.ts`: `navy`, `accent`, `sky`, `deep` colours; `display`, `h1–h4` font sizes; `elevation-1`–`elevation-4` shadows; `button: 6px`, `card: 4px`, `sm: 2px` radii.
- CSS vars in `:root` for surfaces, borders, semantic colours, navy overlays, transitions, geometry. Reuse rather than hard-code.
- **Hard rule:** no `100vw` (scrollbar overflow). Confirmed zero usage in `globals.css`.

---

## 14. Browser-verification scope (this session)

| Surface | Verified | Method |
|---|---|---|
| `/welcome`, `/about`, `/terms`, `/privacy`, `/dsa` | ✅ | curl 200 + Playwright screenshot of `/welcome`. |
| `/`, `/sitemap.xml`, `/robots.txt`, `/.well-known/oauth-client-metadata` | ✅ | curl. `/` → 307 → `/welcome` confirmed. |
| Sign-in hero button → OAuth bounce | ✅ | Playwright observed `/api/auth/login` → `auth.certified.one/oauth/authorize` redirect. |
| PDS sign-in screen (`auth.certified.one`) | ✅ | Screenshot `02-pds-login.png`; structure confirmed (email → "Continue"). |
| PDS OTP entry | ✅ | Screenshot `02-otp-prompt.png`; 6-box auto-submit form confirmed. |
| PDS consent screen (`certified.one/oauth/authorize`) | ✅ | Screenshot `10-post-auth.png`; "Authorize" / "Deny access" buttons; user `brammer.certified.one` (email `holke.brammer@gmail.com`) confirmed; scopes shown: Email, Identity, Bluesky, Repository, Authenticate. |
| `/`, `/settings`, `/settings/edit-profile`, `/settings/my-data`, `/settings/wallet`, `/connected-apps`, `/groups`, `/groups/create` | ❌ Not browser-verified | Walks bounced to `/welcome` (AuthGuard) because the OAuth flow couldn't be completed without a fresh OTP per attempt. **Source-only** for these — descriptions above are derived from page components, hooks, and APIs. |

> **Why the gated walk failed.** The default sign-in flow uses `prompt=login` on the OAuth authorization request, which forces the PDS to require fresh OTP every time — even with valid PDS session cookies in the browser. To browser-verify gated screens we'd need either (a) one OTP we can use immediately and a script with no remaining bugs, or (b) to run the sign-in once manually in a real browser and reuse the resulting `certified_session` cookie for an automated walk.

---

## 15. Known limitations & gaps (planning candidates)

| Item | Why it matters for planning |
|---|---|
| **App passwords** placeholder | Currently the only path to integrate non-OAuth atproto clients is missing. |
| **2FA / TOTP** placeholder | High-trust users will expect this on a "passwordless identity platform". |
| **Email change** has no UI | Backend is wired (`requestEmailUpdate` / `updateEmail` are whitelisted) — UI gap. |
| **ERC-1271 / ERC-6492 verification** | Smart-account users get `Unverified` badge today. Implementing requires `eth_call` per chain. |
| **Group service is staging-only** | `GROUP_SERVICE` defaults to a Railway staging URL. Beta banner in place. |
| **No avatar/banner CDN** | All avatar URLs are direct PDS `getBlob` calls. Heavy traffic puts load on the PDS. |
| **No automated tests** | `tests/groups.test-plan.md` is manual. Build + tsc are the only gates. |
| **No structured logging** | `console.error("[Auth] …")` convention only. |
| **No rate limiting** in BFF | Only Vercel + Upstash defaults. |
| **TypeScript `as` casts** in BFF route handlers | XRPC proxy and most route handlers cast through `as`. Pulling in atproto SDK input/output types per method is tracked. |
| **Unmounted dashboard cards** (`recent-activity`, `sign-in-preview`, `identity-overview`, `connected-apps-list` in `dashboard/`) | Dead or pending integration — clean up or surface on the user dashboard. |
| **Group metadata fields without UI** (`organizationType`, `urls`, `location`) | Read path renders them; edit affordance is missing. |
| **Connected-apps catalogue is static** | An "actually connected apps" view (with revoke) would be a more meaningful surface. |
| **Profile dashboard route** | Current `/profile/[did]` is a single profile card. There's no aggregate "your activity across atproto" view. |
| **Group profile shows handle but no edit** | `/groups/[groupDid]/settings` shows the handle as read-only. Backend `PUT /api/groups/[groupDid]/handle` exists. |

---

## 16. Pointers

- **Architecture:** `AGENTS.md`. Sections 7–17 are the canonical reference for routes, auth flow, API catalogue, XRPC proxy, hooks, state, groups, identity-link, and security.
- **Brand & product:** `PRODUCT.md` (register, anti-references, accessibility floor).
- **Design system:** `DESIGN.md` (semantic tokens, component canon).
- **Public README:** `README.md` (env vars, getting-started).
- **Manual test plan:** `tests/groups.test-plan.md` (the only test artefact).
- **In-progress / shipped feature docs:** `docs/groups-list-improvements/` (round-1 and round-2 review decisions).
