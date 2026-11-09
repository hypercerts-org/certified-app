# certified.app v2

Work in progress: the rebuild of [certified.app](https://certified.app) as a reference implementation of the Hypercerts protocol and API. The current production app lives on `main` and `staging`; this branch (`v2`) starts from a clean slate.

So far: public pages backed by live data from the [Hypercerts API](https://docs.hypercerts.org/reference/services/hypercerts-api), sign-in, and editing your own profile (the first signed write).

## Running it

```bash
pnpm install
pnpm dev           # starts Next.js
pnpm build         # production build
pnpm typecheck
pnpm lint          # Biome lint
pnpm format:check  # Biome formatting, without changing files
pnpm format        # apply Biome's formatting
```

Node 24 (see `.nvmrc`). Tooling follows the Hypercerts SDK repository: Biome with the same rules and formatting, pnpm, TypeScript 7, Node 24. The API defaults to production, `https://api.hypercerts.dev`; set `HYPERCERTS_API_URL` to use another deployment.

### Signing in locally

Sign-in needs Redis. `docker compose up -d` starts it on `127.0.0.1:6379`; copy the `REDIS_URL` and `PUBLIC_URL` lines from `.env.example` into `.env.local`. In production, `REDIS_URL` is any provider's connection string, for example from a Vercel Marketplace Redis integration. Without an https `PUBLIC_URL`, the app is an atproto loopback client: open it at `http://127.0.0.1:3000` (not `localhost`), because the authorization server redirects back there. From another machine, forward the port (`ssh -L 3000:127.0.0.1:3000 <host>`) and use the same URL.

Writing also needs `CREATED_VIA_SIGNING_KEY` (see `.env.example` for generating one); without it, saves fail rather than go out unsigned. `pnpm test` runs the unit tests.

## What is here

| Route                                   | What it shows                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                     | Landing page: find your organization, and a hand-picked set of organizations that award badges                                                |
| `/explore`                              | Organizations, with search (`?q=`) and "load more"                                                                                            |
| `/{did}`                                | An account's page built from tiles: Activities, Projects, Badges awarded (for accounts that have issued badge awards), About, Badges received |
| `/{did}/project/{rkey}`                 | A project and the activities it contains                                                                                                      |
| `/embed/activities?author={did}`        | The Activities tile as an embeddable page for an `<iframe>`                                                                                   |
| `/api/activities`, `/api/organizations` | Later pages for "load more", as cacheable GET endpoints (`/api/activities` takes `author` or `project`)                                       |
| `/settings/profile`                     | Edit your display name and description, saved to your own repository and signed by the app                                                    |
| `/sign-in`                              | Sign in with a Certified email address, or a handle on any AT Protocol server                                                                 |
| `/oauth/callback`, `/.well-known/*`     | OAuth callback, client metadata and (for a confidential client) public keys                                                                   |

## How it is put together

- **Next.js 16 App Router with Cache Components.** Pages are Server Components. Public data is read through cached functions (`'use cache'`, one-minute revalidation). Dynamic routes render a static shell and are then cached per URL (ISR), so repeat visitors are served from the cache.
- **One data module.** `src/lib/hypercerts/queries.ts` is the only code that talks to the API. It calls XRPC endpoints through an [`@atproto/lex`](https://www.npmjs.com/package/@atproto/lex) `Client`, which returns responses typed from the API's lexicons, and maps them to plain view models (`src/lib/hypercerts/views.ts`). Endpoint definitions and view types come from [`@hypercerts-org/api`](https://www.npmjs.com/package/@hypercerts-org/api), and the record types those views embed from [`@hypercerts-org/lexicon`](https://www.npmjs.com/package/@hypercerts-org/lexicon). When the Hypercerts SDK ships its read layer, only this module should change.
- **No local bindings.** Both packages are generated from the lexicons in their own repositories and installed from npm; the app generates nothing. Keep their versions in step: `@hypercerts-org/api` declares the `@hypercerts-org/lexicon` range its types are built against.
- **Design system.** Components come from [`@hypercerts-org/ui-react`](https://github.com/hypercerts-org/hypercerts-design) with the Certified theme (`data-hc-theme="certified"`). `src/app/globals.css` adds layout only.
- **Tiles.** Each tile in `src/components/tiles.tsx` fetches its own data and streams in behind its own Suspense boundary, so a page can show, hide or reorder tiles independently.
- **Sign-in.** The server is the OAuth client (`@atproto/oauth-client-node`) and keeps each account's tokens in Redis (standard `redis` client), so it can later write and sign records for the user. The browser gets only a session cookie: a random token whose SHA-256 hash keys the session in Redis. `src/lib/auth/dal.ts` is the only way to ask who is signed in (`getUser()`, a private cache per the Next.js guide on authentication with Cache Components, no PDS calls) or to get a session for PDS calls (`getOAuthSession()`, Server Actions and Route Handlers only, refreshes tokens). Sign-in and sign-out are Server Actions; the callback is a Route Handler. The header's account area reads the session inside a Suspense boundary, so public pages keep their cached shell.
- **Sign-in safeguards.**
  - The OAuth client (PAR, PKCE, DPoP, issuer checks) and its outbound fetch (atproto's `safeFetchWrap`: no private addresses, size-capped responses) are atproto's own; the app adds stores, a lock and the session cookie.
  - A sign-in is bound to the browser that started it: a nonce in a cookie must match the one in the OAuth state (RFC 9700 4.7), so nobody can sign a victim in to their own account with a callback link.
  - A Redis lock serializes token refreshes across server instances, since a refresh token can be used once and a concurrent refresh would get the session revoked.
  - Every Redis failure becomes `StoreUnavailableError`: a Redis outage fails requests but never signs anyone out.
  - Starting a sign-in is limited to 10 per IP address per minute. Cookies are `__Host-` prefixed over https.
  - All browsers signed in to one account share its OAuth session; signing out revokes the tokens only when the last of them signs out.
- **Writes.** `src/lib/hypercerts/writes.ts` is the only code that writes to a repository, the counterpart of `queries.ts`; when the Hypercerts SDK ships its write layer, only this module should change. A Server Action authenticates, reads the current record from the user's PDS (the index may lag), applies the change, validates it against the lexicon, signs it and writes it with compare-and-swap on the version the user edited. Writes report three outcomes: stored, refused (nothing written), or unknown (the answer was lost; the client reads the PDS to find out, never retries blindly).
- **Record signing.** Every record the app writes carries an `app.certified.signature.defs#createdVia` signature, made by `src/lib/atproto/created-via.ts` with the SDK record-signing spec's `RecordSigner` contract. Deployed, the key is published in the app's `did:web` document at `/.well-known/did.json` (fragment `#created-via`, as on the current certified.app); locally it is a `did:key`. A unit test verifies signatures with the lexicon README's own procedure and encoder.
- **Write overlay.** The PDS confirms a save before the API's index shows it. The browser keeps each save in IndexedDB (Dexie) and shows it over indexed data until an uncached index read returns the exact saved CID, then keeps it as a guard against a later stale read; TanStack Query does the polling (backing off to 30 s) and the PDS check for unknown outcomes. The rules are pure functions in `src/lib/writes/profile-overlay.ts`, unit-tested. Saves to one account are serialized across tabs with Web Locks. Signing out clears the store. It covers the profile name and description on the account page and in the header, not account names in listings.
- **Load more.** The first page is server-rendered; later pages come from the GET route handlers, which call the same cached functions and send `Cache-Control: public, s-maxage=60, stale-while-revalidate=600`. The client deduplicates by URI across pages.

## Spike findings

Known challenges and our current answers. These feed the architecture notes and upstream issues.

1. **`@atproto/lex` 0.4.2 generates broken imports** when a query lives under a record NSID (`org.hypercerts.collection.getCollection`, `app.certified.location.getLocation`): it emits `./.defs`. The workaround now lives in `@hypercerts-org/api`'s generator, not in the app. Reported upstream as [bluesky-social/atproto#5738](https://github.com/bluesky-social/atproto/issues/5738), with a fix ready.
2. **Turbopack does not resolve the generated `.js` import specifiers** to `.ts` files. No longer applies: the app now imports compiled JavaScript from the packages instead of generated TypeScript.
3. **Indexed records do not always match their lexicons.** About a quarter of indexed activities fail lexicon validation: plain-string descriptions, union values without `$type`. Most were invalid when written; about 119 were valid and broke when the lexicon changed. With lex's default response validation, one such record fails the whole list request, so reads skip response validation and the mappers in `src/lib/hypercerts/views.ts` read descriptions and blob references defensively; writes validate strictly. Proposed resolution (index-time validation, repair only what our lexicon changes broke): [TECH-791](https://linear.app/hypercerts/issue/TECH-791).
4. **API views carry no handle.** Profile and actor views include the DID but not the handle, so routes use DIDs for now. Handle resolution needs an API field or a separate resolver.
5. **Avatars are blob references.** They are served through the Bluesky CDN (`cdn.bsky.app`), which fetches from the account's PDS. This avoids resolving each DID's PDS but depends on Bluesky infrastructure.
6. **`'use cache'` is per-instance memory on serverless.** Shared caching for public pages comes from Cache Components' ISR and from CDN headers on the GET route handlers, not from `'use cache'` alone.
7. **Not-found inside a streamed boundary returns HTTP 200.** An unknown account renders the not-found UI, but the status has already been sent. Acceptable for the spike; revisit before launch (for example, resolve the account before streaming).
8. **The app has to choose its slice of the data.** The network contains test records, odd definitions and anything else anyone publishes; that is normal on AT Protocol and not something this app tries to fix. A client shows only the data relevant to it. For example, a test account ("Karmas Test Org") is the second-largest badge issuer, so the landing page features a hand-picked list of issuers rather than ranking by award count. The current app also hides test records with quality labels, which the API does not expose for filtering. How v2 chooses its slice beyond hand-picked lists is not decided.

### Badge awards

The Badges awarded tile groups the awards an account has issued by badge definition and counts award records. It does not interpret what a badge means: `badgeType` and `description` are free text chosen by the issuer, and the meaning is theirs to state. Counts are from 2026-10-29.

9. **No count endpoint.** Counting an account's awards, or the awards per definition, needs every award it has issued. `getAwardsIssued` pages through `listBadgeAwards` (GainForest: 1,044 awards, 11 requests, about 3 seconds uncached) and caps at 2,000 awards. Proposed: `totalCount` on `listBadgeAwards` ([TECH-810](https://linear.app/hypercerts/issue/TECH-810)), and possibly a grouped count per definition later.

Observed in the badge data, no action: definitions with the same title from different issuers ("Ma Earth Round 3" is defined by both Ma Earth and GainForest); awards of definitions owned by someone else (allowed by design: the lexicon says that without `allowedIssuers`, anyone may issue a badge); subjects that are accounts or records; all 1,424 awards from the four featured issuers unanswered; one self-award and several unused definitions. These are network data, not obstacles to building the app; the app shows them as they are.

## Not verified yet

- Deployment on Vercel and measured latency from the deployment region.
- A real profile save against a PDS (the signer is unit-tested and the record round trip was checked against live profiles; the overlay was exercised with simulated saves).
- On a reload while a save is syncing, the server-rendered page shows the indexed name for a moment before the overlay restores the saved one.
- Route-specific framing headers. The embed works in a cross-origin iframe because no route sends `X-Frame-Options` or CSP `frame-ancestors`; every other page can be framed too. Restrict framing to `/embed/*` before sign-in arrives.

Checked 2026-11-09 against the dev server in headless Chromium, with the browser in Europe/Stockholm, America/Los_Angeles and Pacific/Auckland: no hydration warnings or page errors on `/`, `/explore`, `/explore?q=earth`, an organization page, a project page and the embed. "Load more" pages correctly (three rounds each) on Explore, search, an organization's Activities tile and the embed, including inside an iframe on another origin, where links open in a new tab.
