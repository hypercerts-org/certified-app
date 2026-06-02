# Fix: author/contributor 429s on explore + activity detail

## Symptom
On `/explore` and the activity (cert) detail page, author bylines and the
contributor list sometimes fail to load; the console shows
`Failed to load resource: the server responded with a status of 429`.

## Root cause
`/api/resolve-did` is rate-limited to **60 requests/min per IP** (and per
session DID). The byline + contributor components each resolve **one DID per
row** on mount, with no HTTP-level batching:

- `ActivityAuthor` (`activity-author.tsx`) → `useAuthorInfo(did)` → one
  `GET /api/resolve-did?did=` per cert row.
- `ActivityContributor` → `useContributorInfo(identity)` → one request per
  contributor.
- `useAuthorNamesMap` → `Promise.all(dids.map(fetchName))` — fans out one
  request per DID at once.

A page with 30+ distinct authors plus a detail page's contributors blows the
60/min window. Two amplifiers:

1. **No denormalized fallback.** Unlike account rows (which prefer
   `actor.displayName` and only fall back to a lookup), the raw `ActivityRecord`
   carries only the author DID, so the byline always resolves over the network.
2. **No negative caching.** On error, `useAuthorInfo` / `useContributorInfo`
   do `cache.delete(did)` and rethrow. The failed row settles to a skeleton/error
   and never recovers on that view; remounts (virtualized lists, tab switches,
   StrictMode) re-fire against the still-limited endpoint.

## Fix
Collapse N requests into one, the same way the home feed already avoids N
lookups (it denormalizes author profiles inline).

1. **Batch endpoint** `POST /api/resolve-dids` — accepts `{ identities: string[] }`
   (DID or handle, capped at 50), resolves each with bounded server-side
   concurrency, returns `{ results: { [input]: payload | null } }`. Reuses the
   exact per-DID resolution from the GET route (extracted to `resolve-core.ts`),
   so certs/bsky precedence and the indexer fast-path are unchanged. One
   rate-limit hit per batch instead of per DID.
2. **Client coalescer** `src/lib/atproto/resolve-did-batch.ts` — DataLoader-style.
   `loadResolvedProfile(identity)` returns a cached/in-flight promise or queues
   the identity; a short timer flushes the queue as chunked POSTs (<=50).
   Resilient failure: on 429/batch error it resolves to a DID fallback and
   negative-caches with a TTL so the row degrades gracefully and self-heals on a
   later view instead of looping.
3. **Rewire the three hooks** (`use-author-info`, `use-contributor-info`,
   `use-author-names-map`) onto the coalescer. Public APIs unchanged.

## Files (disjoint)
- NEW `src/app/api/resolve-did/resolve-core.ts` — shared resolution (moved from route).
- EDIT `src/app/api/resolve-did/route.ts` — thin GET wrapper over resolve-core.
- NEW `src/app/api/resolve-dids/route.ts` — batch POST.
- NEW `src/lib/atproto/resolve-did-batch.ts` — client coalescer.
- EDIT `src/hooks/use-author-info.ts`, `use-contributor-info.ts`, `use-author-names-map.ts`.
- NEW tests: coalescer (mock fetch), batch route (mirror resolve-did rate-limit suite).

## Out of scope
- Denormalizing the author profile into the explore/feed indexer query (a bigger
  indexer-side change; the batch endpoint solves the 429 without it).
- Changing the 60/min limit (batching makes raising it unnecessary).

## Acceptance
- tsc clean; eslint no new; vitest green (existing 519 + new); `next build` compiles.
- Existing `resolve-did/__tests__` (rate-limit, fastpath, fallback-precedence)
  still pass unchanged (GET behaviour byte-identical).
- A render pass needing K authors issues `ceil(K/50)` requests, not K.
- A 429 leaves bylines showing a usable fallback, not a stuck skeleton.

## Rollback
Revert the branch. The batch endpoint is additive; the GET route is unchanged
behaviourally; reverting the hooks restores the per-DID path.
