# Profile rendering — perf plan

## Context

Opening a profile (`/profile/[handle]`) is slow on cold loads. The client makes two sequential round-trips before the header can render, and the server-side resolve cascade hits `plc.directory` on every request.

Today's request graph (cold cache, opening `/profile/alice.bsky.social`):

```
Browser → Vercel        HTML shell (no profile data)
Browser → /api/resolve-handle?handle=…   ~200-500ms  (Bluesky public XRPC)
Browser → /api/resolve-did?did=…         ~400-1200ms (PLC + PDS + AppView in parallel)
Browser → /api/indexer (activities)      ~200-600ms  (only fires after DID is known)
Browser ← banner.jpg, avatar.jpg         ~200-800ms each (proxied through /api/xrpc/.../getBlob)
```

User sees a spinner until step 3 completes. Visible header lands somewhere around 1.5-2.5s on cold first visit.

Our entire infra is **serverless on Vercel** — every API route is a Lambda; there's no long-running server. Upstash Redis is our only cross-instance shared state.

---

## Quick wins (shipped — commit `96a8a06`)

| Change | Impact |
|---|---|
| `useUserProfile` calls `/api/resolve-did?handle=X` directly instead of `/api/resolve-handle` → `/api/resolve-did?did=Y` | One fewer client↔server round-trip per profile open (~300-800ms). |
| `Cache-Control: public, max-age=60, stale-while-revalidate=300` on `/api/resolve-did` and `/api/resolve-handle` | Repeat profile visits hit the browser cache instantly; same headers benefit every caller of resolve-did (use-profile, use-author-info, use-contributor-info, org-settings, handle-search). |

Together these cover ~60% of the perceived cold-load speedup. They do **not** address:

- First-ever visit to a profile (cold cache still pays for the PLC + PDS + AppView fan-out).
- Spinner-before-content — page is still fully client-rendered.
- Image fetches still serialized after the resolve completes.
- The activities-tab fetch still runs separately after the header lands.

---

## Next-quarter plan

Three changes, all on the existing Vercel serverless infrastructure. No new running services.

### 1. Profile page becomes an async Server Component

Currently `src/app/profile/[handle]/page.tsx` is `"use client"` and gates the header behind `useUserProfile`'s `isLoading` state. After:

```tsx
// app/profile/[handle]/page.tsx — Server Component
import { resolveProfile } from "@/lib/profile/server"
import ProfileShell from "@/components/profile/profile-shell"

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await resolveProfile(decodeURIComponent(handle))
  return <ProfileShell profile={profile} />
}
```

`resolveProfile` runs inside the Vercel function that's serving the request. It calls the same resolve cascade `/api/resolve-did` does today (handle→DID, then parallel PDS + AppView fan-out), but the result lands in the response HTML, not in a separate JSON round-trip.

