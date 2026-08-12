"use client"

import { useEffect, useState } from "react"
import { fetchNetworkActorsByDids } from "@/lib/atproto/workspace"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"

/**
 * Loads the entire endorsement + award network as a graph: every user who
 * has given or received at least one endorsement- or award-typed badge
 * becomes a node, and each badge (issuer -> subject) becomes a directed
 * edge tagged with its `kind`. Endorsement edges whose reverse also exists
 * are flagged `mutual`; node degrees and all mutual stats are endorsement-
 * scoped (see the GraphNode field docs).
 *
 * Data path:
 *   1. Paginate the `AllEndorsements` indexer op once per badge type
 *      ("endorsement" and "award", network-wide) — see
 *      OPERATIONS.AllEndorsements in src/app/api/indexer/route.ts. Each
 *      award carries the issuer's denormalised profile inline
 *      (`issuer { ... }`). Award-typed badges usually target a *record*
 *      (strong ref) rather than an account; the at:// authority of the
 *      subject URI identifies the owning account for the edge.
 *   2. Subjects that never issued an award have no inline profile, so we
 *      resolve those DIDs via `fetchNetworkActorsByDids` (chunked to the
 *      upstream 100-DIDs-per-call cap).
 *
 * Mirrors the module-cache + AbortController conventions in
 * use-received-endorsements.ts.
 */

const INDEXER_PROXY_URL = "/api/indexer"
const PAGE_SIZE = 100
/** Hard cap so a pathological dataset can't loop forever / OOM the
 *  canvas. Surfaced to the UI via `truncated`. */
const SAFETY_CAP = 10_000
/** Upstream `NetworkActorsByDids` returns at most 100 nodes per call. */
const PROFILE_CHUNK = 100
/** Max participants (highest-degree first) to resolve handles for via the
 *  DID resolver. Bounds fan-out on large networks; covers the sidebar
 *  rankings and any node a user is likely to hover/inspect. */
const HANDLE_RESOLVE_CAP = 600

export interface GraphNode {
  /** DID — the node id react-force-graph keys on. */
  id: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  /** Distinct users this account has endorsed. Endorsement-typed edges
   *  only — award edges colour the canvas but stay out of the node
   *  metrics, whose consumers (rankings, panel counts, node sizing) are
   *  all labelled in endorsement terms. */
  given: number
  /** Distinct users who have endorsed this account (endorsement-typed
   *  edges only, as above). */
  received: number
  /** Distinct neighbours with a mutual (bidirectional) endorsement. */
  mutual: number
}

/** Badge type behind an edge — drives link colour and the kind filter. */
export type GraphLinkKind = "endorsement" | "award"

export interface GraphLink {
  /** Issuer DID. */
  source: string
  /** Subject DID. */
  target: string
  /** Badge type of the underlying award record. */
  kind: GraphLinkKind
  /** True when the reverse endorsement edge (target -> source) also
   *  exists. Mutuality is an endorsement-only concept — award edges are
   *  never flagged (a reciprocal award pair still renders as two one-way
   *  amber arrows). */
  mutual: boolean
}

export interface EndorsementGraph {
  nodes: GraphNode[]
  links: GraphLink[]
  /** Raw count of endorsement-typed award records (not deduped edges). */
  totalEndorsements: number
  /** Raw count of award-typed badge records (not deduped edges). */
  totalAwards: number
  /** Number of unordered pairs endorsing each other both ways
   *  (endorsement-typed edges only). */
  mutualPairs: number
  /** True when the scan hit SAFETY_CAP and the graph is a subset. */
  truncated: boolean
}

interface IndexerIssuerBlock {
  did?: string | null
  handle?: string | null
  displayName?: string | null
  avatarCid?: string | null
  pds?: string | null
}

