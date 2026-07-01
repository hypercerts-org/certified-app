import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"

/**
 * Reverse-resolve an Ethereum address to its primary ENS name.
 *
 *   GET /api/ens?address=0x… → { address, name, avatar }
 *     name:   "vitalik.eth" | null
 *     avatar: "https://metadata.ens.domains/…" | null
 *
 * The app has no web3 dependency, so resolution is delegated to a public
 * ENS resolver (ensideas) server-side rather than pulling viem/ethers and
 * an RPC endpoint into the client bundle. Routing it through our own
 * origin (instead of fetching the third-party from the browser) keeps the
 * resolver swappable — a future move to an in-house RPC / subgraph only
 * touches this file — and lets us cache responses at the edge.
 *
 * Failure is never fatal: an invalid address 400s, but a flaky upstream,
 * timeout, or address with no reverse record all resolve to `name: null`
 * so the caller falls back to showing the raw address rather than erroring.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const UPSTREAM = "https://api.ensideas.com/ens/resolve/"
// 100/min by IP. Unauthenticated route (ENS rows render in signed-out /
// landing contexts), so IP is the only identifier — mirrors the
// resolve-handle proxy. Without this, an attacker can flood distinct random
// valid addresses (each a cache-miss → fresh upstream call) to burn our
// egress quota against ensideas and get our egress IP rate-limited for real
// users. enforceRateLimit fails open on Redis errors, so resolution still
// works when the limiter backend is down.
const LIMITER = makeLimiter("ens", 100, 60)
// ENS primary names change rarely; cache a day and serve stale while we
// revalidate so repeated rows / re-renders don't re-hit the upstream.
const CACHE_TTL_SECONDS = 60 * 60 * 24

function cacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`,
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const address = (request.nextUrl.searchParams.get("address") ?? "").trim()
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 })
  }

  // Throttle after validation but before the upstream fetch, so a flood is
  // rejected without ever touching ensideas. The 429 carries no cache header
  // (enforceRateLimit owns the response), so a throttle is never edge-cached.
  const rateDenied = await enforceRateLimit(LIMITER, clientIp(request))
  if (rateDenied) return rateDenied

  try {
    const res = await fetch(`${UPSTREAM}${address}`, {
      headers: { accept: "application/json" },
      next: { revalidate: CACHE_TTL_SECONDS },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { address, name: null, avatar: null },
        { headers: cacheHeaders() },
      )
    }
    const data = (await res.json()) as { name?: string | null; avatar?: string | null }
    const name =
      typeof data.name === "string" && data.name.length > 0 ? data.name : null
    // Only surface http(s) avatars — the ENS metadata service already
    // resolves NFT / ipfs avatars to a hosted image, so anything else
    // (data:, ipfs://, raw token refs) wouldn't render and is dropped.
    const avatar =
      typeof data.avatar === "string" && /^https?:\/\//.test(data.avatar)
        ? data.avatar
        : null
    return NextResponse.json({ address, name, avatar }, { headers: cacheHeaders() })
  } catch {
    // Network / timeout / parse failure — degrade to "no name" (uncached so
    // a transient blip doesn't get pinned) rather than erroring the row.
    return NextResponse.json({ address, name: null, avatar: null })
  }
}
