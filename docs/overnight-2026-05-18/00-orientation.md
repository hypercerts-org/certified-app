# 00 — Orientation

**Date:** 2026-05-18 (UTC overnight pass)
**Branch:** `feat/positioning-redesign` (HEAD `ad6668c`)
**Operator:** asleep; this pass is autonomous.

---

## How to read this doc

Phase 0 per the overnight brief: factual map of the project, no judgments yet. Phase 1 (review design) lives in `01-review-plan.md`; findings in `02-findings.md`; etc.

---

## 1. What this project is, in plain words

Certified is a Next.js application that lets people and organizations publish "certs" — long-form work records — to their own ATProto (PDS) repository, then aggregate, surface, and endorse them through a federated network. It mirrors and extends Bluesky's social graph (handles, profiles, follows) with a parallel "certified" overlay (`app.certified.*` lexicons) plus Hypercerts-derived activity claims (`org.hypercerts.claim.*`). It is also a tooling layer for groups/organizations who want to act collectively — create cert records under a group DID, run member endorsements, and manage a shared profile and locations.

The product currently in this branch is the result of a "positioning redesign" — a 79-commit feature branch (since the last merged staging) that landed: a profile hub with multiple tabs (Overview/About/Certs/Projects/Groups/Endorsements/Followers/Settings), a TipTap-based "leaflet" rich-text editor for long descriptions, a social-graph sync UI for migrating Bluesky follows into the Certified `graph.follow` collection, inline-edit chrome on the cert detail page, a location/geocode binding (with Leaflet map and EPSG:4326 SRS), and a redesigned settings surface for both personal and group identities.

---

## 2. Stack & runtime

| Layer | Choice |
|---|---|
| Framework | Next.js **16.2.3** (App Router, Turbopack production build) |
| Language | TypeScript strict (ES2017 target, bundler resolution, `@/*` alias) |
| UI | React 19, plain CSS (per-feature files in `src/app/styles/`), Tailwind for utilities, no CSS modules / styled-components |
| Auth | ATProto OAuth via `@atproto/oauth-client-node`, Redis-backed session/state store (Upstash), HMAC-signed `certified_session` cookie |
| Persistence (server) | Upstash Redis (sessions, OAuth state, token bundles) — **no application database** |
| Persistence (user data) | The user's own PDS (federated); also CGS (group service) and Magic Indexer (GraphQL) |
| Rich text | TipTap 3 (`@tiptap/react`, `starter-kit`, `link`, `placeholder`) |
| Maps | Leaflet + react-leaflet 5 |
| Email | Resend |
| Caching | None at the HTTP/data layer (no React Query / SWR); module-level promise dedup in a few hooks |
| Lint | ESLint flat config extending `eslint-config-next/core-web-vitals`; `react-hooks/set-state-in-effect` downgraded to `warn` |
| Tests | **None.** One placeholder `*.test.ts` in `src/config/__tests__/`; `tests/*.test-plan.md` are prose checklists. |
| CI | **No GitHub Actions.** The only automated check is Vercel preview/production deploys. `npm run build` is the manual gate. |
| Deploy | Vercel (project `certified-app`, team `hypercerts-foundation`) |

---

## 3. Repo shape

