import "server-only"

import { resolvePdsUrl } from "@/lib/atproto/did"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { getBlobRefLink } from "@/lib/atproto/types"
import { guardedFetch } from "@/lib/security/ssrf"

/**
 * Server-side reading of the network for the dataset builders behind
 * /funding and /map: the indexer (with the rate-limit bypass and retries),
 * owners' repositories (PDS lookup, getRecord, JSON with SSRF guard) and a
 * few small helpers. Moved here from the funding build so both share it.
 */

export const INDEXER_URL =
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-prod.up.railway.app/graphql"

const PDS_TIMEOUT_MS = 15_000
const INDEXER_TIMEOUT_MS = 30_000


export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null
}


export function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1)
}

export function didOf(uri: string): string {
  return uri.slice(5, uri.indexOf("/", 5))
}


const pdsCache = new Map<string, Promise<string | null>>()
export function pdsFor(did: string): Promise<string | null> {
  let p = pdsCache.get(did)
  if (!p) {
    p = resolvePdsUrl(did).catch(() => null)
    pdsCache.set(did, p)
    // Don't pin a failed lookup for the life of the instance.
    p.then((v) => {
      if (!v) pdsCache.delete(did)
    })
  }
  return p
}

export async function getJson<T>(url: string, timeoutMs = PDS_TIMEOUT_MS): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await guardedFetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        headers: { accept: "application/json" },
      })
      if (res.ok) return (await res.json()) as T
      if (res.status < 500) return null
    } catch {
      // retry once
    }
  }
  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One indexer query. Sends the app's rate-limit bypass key when set (as the
 * /api/indexer proxy does): the scan is hundreds of requests from one
 * egress IP, which the indexer's per-IP limiter otherwise throttles. A 429
 * or 5xx is retried with backoff (honouring Retry-After). Returns the data,
 * or the error that ended it.
 */
export async function gqlQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  const bypassKey = process.env.INDEXER_RATELIMIT_BYPASS_KEY
  if (bypassKey) headers["X-RateLimit-Bypass"] = bypassKey
  let error: string | null = "no response"
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 600 * 2 ** (attempt - 1)) + Math.random() * 300)
    try {
      const res = await fetch(INDEXER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(INDEXER_TIMEOUT_MS),
        cache: "no-store",
      })
      if (res.status === 429) {
        error = "rate limited"
        const wait = Number(res.headers.get("retry-after"))
        if (Number.isFinite(wait) && wait > 0) await sleep(Math.min(wait, 10) * 1000)
        continue
      }
      if (!res.ok) {
        error = `HTTP ${res.status}`
        if (res.status < 500) return { data: null, error }
        continue
      }
      const body = (await res.json()) as {
        data?: T
        errors?: { message: string; extensions?: { code?: string } }[]
      }
      if (body.data) return { data: body.data, error: null }
      const err = body.errors?.[0]
      if (err) {
        error = err.message
        // A throttle or timeout reported as a GraphQL error is worth a retry;
        // anything else is a query problem that won't fix itself.
        if (/rate|limit|timeout|unavailable/i.test(`${err.extensions?.code ?? ""} ${err.message}`)) continue
        return { data: null, error }
      }
    } catch {
      error = "network error"
    }
  }
  return { data: null, error }
}

export async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await gqlQuery<T>(query, variables)
  if (error) console.warn("[indexer] error:", error)
  return data
}


export type ImageNode = {
  __typename?: string
  uri?: string | null
  image?: { ref?: string | null } | null
} | null

export function imageUrl(did: string, node: ImageNode): string | null {
  if (!node) return null
  if (node.uri && /^https:\/\//.test(node.uri)) return node.uri
  const ref = node.image?.ref
  return ref ? buildAvatarUrlFromCid(did, ref) : null
}

/** An image field as written in a record (blob ref or URI), in the
 *  indexer's shape so {@link imageUrl} can read it. */
export function recordImage(v: unknown): ImageNode {
  const o = asRecord(v)
  if (!o) return null
  const uri = asString(o.uri)
  if (uri) return { uri }
  const image = asRecord(o.image)
  if (image?.ref) {
    const ref = getBlobRefLink(image.ref)
    return ref && ref !== "undefined" ? { image: { ref } } : null
  }
  return null
}

export async function getRecordFromRepo(uri: string): Promise<Record<string, unknown> | null> {
  const did = didOf(uri)
  const rest = uri.slice(5 + did.length + 1)
  const slash = rest.indexOf("/")
  if (slash < 0) return null
  const pds = await pdsFor(did)
  if (!pds) return null
  const params = new URLSearchParams({ repo: did, collection: rest.slice(0, slash), rkey: rest.slice(slash + 1) })
  const data = await getJson<{ value?: Record<string, unknown> }>(
    `${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
  )
  return data?.value ?? null
}

