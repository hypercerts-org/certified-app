"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  awardSubjectMatchesDid,
  listAwards,
  listDefinitions,
  ENDORSEMENT_BADGE_TYPE,
  type BadgeAwardRecord,
} from "@/lib/atproto/badges"

/**
 * One endorsement received: who endorsed me, when, and the optional
 * note they left.
 */
export interface ReceivedEndorsement {
  /** AT-URI of the award record on the issuer's PDS — used as a
   *  stable key. */
  uri: string
  /** DID of the user who issued the endorsement. */
  issuerDid: string
  /** ISO timestamp from the award record. */
  createdAt: string
  note?: string
}

/**
 * Indexer query — list every DID with an `app.certified.actor.profile`
 * record. We use it as the universe of "issuers we should ask" during
 * the PDS scan below.
 *
 * This is the workaround until the indexer adds a `subjectDid` filter
 * on `appCertifiedBadgeAward` (see hb-agent/magic-indexer#65). Once
 * that lands, this whole hook collapses to a single GraphQL query.
 */
const PROFILES_QUERY = `
query ProfileDids($first: Int!, $after: String) {
  appCertifiedActorProfile(first: $first, after: $after) {
    edges { node { did } }
    pageInfo { hasNextPage endCursor }
  }
}
`

const INDEXER_PROXY_URL = "/api/indexer"

async function fetchAllProfileDids(signal?: AbortSignal): Promise<string[]> {
  const PAGE_SIZE = 100
  const SAFETY_CAP = 5_000
  const out: string[] = []
  let cursor: string | null = null
  while (out.length < SAFETY_CAP) {
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: PROFILES_QUERY,
        variables: { first: PAGE_SIZE, after: cursor },
      }),
      signal,
    })
    if (!res.ok) throw new Error(`Indexer query failed: ${res.status}`)
    const json = (await res.json()) as {
      data?: {
        appCertifiedActorProfile?: {
          edges: { node: { did: string } | null }[]
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
        } | null
      } | null
    }
    const conn = json.data?.appCertifiedActorProfile
    if (!conn) break
    for (const edge of conn.edges) {
      if (edge.node?.did) out.push(edge.node.did)
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
    cursor = conn.pageInfo.endCursor
  }
  return out
}

/**
 * For a single (issuer) DID, list every award and return those that
 * target `subjectDid`. We DELIBERATELY skip the per-issuer definition
 * lookup at this stage — many issuers will have no matching awards
 * and we save round-trips by deferring the badge-type filter until
 * after candidates are narrowed down.
 */
async function listMatchingAwards(
  issuerDid: string,
  subjectDid: string,
  signal?: AbortSignal,
): Promise<BadgeAwardRecord[]> {
  const awards = await listAwards(issuerDid, signal).catch(
    () => [] as BadgeAwardRecord[],
  )
  return awards.filter((a) => awardSubjectMatchesDid(a.value, subjectDid))
}

/**
 * Resolve which of the issuer's definitions are endorsement
 * definitions. Cached for the duration of the scan so an issuer with
 * many matching awards only triggers one definition fetch.
 */
async function getEndorsementDefUris(
  issuerDid: string,
  cache: Map<string, Set<string>>,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const cached = cache.get(issuerDid)
  if (cached) return cached
  const defs = await listDefinitions(issuerDid, signal).catch(() => [])
  const uris = new Set(
    defs
      .filter((d) => d.value.badgeType === ENDORSEMENT_BADGE_TYPE)
      .map((d) => d.uri),
  )
  cache.set(issuerDid, uris)
  return uris
}

/**
 * Run the scan: for every known certified user, list their awards,
 * keep those that target `profileDid`, then filter to awards whose
 * badge ref points at an endorsement-typed definition.
 *
 * Concurrency: we fan out awards-listings 20 issuers at a time so we
 * stay polite to certified.one and the xrpc proxy.
 */
async function scanReceivedEndorsements(
  profileDid: string,
  signal?: AbortSignal,
): Promise<ReceivedEndorsement[]> {
  const allDids = await fetchAllProfileDids(signal)
  if (signal?.aborted) return []

  const CONCURRENCY = 20
  const matchesByIssuer = new Map<string, BadgeAwardRecord[]>()

  for (let i = 0; i < allDids.length; i += CONCURRENCY) {
    if (signal?.aborted) return []
    const slice = allDids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      slice.map((d) => listMatchingAwards(d, profileDid, signal)),
    )
    for (let j = 0; j < slice.length; j++) {
      const issuer = slice[j]
      const matches = results[j]
      if (matches.length > 0) matchesByIssuer.set(issuer, matches)
    }
  }

  // For issuers with at least one candidate, fetch their definitions
  // and keep only awards that reference an endorsement-typed one.
  const defCache = new Map<string, Set<string>>()
  const out: ReceivedEndorsement[] = []
  for (const [issuer, awards] of matchesByIssuer) {
    if (signal?.aborted) return []
    const endorsementDefUris = await getEndorsementDefUris(issuer, defCache, signal)
    for (const a of awards) {
      if (!endorsementDefUris.has(a.value.badge?.uri ?? "")) continue
      out.push({
        uri: a.uri,
        issuerDid: issuer,
        createdAt: a.value.createdAt,
        note: a.value.note,
      })
    }
  }

  // Newest first.
  out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  return out
}

// ---------------------------------------------------------------------------
// Module-level cache so re-mounts (e.g. tab switches) don't rerun the scan.
// Keyed by profileDid. 5min stale time, focus-revalidate when stale.
// ---------------------------------------------------------------------------

const STALE_MS = 5 * 60 * 1000

interface CacheEntry {
  data: ReceivedEndorsement[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

/**
 * Fetch every public endorsement award targeting `profileDid` from
 * every known certified user. Scoped to the badge.{definition,award}
 * lexicons — the legacy `app.certified.temp.graph.endorsement`
 * collection is NOT consulted (hard cutover per the migration plan).
 *
 * Returns an empty list while loading, with `isLoading` true.
 */
export function useReceivedEndorsements(profileDid: string | null): {
  endorsements: ReceivedEndorsement[]
  isLoading: boolean
  error: string | null
} {
  const [endorsements, setEndorsements] = useState<ReceivedEndorsement[]>([])
  const [isLoading, setIsLoading] = useState(!!profileDid)
  const [error, setError] = useState<string | null>(null)

  const profileDidRef = useRef(profileDid)
  profileDidRef.current = profileDid

  const doScan = useCallback(async (did: string, signal?: AbortSignal) => {
    const cached = cache.get(did)
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
      setEndorsements(cached.data)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await scanReceivedEndorsements(did, signal)
      if (signal?.aborted) return
      cache.set(did, { data, fetchedAt: Date.now() })
      setEndorsements(data)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : "Failed to scan endorsements")
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!profileDid) {
      setEndorsements([])
      setIsLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    doScan(profileDid, controller.signal)
    return () => controller.abort()
  }, [profileDid, doScan])

  // Focus-revalidate when stale.
  useEffect(() => {
    const onFocus = () => {
      const did = profileDidRef.current
      if (!did) return
      const c = cache.get(did)
      if (!c || Date.now() - c.fetchedAt >= STALE_MS) {
        doScan(did)
      }
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [doScan])

  return { endorsements, isLoading, error }
}