```
src/
  app/                      Next.js App Router pages + route handlers
    api/                    27 API routes: auth, xrpc proxy, groups BFF, indexer proxy, resolve helpers, geocode
    styles/                 18 plain-CSS files (largest: layout.css 3334 lines, feed.css 2155, components.css 1910)
    profile/[handle]/       Profile hub (~1145-line page.tsx, tab orchestration)
    activity/[did]/[rkey]/  Cert detail
    project/[did]/[rkey]/   Project detail
    groups/, settings/, search/, feed/, oauth/callback, …
  components/
    profile/                15 files, 272 KB — heaviest feature (endorsements 1152, overview 991, sidebar 904, followers 740)
    layout/                 11 files, app shell, navbar, top bar, bottom nav, footer, account switcher
    feed/                   12 files, activity-detail (901), activity-card, cert-byline, cert-locations-map, cert-projects
    leaflet/                7 files, TipTap editor + image/embed nodes + link/embed dialogs
    settings/               sync-social-graph-section (690), settings-panel (~250)
    groups/, map/, project/, ui/, …
    ui/                     18 shared primitives (button, card, modal-like, avatar, input, textarea, smart-link, …)
  lib/
    atproto/                activity, badges, cert, follow, indexer, location, profile, types
    auth/                   oauth-client, session, stores, fetch (authFetch), post-signin, auth-context
    groups/                 org-context, org-marker, org-types, types, constants, proxy-agent, sanitize, use-org-limit
    leaflet/                tiptap ↔ linearDocument conversion, embed-url, guards, types
    locations/              geocode helpers
    navbar-context, notifications-context, providers, …
  hooks/                    ~30 hooks. Notable: use-user-profile, use-user-groups, use-endorsements,
                            use-received-endorsements, use-following, use-followers, use-cert-projects,
                            use-project-items, use-org-marker, use-user-indexer-activities,
                            use-social-graph-sync, use-rights, use-session
lexicons/
  app/certified/temp/graph/endorsement.json    Single committed lexicon. The badge/award/response and
                                               graph.follow/actor.{profile,organization,membership}
                                               and org.hypercerts.claim.{activity,rights,location}
                                               families are referenced from code but not in this tree.
docs/
  positioning-redesign/, ...                   Plan + review-decision docs for the in-flight redesign
  overnight-2026-05-18/                        This pass
tests/
  groups.test-plan.md, notifications.test-plan.md   Prose checklists only.
AGENTS.md   1062 lines of conventions, security rules, deep-flow process, pitfalls.
DESIGN.md   ~37 KB of design tokens & UX conventions.
```

Approximate source-line count under `src/`: 70k (rough; the redesign branch alone added ~24k lines).

---

## 4. Architectural shape

### Entry points / rendering

- Root layout (`src/app/layout.tsx`) mounts the provider tree: `ThemeProvider → AuthProvider → OrgProvider → NotificationsProvider → NavbarProvider → FeedbackProvider`. Inside lives `<Navbar />`, a Suspense-wrapped `<DesktopTopBar />`, `<main>` with `<AppShell>`, `<BottomNav />`, `<SiteFooter />`, and a global `<FeedbackModal />`.
- The vast majority of pages are **client components** (`"use client"`); only a handful of legal/info pages are server-rendered. Dynamic routes like `/profile/[handle]` and `/activity/[did]/[rkey]` use the Next 16 `params: Promise<{...}>` pattern.
- There is **no `middleware.ts`** at root. AGENTS.md §20 mentions a `src/proxy.ts` for `/` → `/welcome` redirection in Next 16; it is referenced but not currently in the source tree (was removed or never landed on this branch — `/` is handled by client-side redirect in the page).

### Data plane

Three external services, all reached via same-origin API routes (server proxies, not direct browser → upstream calls):

