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
| `/` | Landing page: find your organization, and explore a hand-picked set of networks |
| `/explore` | Organizations, with search (`?q=`) and "load more" |
| `/{did}` | An account's page built from tiles: Network and Latest from the network (for accounts that award badges), Activities, Projects, About, Badges received |
| `/{did}/project/{rkey}` | A project and the activities it contains |
| `/embed/activities?author={did}` | The Activities tile as an embeddable page for an `<iframe>` |
| `/api/activities`, `/api/organizations` | Later pages for "load more", as cacheable GET endpoints (`/api/activities` takes `author`, `project` or `network`) |

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
8. **Test data in production.** Activity lists include end-to-end test records, and a test account ("Karmas Test Org") is the second-largest badge issuer, awarding "Ma Earth Round 1" and "Round 2" to 766 accounts. The current app filters with quality labels; the API does not expose them for filtering here. The landing page therefore features a hand-picked list of networks rather than ranking by size.

### Networks: what the badge data looks like

An account becomes a network by awarding badges; the Network tile groups its awards by badge definition. Building it surfaced these:

9. **No aggregate endpoint.** A network's size and programmes need every award it has issued. `getNetwork` pages through `listBadgeAwards` (GainForest: 11 requests, about 3 seconds uncached) and caps at 2,000 awards. An API method for per-badge counts would replace this.
10. **The same programme, defined twice.** Ma Earth defines "Ma Earth Round 3" and awards it to 201 projects. GainForest defines its own "Ma Earth Round 3" (plus Rounds 1 and 2, and "Ma Earth") and awards it to 203 accounts. Nothing links the two definitions, so the app cannot tell they mean the same round.
11. **Anyone can award someone else's badge.** Restor awards "RestorLife 2026 Finalists", a definition Ma Earth owns, and Ma Earth's definition sets no `allowedIssuers`. The tile shows "badge defined by Ma Earth" when the definer is not the issuer; whether an award outside `allowedIssuers` should count is undecided.
12. **Members are accounts or projects.** An award's subject is a DID or a strong reference to a record (here, `org.hypercerts.collection` projects). A network's membership mixes organizations, people and projects; other record types would show as "Other record".
13. **Badges are never answered.** Almost every award's response status is `unanswered`, so a network shows who it has recognized, not who agreed to be a member. This is the pending and claim question from the product spec.
14. **Self-awards and leftovers.** GainForest awards its own "Ma Earth Round 2" badge to itself, and several definitions have never been awarded by their owner (Ma Earth's "Earth Repair Fund", "Verified by Ma Earth", a second "Trusted Evaluator").
15. **Network activity covers 100 members.** `listActivities` accepts at most 100 authors, so "Latest from the network" reads the 100 most recently awarded members. GainForest has 827.

## Not verified yet

- Browser runs so far are headless Chromium screenshots of the main pages and the embed in a local HTML page; hydration warnings and "load more" have not been exercised systematically.
- Deployment on Vercel and measured latency from the deployment region.
