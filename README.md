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
| `/` | Recent activities across the network, with "load more" |
| `/explore` | Organizations, with search (`?q=`) and "load more" |
| `/{did}` | An account's page built from tiles: Activities, Projects, About, Badges received |
| `/{did}/project/{rkey}` | A project and the activities it contains |
| `/embed/activities?author={did}` | The Activities tile as an embeddable page for an `<iframe>` |
| `/api/activities`, `/api/organizations` | Later pages for "load more", as cacheable GET endpoints |

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
3. **Indexed records do not always match their lexicons.** Some production records carry a Leaflet `description` without its `$type`. With lex's default response validation, one such record fails the whole list request. These are older records, created before lexicon v0.11.0 turned `description` into a union that requires `$type`. The API will keep serving them as they are, so the app handles them: reads skip response validation, and the mappers in `src/lib/hypercerts/views.ts` use the generated types but read descriptions and blob references defensively; writes validate strictly. Whether the API's view lexicons should describe the legacy shape, so validation can stay on, is an open question for the API.
4. **API views carry no handle.** Profile and actor views include the DID but not the handle, so routes use DIDs for now. Handle resolution needs an API field or a separate resolver.
5. **Avatars are blob references.** They are served through the Bluesky CDN (`cdn.bsky.app`), which fetches from the account's PDS. This avoids resolving each DID's PDS but depends on Bluesky infrastructure.
6. **`'use cache'` is per-instance memory on serverless.** Shared caching for public pages comes from Cache Components' ISR and from CDN headers on the GET route handlers, not from `'use cache'` alone.
7. **Not-found inside a streamed boundary returns HTTP 200.** An unknown account renders the not-found UI, but the status has already been sent. Acceptable for the spike; revisit before launch (for example, resolve the account before streaming).
8. **Test data in production.** The network-wide activity list includes end-to-end test records. The current app filters these with quality labels; the API does not yet expose them for filtering here.

## Not verified yet

- No browser run: hydration warnings, the embed inside a real third-party page, and client-side "load more" have only been checked through server responses and the route handlers.
- Deployment on Vercel and measured latency from the deployment region.