`ProfileShell` is a `"use client"` component that owns interactive behavior — tab state, follow/edit buttons, activity loading. The `"is this me"` check moves to a server-read of the session cookie (see #3 below) so the Edit button shows up in the initial HTML, not after hydration.

Stream the activities tab in a `<Suspense>` boundary so the header isn't gated on it:

```tsx
<ProfileShell profile={profile}>
  <Suspense fallback={<FeedSkeleton />}>
    <ActivitiesTab did={profile.did} />
  </Suspense>
</ProfileShell>
```

### 2. Redis-backed DID resolution cache

`resolvePdsUrl(did)` hits `plc.directory` (or DNS for did:web) on every call. DID documents change rarely — handle/key rotation is measured in months for most users. Cache in Upstash Redis with a multi-hour TTL:

```ts
// src/lib/atproto/did.ts
const DID_TTL_SECONDS = 6 * 60 * 60 // 6 hours

export async function resolvePdsUrl(did: string): Promise<string | null> {
  const key = `did-pds:${did}`
  const hit = await redis.get<string>(key)
  if (hit !== null && hit !== undefined) return hit === "" ? null : hit
  const fresh = await resolveFromPlc(did)
  await redis.set(key, fresh ?? "", { ex: DID_TTL_SECONDS })
  return fresh
}
```

Caches are *cross-instance* (any Lambda hitting the same Redis key sees the cached value). An in-process LRU on top (a `Map` checked first, falling back to Redis) is an optional micro-optimization for hot DIDs within a warm function — skip until measured.

Benefits cascade: `/api/resolve-did`, the xrpc proxy (which calls `resolvePdsUrl` for foreign-PDS routing), and the new server-rendered profile page all read from the same warm cache.

### 3. Server-readable session cookie

`useAuth()` is currently client-only — Server Components can't see the viewer's identity. To compute `isOwnProfile` server-side (so the Edit button is in the initial HTML), the server needs to read the session cookie:

```ts
// src/lib/auth/server-session.ts
import { cookies } from "next/headers"

export async function getServerSessionDid(): Promise<string | null> {
  const did = (await cookies()).get("did")?.value
  return did ?? null
}
```

Then the page:

```tsx
const [profile, viewerDid] = await Promise.all([
  resolveProfile(handleOrDid),
  getServerSessionDid(),
])
const isOwnProfile = viewerDid === profile.did
return <ProfileShell profile={profile} isOwnProfile={isOwnProfile} />
```

The OAuth flow already writes a `did` cookie when a session is established. Reading it server-side is just `cookies().get(...)`. The client `useAuth()` hook continues to work for interactive flows (switch-org, sign-out, sign-in modal).

### Resulting cold-load request graph

```
Browser → Vercel        HTML with profile header baked in (server function calls
                        resolveProfile internally; Redis cache hit on warm DIDs)
Browser → (streamed)    Activities tab content (Suspense boundary)
Browser ← banner.jpg, avatar.jpg
```

One round-trip for the visible header instead of three. Activities and images parallelize with hydration.

---

## Long-term plan: AppView for denormalized profiles

The structural fix is to build (or extend) an AppView that pre-resolves the federation legwork and exposes a single denormalized read.

bsky's `app.bsky.actor.getProfile` is the reference pattern: one HTTP call returns handle, display name, description, follower counts, avatar+banner CDN URLs. All the PLC/PDS/blob-resolution work has already happened upstream by a worker that ingests the firehose.

For certs-social, this means extending the existing `magic-indexer` (or running a sibling AppView projection):

- A worker ingests the AT Protocol firehose (or polls relevant PDSes).
- Profile records (`app.certified.actor.profile` + `app.bsky.actor.profile`) get denormalized into a `profiles` table keyed by DID, with handle, display name, description, avatar URL, banner URL, last-updated timestamp.
- A `GET /profile/:didOrHandle` endpoint on the indexer returns the row in one query (~5-20ms).

The server-rendered profile page's `resolveProfile()` then becomes:

```ts
export async function resolveProfile(handleOrDid: string) {
  const res = await fetch(`${INDEXER_URL}/profile/${encodeURIComponent(handleOrDid)}`)
  return res.json()
}
```

One upstream call. No PLC fan-out. No parallel allSettled. The body of `resolveProfile` swaps out; everything else built in the next-quarter plan stays.

### Why not just CDN-cache the existing resolve-did?

Works for repeated visits but doesn't help cold ones — the underlying `Promise.allSettled` of 3 upstream calls is still on the cold path. A public CDN entry also can't be invalidated quickly when a profile changes. An AppView gives a single index we control with write-through invalidation when the firehose surfaces an update.

### Trade-off: eventual consistency

A profile edit on a user's PDS takes seconds-to-minutes to propagate to the AppView. For most flows that's fine. For "I just edited my own profile, why is the view stale?" we either:
- Use optimistic UI on the client (the editor already has the new value locally; render that), and prioritize ingestion of the editor's own DID.
- Bypass the AppView on the own-profile read and go direct to the user's PDS for the first N seconds after an edit.

bsky lives with the same gap.

---

## Architectural impact

The next-quarter changes introduce **five patterns the codebase doesn't currently have**. Each is small in isolation but they compound — a one-page "how this works" doc should ship alongside the first refactor.

### A. Server shell + client island pattern

Today every page under `src/app/` (except `layout.tsx`) is a client component. After this, the profile page is a hybrid:

- **Server**: data resolution, identity, cookie-read, anything that depends on server-only state (env, edge cache).
- **Client**: interactivity, viewer-dependent UI, anything that mutates.

This is the first hybrid page in the codebase. The split will propagate — once profile uses it, `/activity/[did]/[rkey]` and other content-detail routes should too. Same shape, same wins.

### B. Auth becomes dual-layered

`useAuth()` stays for interactive flows (sign-in modal, switch-org, sign-out). A parallel server-side read (`getServerSessionDid()`) appears for SSR. Both must agree about what "logged in" means. Single source of truth = the session cookie; two readers (server + client) that read it the same way.

Drift between them is a class of bugs we don't have today. Mitigation: keep the cookie shape minimal (just the DID), and write a test that asserts server and client see the same value.

### C. A formal caching layer

Right now there's no server-side data caching. Memoized fetches, Redis-backed memoization, etc., don't exist as patterns. After this change:

| Layer | Lives in | Lifetime | Cross-instance | Invalidation |
|---|---|---|---|---|
| Function-instance Map | Lambda memory | Until instance cycles (~minutes) | No | Process exit |
| Redis (Upstash) | Upstash | TTL (we set) | Yes | `redis.del(key)` |
| Next.js `unstable_cache` / `'use cache'` | Vercel's data cache | TTL (we set) | Yes | `revalidateTag()` |
| Browser HTTP cache | Browser | `Cache-Control` directives | N/A | Browser refresh / fetch with `cache: 'no-store'` |
| Vercel CDN | Edge | `Cache-Control` / `cacheTag` | Yes | `revalidateTag()` |

Each has different invalidation semantics. **A one-page doc on "which cache lives where and how to bust it" is mandatory** before this lands, or the next debugging session goes badly.

### D. DID resolution becomes a primitive with TTL semantics

`resolvePdsUrl` today is a plain async function — every call hits PLC fresh. After caching it has a TTL contract: callers know that "the PDS endpoint for X is what it was up to 6 hours ago."

For 99% of code that's fine. **Audit needed**: ensure no caller relies on always-fresh PDS resolution. Specifically check:
- The OAuth flow — currently uses `@atproto/oauth-client-node`'s own resolver, so unaffected.
- Handle-rotation flows — if any.
- Admin tools — if any.

Document the TTL in `resolvePdsUrl`'s JSDoc.

### E. Streaming + Suspense unlock incremental rendering

With the profile page server-rendered, we can wrap the activities tab in `<Suspense>`. Header ships in the initial HTML; activities stream in when ready. This is a UX upgrade we can't get from the current all-client architecture.

Pattern extends to: feed pagination, profile sub-tabs (endorsements, comments), search results.

---

## What stays the same

- **No new running services.** Vercel serverless functions + Upstash Redis + Vercel CDN. Same infra.
- **Provider tree** (`AuthProvider`, `OrgProvider`, etc.) — still client-side, still wraps the app.
- **XRPC proxy** at `/api/xrpc/[...method]` — unchanged. The cache is in front of it, not inside it.
- **The hooks** (`useAuth()`, `useProfile()`, `useUserProfile()`, etc.) — they continue to exist for client-side flows (own-profile editing, real-time updates). They just don't gate first paint anymore.
- **Mobile layout, rails, desktop shell** — entirely unaffected.

---

## Sequencing

Per CLAUDE.md workflow (plan → review → implement → review → Draft PR → user merges), I'd ship as **three PRs**:

| PR | Scope | Risk |
|---|---|---|
| **PR-1: Redis DID cache** | Layer Redis cache over `resolvePdsUrl`. No API surface change. Audit callers. Benefits the xrpc proxy and resolve-did immediately, before any rendering changes. | Low — Redis is already in the auth flow; adding another key is mechanical. |
| **PR-2: Server-readable session + server-rendered profile page** | Add `getServerSessionDid()`. Convert `/profile/[handle]/page.tsx` to Server Component. Move `useUserProfile` to receive initial data as props. Wrap activities tab in Suspense. | Medium — first hybrid page; a few subtle gotchas around hydration and own-profile detection. Needs visual smoke at every breakpoint. |
| **PR-3: Documentation + propagation** | One-page caching doc. Apply the pattern to `/activity/[did]/[rkey]`. Update DESIGN.md and AGENTS.md if relevant. | Low — once PR-2 is stable, PR-3 is mostly copying the pattern. |

The AppView (long-term) is its own multi-week project — separate plan when it's prioritized. The next-quarter work above is the prerequisite that makes the AppView payoff visible to users.

---

## Open questions

1. **TTL tuning.** 60s browser cache + 6h Redis cache feels right but isn't measured. After PR-1, add logs for cache hit rate and PLC latency; revisit.
2. **AppView build vs. integrate.** The existing `magic-indexer` already does the firehose-ingestion work for activities. Extending it for profiles is the cheaper path. Owners need to weigh in.
3. **Invalidation on own-profile edits.** When a user saves their profile, we need to bust their cache entry in Redis and the Vercel data cache. Wire `revalidateTag(\`profile:${did}\`)` into the edit-save handler. Specific to PR-2.
4. **Image proxy CDN caching.** `/api/xrpc/com.atproto.sync.getBlob` should set `Cache-Control: public, max-age=31536000, immutable` (blob CIDs are content-addressed; the bytes never change). Not strictly in this plan but adjacent — fold into PR-1 or do separately?