1. **The user's PDS** — proxied through `/api/xrpc/[...method]`. The proxy restores the user's `OAuthSession` from Redis on every call, validates allowlists (collection writes, blob MIME and size), sanitizes 5xx errors. Public reads (handle resolve, search) go through `/api/resolve-handle`, `/api/resolve-did`, `/api/search-actors`.
2. **CGS** (group service, default `https://groups.certified.app`, DID `did:web:groups.certified.app`) — proxied through `/api/groups/[groupDid]/{profile,activity,location,follow,upload-blob,members,role,handle,metadata,bsky-profile,audit}`. Used for any write that targets a group repo (the user is not the repo owner, so the BFF issues a service-auth JWT on the user's behalf).
3. **Magic Indexer** (GraphQL, `INDEXER_URL` or `NEXT_PUBLIC_INDEXER_URL`) — proxied through `/api/indexer`. Queries: `orgHypercertsClaimActivity`, `appCertifiedBadgeAward`, `appCertifiedBadgeDefinition`, legacy `appCertifiedTempGraphEndorsement`, and a planned `appCertifiedGraphFollow`.

Client code never calls upstream services directly. Hooks fetch from the same-origin proxies via `authFetch()` (which intercepts 401s into the auth-expiry UI).

### Auth model

- **OAuth tokens never leave the server.** They live in Upstash Redis (stored by `NodeOAuthClient`'s session store, keyed by DID), refreshed on demand by `getOAuthClient().restore(did)`.
- The browser carries only a signed cookie `certified_session=<sessionId>.<HMAC-SHA256(sessionId, COOKIE_SECRET)>` (httpOnly, secure in prod, sameSite=lax). The session id maps to a DID via Redis (`session:did:<sessionId>`, 30-day TTL).
- HMAC comparison is `timingSafeEqual`. CSRF check on mutating routes compares `Origin` against `PUBLIC_URL`.
- A "dev loopback" path (`oauth-client.ts`) auto-switches to `buildAtprotoLoopbackClientMetadata` when `NODE_ENV !== "production"` and `PUBLIC_URL` is missing or `http://`. This is the only way OAuth works locally without a tunnel.

### Group / organization model

- A "group" is a DID with its own PDS-style repo. Members hold `app.certified.actor.membership` records on their own repo referencing the group DID.
- `OrgProvider` tracks the currently active identity (personal DID or a group DID). Most write paths take a `targetDid` and route accordingly: equal-to-self → XRPC proxy on the user's own repo; else → CGS BFF. This routing decision is repeated across `badges.ts`, `cert.ts`, `follow.ts`, `location.ts`, `profile.ts`, `org-marker.ts`.

### CSS

- 18 plain-CSS files under `src/app/styles/`. BEM-style class names (`.app-shell__content`, `.profile-endorsements__list-item`). Imported per-route from page or component files (no global registration).
- Tokens (CSS custom properties) in `tokens.css`. Dark theme via `data-theme="dark"` on `<html>`.
- Tailwind is used for utility classes and a small `status` color set, not for layout.

---

## 5. Conventions, idioms, and bets (per AGENTS.md and observed code)

- **`authFetch` not `fetch`** for every authenticated XRPC call (only `authFetch` surfaces 401 → re-auth UI).
- **CSRF first** in any mutating route (`checkCsrf(request)`), then auth check via `getSessionDid()` or `getAuthenticatedAgent()`.
- **Repo ownership on writes** — `body.repo` must equal session DID; cross-repo writes use the CGS proxy pattern, not the XRPC proxy.
- **Collection allowlist** — only the small `ALLOWED_WRITE_COLLECTIONS` set may be written via XRPC; new collections must be added there explicitly.
- **Sanitize input twice** (client + server), allowlist URL schemes (`http:`, `https:`, `mailto:`, `tel:`) before rendering `href`.
- **Sanitize 5xx errors** — never echo upstream PDS error messages on 5xx; 4xx may echo (usually validation).
- **Deep flow** for substantial work (AGENTS.md §26): plan in `docs/<feature>/plan.md` with alternatives, parallel reviewer agents per lens, atomic commits with `Co-Authored-By:` trailer, Draft PR, operator merges. The brief tonight overrides only the branching choice (work on `feat/positioning-redesign`, not `staging`).
- **Modals use `<dialog className="signin-modal app-modal …">`** to inherit the "modal radius" rule (DESIGN.md `--radius-modal`).
- **Optimistic-state pattern** (AGENTS.md §15a) — for endorsement responses and follows: clear optimistic state via a parent-value-caught-up `useEffect`, not in the write's `finally` block.
- **Type validation is hand-written guards, not Zod.** No `zod` import anywhere. Defense is at the API route boundary (typeof, allowlists) and on the client at parse sites.

---

## 6. Quality-gate baseline (captured before any change tonight)

After running `npm install` (the local `node_modules` was 6 days stale and lacked the recently-added tiptap/leaflet deps):

| Gate | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) | Fully clean. |
| `npm run lint` | **45 problems: 6 errors, 39 warnings** | Pre-existing baseline — see breakdown below. Must not increase. |
| `npm run build` | **PASS** (with dummy env vars in `.env.local`) | Compiled in 4.0s, 41/41 static pages, all 27 API routes accounted for. |
| `npm audit` | 2 vulnerabilities: 1 high (Next 16.2.3 — patched in 16.2.6), 1 moderate (postcss <8.5.10) | Both are dependency advisories, not custom code. Notable. |

### Lint baseline detail

6 errors:
- `src/hooks/use-social-graph-sync.ts:77:31` — `Compilation Skipped: Existing memoization could not be preserved` (React Compiler couldn't preserve a useMemo).
- `src/hooks/use-user-indexer-activities.ts:188-189` — **5 instances** of `react-hooks/refs` "Cannot access refs during render".

39 warnings — mostly `react-hooks/set-state-in-effect` (a legitimate pattern for SSR mount-sentinel / async-fetch cancellation / reset-on-dep-change, per AGENTS.md §3) and a handful of `react-hooks/refs` warnings. Nothing security-shaped.

**Tonight's rule:** every commit must keep `tsc` clean and not regress the lint count past `6 errors / 39 warnings`. Build must remain green.

---

## 7. Env vars

Declared in `.env.local.example`:
- `NEXT_PUBLIC_PDS_URL` (required), `PUBLIC_URL` (required), `COOKIE_SECRET` (required prod), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (required), `ATPROTO_PRIVATE_KEY` (optional confidential client), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_GROUP_SERVICE_URL`, `NEXT_PUBLIC_GROUP_SERVICE_DID`.

Referenced in code but **not in `.env.local.example`**:
- `NEXT_PUBLIC_STADIA_API_KEY` (map tiles)
- `NEXT_PUBLIC_INDEXER_URL` / `INDEXER_URL` (indexer GraphQL)
- `INDEXER_DID` (service auth target)

This drift is a real finding — defer evaluation to Phase 2.

---

## 8. Branch state (vs. staging, vs. main)

```
feat/positioning-redesign  ad6668c  ← tonight's HEAD
                                    ↑ 79 commits ahead of staging
                                    ↑ contains all of staging (no rebase needed)
staging                             ← merge target for tonight's Draft PR
main                                ← production
```

The previous Draft PR from this branch into staging — PR #63, "Positioning redesign — implement docs/positioning/brief.md (14/16 tracks)" — was **closed** (not merged) on 2026-05-16. 79 commits have landed since the PR opened (most of them after closure). The closure does not appear to be a rejection of the work; rather it looks like the operator continued iterating directly on the branch and intends to open a fresh PR when ready. Tonight's Draft PR will be the fresh one.

Recent thematic clusters (since PR-63 close, by commit subject):
- **Profile redesign** — social graph sync, endorsements lists, projects redesign, settings sync; About tab; Groups tab gating; sidebar refinements; inline edit form.
- **Cert detail** — tabbed Overview/Description/Contributors; inline edit (title, short desc, image, description); banner alignment; project section; gating Edit on owner/admin role; map showing geojson polygons.
- **Leaflet editor** — TipTap editor with custom image/embed nodes; YouTube/Vimeo embed; CSP allowlist; image upload; link dialog (replaces `window.prompt`); rounded-modal scroll fix.
- **Layout** — shared `EditBanner`, content alignment, sticky stable, minimal GitHub-style footer.
- **Locations** — two-way location bind, `app.certified.location` record, autocomplete dropdown, EPSG:4326 SRS.
- **Map / geocode** — geocode route, dynamic map, autocomplete.
- **Groups settings** — two-pane layout to match personal.

---

## 9. Interpretations (things I would normally ask the operator)

The brief is autonomous and the operator is asleep. I noted these interpretive calls in the morning hand-off doc:

1. **"Implement on `staging`" vs. the named branch.** The overnight prompt template says implement on staging; the operator's actual instruction names `feat/positioning-redesign`. I treat the named branch as authoritative. Atomic commits go to that branch; the Draft PR at the end targets `staging`.
2. **PR #63 closed-not-merged.** I interpret this as "iteration continued past the original PR boundary, fresh PR to come." I open a fresh Draft PR rather than try to reopen #63.
3. **Commits in this branch were authored as `holke@Holkes-MacBook-Pro.local`.** The CLAUDE.md note about Vercel git-author validation references that other emails make the Vercel check fail. Local git config here is `103380539+holkexyz@users.noreply.github.com`. That noreply maps to GitHub user `holkexyz` and PR #63's preview build is `Ready`, so the same Git author validation should continue to succeed. If the Vercel check fails on tonight's push because of git author, I'll re-author my commits with `--reset-author` against the prior parent rather than push more commits on top.
4. **Quality gate: build is the gate; no GitHub Actions exist.** This means tonight's "make CI green" is "make `npm run build` succeed and don't regress lint count." There is no test suite to pass.
5. **No production data in `.env.local`.** I wrote a `.env.local` with dummy values to enable `next build` to instantiate route modules. The file is gitignored. I will not commit it.
6. **The 4.5 GB `core` dump file at repo root** is a crash dump from a prior session (May 16). I am not touching it tonight — out of scope.

These are also flagged in the final hand-off so the operator can confirm or correct them in the morning.

---

## 10. Surface for review (what's likely in scope tonight)

Without judging quality, the high-attention areas this branch has changed and that warrant lens-by-lens review are:

- The **dual-path write routing** (`targetDid`-based XRPC vs CGS) in `badges.ts`, `cert.ts`, `follow.ts`, `location.ts`, `profile.ts`, `org-marker.ts` — copy-pasted shape, error handling shape, route contract assumptions.
- The new API routes added on this branch: `/api/geocode`, `/api/groups/[groupDid]/{activity,follow,location}`. CSRF, auth, body validation, error sanitization, allowlist coverage.
- The four largest UI files (profile-endorsements 1152, page.tsx 1145, profile-overview 991, profile-sidebar 904) for correctness, accessibility, state-management coherence, and possible extraction without scope blow-up.
- The TipTap leaflet editor + linearDocument conversion (`from-tiptap.ts`, `to-tiptap.ts`, `embed-url.ts`, `guards.ts`) — URL-scheme allowlist, embed-URL parsing, sanitization at conversion boundaries.
- The social graph sync flow (`use-social-graph-sync.ts`, `sync-social-graph-section.tsx`) — write idempotency, dedup, error handling, optimistic state.
- `use-user-indexer-activities.ts` — known lint baseline error site (5 × `react-hooks/refs`).
- `use-social-graph-sync.ts` — known lint baseline error site (1 × React Compiler memoization).
- The 12-line CSP in `next.config.ts` — frame-src now includes YouTube/Vimeo (for leaflet embeds); verify no regression in `img-src`, `connect-src`, `script-src` for any of the new flows.
- The Next.js advisory (16.2.3 → 16.2.6 patch bump) — within-minor, but worth Phase 2 evaluation.

These are scoping notes for the review designer in Phase 1, not findings.

---

## 11. Confidence

I am confident on the overall shape: stack, route inventory, auth, data plane, gates. I am **less confident** on:

- The exact production behavior of the indexer "map-literal bug" workaround (regex in `use-received-endorsements.ts`) — I haven't probed against a real indexer tonight.
- Whether the `tests/` folder has any hidden harnesses (none surfaced, but I didn't grep exhaustively for `it(` / `describe(` patterns across `src/`).
- Whether the previously-removed `src/proxy.ts` (Next 16 proxy) was retired intentionally or is missing in error — AGENTS.md still documents it.

Phase 1 will list these as targeted reviewer questions.