interface AllEndorsementsNode {
  uri: string
  createdAt?: string | null
  note?: string | null
  /** Issuer DID (the award's author). */
  did: string
  /** Union: account subjects carry `did`, record subjects (strong refs —
   *  the common shape for award-typed badges) carry the record `uri`. */
  subject?: { __typename?: string; did?: string | null; uri?: string | null } | null
  issuer?: IndexerIssuerBlock | null
  /** Recipient's latest accept/reject response. Rejected awards are
   *  hidden from the graph (the subject opted out of showing it). */
  response?: { state?: string | null } | null
}

interface ProfileLite {
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

function avatarUrlFromCid(did: string, cid: string | null | undefined): string | null {
  if (!cid || !/^[A-Za-z0-9]+$/.test(cid)) return null
  return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

/**
 * Account DID a badge points at. Account subjects carry it directly.
 * Record subjects (strong refs) yield the at:// authority — the DID of
 * the repo the awarded record lives in — but only for award-typed
 * badges: endorsements are person-to-person by design, and record-
 * subject endorsements were dropped before awards existed, so keeping
 * them out preserves the endorsement graph exactly.
 */
function subjectAccountDid(
  subject: AllEndorsementsNode["subject"],
  kind: GraphLinkKind,
): string | null {
  if (!subject) return null
  if (typeof subject.did === "string" && subject.did.startsWith("did:")) {
    return subject.did
  }
  if (kind === "award" && typeof subject.uri === "string" && subject.uri.startsWith("at://did:")) {
    const authority = subject.uri.slice("at://".length).split("/", 1)[0]
    if (authority.startsWith("did:")) return authority
  }
  return null
}

async function fetchAllAwards(
  badgeType: GraphLinkKind,
  signal?: AbortSignal,
): Promise<{ nodes: AllEndorsementsNode[]; truncated: boolean }> {
  const out: AllEndorsementsNode[] = []
  let cursor: string | null = null
  let truncated = false
  while (out.length < SAFETY_CAP) {
    // GET contract: same response body as the POST form, with the
    // operation variables carried as query params.
    const params = new URLSearchParams({
      op: "AllEndorsements",
      badgeType,
      first: String(PAGE_SIZE),
    })
    if (cursor) params.set("after", cursor)
    const res = await fetch(`${INDEXER_PROXY_URL}?${params.toString()}`, { signal })
    if (!res.ok) {
      let detail = ""
      try {
        const body = (await res.json()) as { error?: string }
        if (typeof body.error === "string") detail = `: ${body.error}`
      } catch {
        // non-JSON body — fall through to status-only message
      }
      throw new Error(`Indexer query failed: ${res.status}${detail}`)
    }
    const json = (await res.json()) as {
      data?: {
        appCertifiedBadgeAward?: {
          edges: { node: AllEndorsementsNode | null }[]
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
        } | null
      } | null
    }
    const conn = json.data?.appCertifiedBadgeAward
    if (!conn) break
    for (const edge of conn.edges) {
      if (edge.node) out.push(edge.node)
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
    cursor = conn.pageInfo.endCursor
  }
  if (out.length >= SAFETY_CAP) truncated = true
  return { nodes: out, truncated }
}

async function buildGraph(signal?: AbortSignal): Promise<EndorsementGraph> {
  // One paginated scan per badge type; the two run concurrently.
  const [endorsementScan, awardScan] = await Promise.all([
    fetchAllAwards("endorsement", signal),
    fetchAllAwards("award", signal),
  ])
  if (signal?.aborted) throw new DOMException("aborted", "AbortError")
  const truncated = endorsementScan.truncated || awardScan.truncated

  // Authoritative profiles, filled from the actor-profile index below.
  const profiles = new Map<string, ProfileLite>()
  // Handles, keyed by DID. The award's issuer join is the ONLY source of
  // handles (the actor-profile index doesn't expose handle), so capture
  // them here while scanning awards.
  const handleByDid = new Map<string, string>()
  // Fallback name/avatar from the issuer join — usually null (the join
  // only reliably carries handle today), but used if the actor-profile
  // lookup misses a DID.
  const fallback = new Map<string, { displayName: string | null; avatarUrl: string | null }>()
  // Deduped directed edges, keyed "kind:issuer->subject" (NUL-separated)
  // so an endorsement and an award between the same pair stay separate
  // edges.
  const edgeKeys = new Set<string>()
  const edges: { source: string; target: string; kind: GraphLinkKind }[] = []
  let totalEndorsements = 0
  let totalAwards = 0

  const scans: { kind: GraphLinkKind; awards: AllEndorsementsNode[] }[] = [
    { kind: "endorsement", awards: endorsementScan.nodes },
    { kind: "award", awards: awardScan.nodes },
  ]
  for (const { kind, awards } of scans) {
    for (const a of awards) {
      const issuerDid = typeof a.did === "string" ? a.did : null
      const subjectDid = subjectAccountDid(a.subject, kind)
      if (!issuerDid || !subjectDid) continue
      if (issuerDid === subjectDid) continue // drop self-endorsements
      if (a.response?.state === "rejected") continue // hide rejected awards

      if (kind === "endorsement") totalEndorsements++
      else totalAwards++

      // The issuer join carries the handle (and rarely displayName/avatar).
      if (a.issuer) {
        if (typeof a.issuer.handle === "string" && !handleByDid.has(issuerDid)) {
          handleByDid.set(issuerDid, a.issuer.handle)
        }
        if (!fallback.has(issuerDid)) {
          fallback.set(issuerDid, {
            displayName:
              typeof a.issuer.displayName === "string" ? a.issuer.displayName : null,
            avatarUrl: avatarUrlFromCid(issuerDid, a.issuer.avatarCid),
          })
        }
      }

      const key = `${kind} ${issuerDid} ${subjectDid}`
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key)
        edges.push({ source: issuerDid, target: subjectDid, kind })
      }
    }
  }

  // Resolve displayName + avatar for EVERY participant from the actor-
  // profile index. The award's issuer join returns those fields as null
  // (only handle + did are reliable), so resolving all DIDs here — not
  // just pure receivers — is what gives issuers their names and avatars.
  const allDids = new Set<string>()
  for (const e of edges) {
    allDids.add(e.source)
    allDids.add(e.target)
  }
  const allDidList = [...allDids]
  const chunks: string[][] = []
  for (let i = 0; i < allDidList.length; i += PROFILE_CHUNK) {
    chunks.push(allDidList.slice(i, i + PROFILE_CHUNK))
  }
  // Chunks are independent indexer calls — run them in parallel. Merge
  // order is irrelevant: entries are keyed by DID and chunks are disjoint.
  const chunkResults = await Promise.all(
    chunks.map((chunk) => fetchNetworkActorsByDids(chunk, signal)),
  )
  if (signal?.aborted) throw new DOMException("aborted", "AbortError")
  for (const actors of chunkResults) {
    for (const actor of actors) {
      profiles.set(actor.did, {
        handle: handleByDid.get(actor.did) ?? null,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      })
    }
  }

  // Compute degrees + mutual flags.
  const givenCount = new Map<string, number>()
  const receivedCount = new Map<string, number>()
  const mutualNeighbours = new Map<string, Set<string>>()
  let mutualPairs = 0

  const links: GraphLink[] = edges.map((e) => {
    // Degrees and mutuality are endorsement-only, mirroring the GraphNode
    // field docs: every consumer of these numbers (rankings, panel counts,
    // node sizing) is labelled in endorsement terms, and A awarding B back
    // (or B awarding A after an endorsement) stays two one-way edges.
    const reverse =
      e.kind === "endorsement" &&
      edgeKeys.has(`${e.kind} ${e.target} ${e.source}`)
    if (e.kind === "endorsement") {
      givenCount.set(e.source, (givenCount.get(e.source) ?? 0) + 1)
      receivedCount.set(e.target, (receivedCount.get(e.target) ?? 0) + 1)
    }
    if (reverse) {
      // Count each unordered mutual pair once.
      if (e.source < e.target) mutualPairs++
      for (const [a, b] of [
        [e.source, e.target],
        [e.target, e.source],
      ]) {
        let set = mutualNeighbours.get(a)
        if (!set) {
          set = new Set<string>()
          mutualNeighbours.set(a, set)
        }
        set.add(b)
      }
    }
    return { source: e.source, target: e.target, kind: e.kind, mutual: reverse }
  })

  // The actor-profile index has no handle field and incomplete avatar
  // coverage, while the award join only carries handles for issuers. Fill
  // the gaps with the batched DID resolver (handle + displayName + avatar
  // from the DID doc / PDS), highest-degree first and capped so a large
  // network doesn't fan out unboundedly. We resolve any node still missing
  // a handle OR an avatar — that covers the sidebar rankings, the detail
  // box's neighbour avatars, and any node a user is likely to inspect.
  const degree = (d: string) =>
    (givenCount.get(d) ?? 0) + (receivedCount.get(d) ?? 0)
  const needResolve = [...allDids]
    .filter((d) => !handleByDid.has(d) || !profiles.get(d)?.avatarUrl)
    .sort((a, b) => degree(b) - degree(a))
    .slice(0, HANDLE_RESOLVE_CAP)
  const resolved = await Promise.all(
    needResolve.map((d) => loadResolvedProfile(d).then((r) => [d, r] as const)),
  )
  if (signal?.aborted) throw new DOMException("aborted", "AbortError")
  for (const [did, r] of resolved) {
    if (!r) continue
    if (r.handle) handleByDid.set(did, r.handle)
    // Merge as fallback — prefer the actor-profile index values already in
    // `profiles`, fill anything still missing from the resolver.
    const existing = profiles.get(did)
    profiles.set(did, {
      handle: existing?.handle ?? r.handle ?? null,
      displayName: existing?.displayName ?? r.displayName ?? null,
      avatarUrl: existing?.avatarUrl ?? r.avatar ?? null,
    })
  }

  const nodes: GraphNode[] = [...allDids].map((did) => {
    const p = profiles.get(did)
    const fb = fallback.get(did)
    return {
      id: did,
      // Handle only comes from the issuer join; keep it even when the
      // actor-profile lookup missed this DID.
      handle: p?.handle ?? handleByDid.get(did) ?? null,
      displayName: p?.displayName ?? fb?.displayName ?? null,
      avatarUrl: p?.avatarUrl ?? fb?.avatarUrl ?? null,
      given: givenCount.get(did) ?? 0,
      received: receivedCount.get(did) ?? 0,
      mutual: mutualNeighbours.get(did)?.size ?? 0,
    }
  })

  return { nodes, links, totalEndorsements, totalAwards, mutualPairs, truncated }
}

// --------------------------------------------------------------------------
// Module-level cache (single network-wide dataset). 5-min stale, like the
// received-endorsements scan.
// --------------------------------------------------------------------------

const STALE_MS = 5 * 60 * 1000
let cache: { data: EndorsementGraph; fetchedAt: number } | null = null
let inFlight: Promise<EndorsementGraph> | null = null

export function useEndorsementGraph(): {
  graph: EndorsementGraph | null
  isLoading: boolean
  error: string | null
} {
  const [graph, setGraph] = useState<EndorsementGraph | null>(() =>
    cache && Date.now() - cache.fetchedAt < STALE_MS ? cache.data : null,
  )
  const [isLoading, setIsLoading] = useState<boolean>(() => !graph)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const run = async () => {
      if (cache && Date.now() - cache.fetchedAt < STALE_MS) {
        setGraph(cache.data)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        // Coalesce concurrent mounts onto one network scan. The scan
        // itself isn't tied to a single component's signal so a remount
        // doesn't kill an in-flight fetch others are awaiting.
        if (!inFlight) {
          inFlight = buildGraph().then((data) => {
            cache = { data, fetchedAt: Date.now() }
            return data
          })
          inFlight.finally(() => {
            inFlight = null
          })
        }
        const data = await inFlight
        if (cancelled || controller.signal.aborted) return
        setGraph(data)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Failed to load endorsement graph")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return { graph, isLoading, error }
}
