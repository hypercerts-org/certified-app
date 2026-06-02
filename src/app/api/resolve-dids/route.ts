import { NextRequest, NextResponse } from "next/server"
import { extractRouteError } from "@/lib/utils/api"
import { getSessionDid } from "@/lib/auth/session"
import { enforceRateLimitMulti, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"
import {
  buildProfilePayload,
  resolveInputToDid,
  type ResolvedProfilePayload,
} from "../resolve-did/resolve-core"

/**
 * POST /api/resolve-dids
 * Body: { identities: string[] }  (each a DID or a handle)
 *
 * Batched sibling of `GET /api/resolve-did`. Author bylines and
 * contributor lists need to resolve a whole page of identities at once;
 * doing that one GET per row blows the GET route's 60/min rate limit and
 * leaves avatars stuck (see docs/resolve-did-batch/plan.md). This route
 * resolves up to `MAX_IDENTITIES` identities in a single request — one
 * rate-limit hit for the whole page — reusing the exact same per-DID
 * resolution as the GET route, so certs/bsky precedence and the indexer
 * fast-path are identical.
 *
 * Response: { results: { [input: string]: ResolvedProfilePayload | null } }
 * keyed by the EXACT input string the client sent, so the client can map
 * each queued identity back to its result. A null value means the
 * identity didn't resolve (invalid / unknown); the client renders its
 * own fallback.
 */

// One batch == one rate-limit hit. The same 60/min budget as the GET
// route now covers 60 *pages* per minute instead of 60 rows, which is
// what removes the 429s. DID **and** IP, mirroring the GET route.
const LIMITER_DID = makeLimiter("resolve-dids-did", 60, 60)
const LIMITER_IP = makeLimiter("resolve-dids-ip", 60, 60)

/** Hard cap per request. The client chunks larger sets into multiple
 *  POSTs; this bounds the upstream fan-out a single request can trigger. */
const MAX_IDENTITIES = 50

/** Server-side fan-out concurrency. Each identity issues up to ~3
 *  upstream fetches (handle, bsky appView, certs PDS getRecord); cap how
 *  many run at once so a 50-identity batch stays polite to the upstream
 *  PDS / appView instead of opening 150 sockets at once. */
const RESOLVE_CONCURRENCY = 8

/** Resolve `items` through `worker` with at most `limit` in flight,
 *  preserving input order in the returned array. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i])
    }
  }
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    () => run()
  )
  await Promise.all(runners)
  return results
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit first — same posture as the GET route. fail-OPEN on a
    // limiter backend error (handled inside enforceRateLimitMulti).
    const sessionDid = await getSessionDid()
    const rateDenied = await enforceRateLimitMulti([
      { limit: LIMITER_DID, identifier: sessionDid ?? "anon" },
      { limit: LIMITER_IP, identifier: clientIp(request) },
    ])
    if (rateDenied) return rateDenied

    const body = (await request.json().catch(() => null)) as {
      identities?: unknown
    } | null
    const raw = body?.identities
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "Expected { identities: string[] }" },
        { status: 400 }
      )
    }

    // Normalise: strings only, trimmed, de-duplicated, blanks dropped.
    // Dedup keeps the upstream fan-out tight when a page repeats an
    // author and keeps us under MAX_IDENTITIES on real-world pages.
    const identities = Array.from(
      new Set(
        raw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean)
      )
    )

    if (identities.length > MAX_IDENTITIES) {
      return NextResponse.json(
        { error: `Too many identities (max ${MAX_IDENTITIES})` },
        { status: 400 }
      )
    }

    const results: Record<string, ResolvedProfilePayload | null> = {}
    if (identities.length === 0) {
      return NextResponse.json({ results })
    }

    const resolved = await mapWithConcurrency(
      identities,
      RESOLVE_CONCURRENCY,
      async (identity): Promise<ResolvedProfilePayload | null> => {
        try {
          const did = await resolveInputToDid(identity, identity)
          if (!did) return null
          return await buildProfilePayload(did)
        } catch {
          // One identity failing must not fail the whole batch — the
          // client renders a fallback for nulls.
          return null
        }
      }
    )
    identities.forEach((identity, i) => {
      results[identity] = resolved[i]
    })

    // No HTTP cache (POST). The client coalescer owns caching; freshness
    // for a viewer's own profile is handled by the GET route's
    // cache-busting edit path, unchanged.
    return NextResponse.json({ results })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
