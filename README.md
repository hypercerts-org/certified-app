# certified.app v2

Work in progress: the rebuild of [certified.app](https://certified.app) as a reference implementation of the Hypercerts protocol and API. The current production app lives on `main` and `staging`; this branch (`v2`) starts from a clean slate.

This first step is a **read-only spike**: public pages backed by live data from the [Hypercerts API](https://docs.hypercerts.org/reference/services/hypercerts-api). Nothing here signs in or writes to the protocol yet.

## Running it

```bash
pnpm install
pnpm dev           # generates lexicon bindings, then starts Next.js
pnpm build         # production build (also regenerates bindings)
pnpm typecheck
pnpm lint          # Biome: lint, formatting and import order
pnpm format        # apply Biome's fixes and formatting
```

Node 24 (see `.nvmrc`). The API defaults to production, `https://api.hypercerts.dev`; set `HYPERCERTS_API_URL` to use another deployment.

## What is here

| Route | What it shows |
|---|---|
| `/` | Landing page: find your organization, and a hand-picked set of organizations that award badges |
| `/explore` | Organizations, with search (`?q=`) and "load more" |
| `/{did}` | An account's page built from tiles: Activities, Projects, Badges awarded (for accounts that have issued badge awards), About, Badges received |
| `/{did}/project/{rkey}` | A project and the activities it contains |
| `/embed/activities?author={did}` | The Activities tile as an embeddable page for an `<iframe>` |
| `/api/activities`, `/api/organizations` | Later pages for "load more", as cacheable GET endpoints (`/api/activities` takes `author` or `project`) |

## How it is put together

- **Next.js 16 App Router with Cache Components.** Pages are Server Components. Public data is read through cached functions (`'use cache'`, one-minute revalidation). Dynamic routes render a static shell and are then cached per URL (ISR), so repeat visitors are served from the cache.
- **One data module.** `src/lib/hypercerts/queries.ts` is the only code that talks to the API. It calls XRPC endpoints through an [`@atproto/lex`](https://www.npmjs.com/package/@atproto/lex) `Client`, which returns responses typed from the API's lexicons, and maps them to plain view models (`src/lib/hypercerts/views.ts`). Endpoint definitions and view types come from `src/lib/hypercerts/api.ts`, a local stand-in for the proposed `@hypercerts/api` package. When the Hypercerts SDK ships its read layer, only that module should change.
- **Generated bindings.** `lexicons/api/` holds the API's query lexicons, copied from [`hypercerts-org/api`](https://github.com/hypercerts-org/api) at `b2f89f0`. `lexicons/records/` holds the record lexicons from `@hypercerts-org/lexicon` 1.5.0, the version the API pins. `pnpm lexicons:build` generates `src/lexicons/` (not committed).
- **Design system.** Components come from [`@hypercerts-org/ui-react`](https://github.com/hypercerts-org/hypercerts-design) with the Certified theme (`data-hc-theme="certified"`). `src/app/globals.css` adds layout only.
- **Tiles.** Each tile in `src/components/tiles.tsx` fetches its own data and streams in behind its own Suspense boundary, so a page can show, hide or reorder tiles independently.
- **Load more.** The first page is server-rendered; later pages come from the GET route handlers, which call the same cached functions and send `Cache-Control: public, s-maxage=60, stale-while-revalidate=600`. The client deduplicates by URI across pages.

## Spike findings

Known challenges and our current answers. These feed the architecture notes and upstream issues.

1. **`@atproto/lex` 0.4.2 generates broken imports** when a query lives under a record NSID (`org.hypercerts.collection.getCollection`, `app.certified.location.getLocation`): it emits `./.defs`. `scripts/fix-lex-imports.mjs` rewrites them after generation. Reported upstream as [bluesky-social/atproto#5738](https://github.com/bluesky-social/atproto/issues/5738), with a fix ready.
2. **Turbopack does not resolve the generated `.js` import specifiers** to `.ts` files. Bindings are generated with extension-less imports (`--import-ext ""`).
3. **Indexed records do not always match their lexicons.** About a quarter of indexed activities fail lexicon validation: plain-string descriptions, union values without `$type`. Most were invalid when written; about 119 were valid and broke when the lexicon changed. With lex's default response validation, one such record fails the whole list request, so reads skip response validation and the mappers in `src/lib/hypercerts/views.ts` read descriptions and blob references defensively; writes validate strictly. Proposed resolution (index-time validation, repair only what our lexicon changes broke): [TECH-791](https://linear.app/hypercerts/issue/TECH-791).
4. **API views carry no handle.** Profile and actor views include the DID but not the handle, so routes use DIDs for now. Handle resolution needs an API field or a separate resolver.
5. **Avatars are blob references.** They are served through the Bluesky CDN (`cdn.bsky.app`), which fetches from the account's PDS. This avoids resolving each DID's PDS but depends on Bluesky infrastructure.
6. **`'use cache'` is per-instance memory on serverless.** Shared caching for public pages comes from Cache Components' ISR and from CDN headers on the GET route handlers, not from `'use cache'` alone.
7. **Not-found inside a streamed boundary returns HTTP 200.** An unknown account renders the not-found UI, but the status has already been sent. Acceptable for the spike; revisit before launch (for example, resolve the account before streaming).
8. **Test data in production.** Activity lists include end-to-end test records, and a test account ("Karmas Test Org") is the second-largest badge issuer, awarding "Ma Earth Round 1" and "Round 2" to 766 accounts. The current app filters with quality labels; the API does not expose them for filtering here. The landing page therefore features a hand-picked list of issuers rather than ranking by award count.

### Badge awards: what the data looks like

The Badges awarded tile groups the awards an account has issued by badge definition and counts award records. It does not interpret what a badge means: a badge may mark a funding round, a verification, an endorsement or anything else, and that is for the issuer to say. Counts below are from 2026-10-29. Building the tile surfaced these:

9. **No count endpoint.** Counting an account's awards, or the awards per definition, needs every award it has issued. `getAwardsIssued` pages through `listBadgeAwards` (GainForest: 1,044 awards, 11 requests, about 3 seconds uncached) and caps at 2,000 awards. Proposed: `totalCount` on `listBadgeAwards` ([TECH-810](https://linear.app/hypercerts/issue/TECH-810)), and possibly a grouped count per definition later.
10. **Definitions with the same title from different issuers.** Ma Earth's "Ma Earth Round 3" has 201 awards, all to records (`org.hypercerts.collection` projects). GainForest owns a separate definition with the same title, with 203 awards, all to accounts, plus definitions titled "Ma Earth", "Ma Earth Round 1" and "Ma Earth Round 2". The data has no link between definitions, so the app shows them as unrelated.
11. **Awards of a definition owned by someone else.** Restor's 10 awards all use "RestorLife 2026 Finalists", and GainForest and Silvi award "Organization Endorsement"; Ma Earth owns both definitions, and neither sets `allowedIssuers`. The tile shows "badge defined by Ma Earth" when the owner is not the issuer. What a missing `allowedIssuers` means, and how to show awards from issuers outside it, is undecided.
12. **Subjects are accounts or records.** An award's subject is a DID or a strong reference to a record. Some definitions are awarded only to accounts and others only to projects; the tile lists each subject as it is. Other record types show as "Other record".
13. **Badges are not answered.** All 1,424 awards issued by these four accounts have response status `unanswered`. The data shows that an award exists, not whether the subject accepted it. This is the pending and claim question from the product spec.
14. **Self-awards and unused definitions.** GainForest has one award of its own "Ma Earth Round 2" definition to itself, and several definitions have never been awarded by their owner (Ma Earth's "Earth Repair Fund", "Verified by Ma Earth", a second "Trusted Evaluator").

## Not verified yet

- Browser runs so far are headless Chromium screenshots of the main pages and the embed in a local HTML page; hydration warnings and "load more" have not been exercised systematically.
- Deployment on Vercel and measured latency from the deployment region.
