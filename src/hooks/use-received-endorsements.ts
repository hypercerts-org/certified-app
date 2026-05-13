"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  listDefinitions,
  resolveResponseState,
  ENDORSEMENT_BADGE_TYPE,
} from "@/lib/atproto/badges"
import { useProfileResponses } from "@/hooks/use-profile-responses"

/**
 * One endorsement received: who endorsed me, when, and the optional
 * note they left.
 */
export interface ReceivedEndorsement {
  /** AT-URI of the award record on the issuer's PDS — used as a
   *  stable key. */
  uri: string
  /** CID of the award record — needed to build a strongRef when
   *  the recipient writes a response (accept/reject) against this
   *  award. */
  cid: string
  /** DID of the user who issued the endorsement. */
  issuerDid: string
  /** ISO timestamp from the award record. */
  createdAt: string
  note?: string
}

/**
 * Indexer query — pull every badge.award whose `subject` resolves to
 * the given DID across both lexicon refs of the subject union
 * (app.certified.defs#did `{did: "..."}` AND
 * com.atproto.repo.strongRef `{uri: "at://<did>/..."}`). Subject
 * filter lives in the indexer (see hb-agent/magic-indexer#65 + the
 * #78 follow-up that added the defs#did object branch).
 *
 * This collapses what used to be a PDS fan-out across every certified
 * user (N round-trips) into one query.
 */
const RECEIVED_AWARDS_QUERY = `
query ReceivedEndorsements($did: String!, $first: Int!, $after: String) {
  appCertifiedBadgeAward(
    where: { subject: { eq: $did } }
    first: $first
    after: $after
  ) {
    edges { node { uri cid did createdAt note badge } }
    pageInfo { hasNextPage endCursor }
  }
}
`

const INDEXER_PROXY_URL = "/api/indexer"

/**
 * The indexer currently serializes the `badge` strongRef as a
 * stringified Go map literal (`"map[cid:bafy... uri:at://...]"`)
 * rather than as structured JSON. Pull the URI out with a regex
 * so we can match awards to their issuer's endorsement definitions.
 *
 * If the indexer fix ships and `badge` becomes structured JSON,
 * this helper becomes a no-op for that shape but stays for backwards
 * compatibility.
 */
function extractBadgeDefinitionUri(badge: unknown): string | null {
  if (!badge) return null
  if (typeof badge === "string") {
    // Go map literal: "map[cid:... uri:at://.../app.certified.badge.definition/...]"
    const m = badge.match(/uri:(at:\/\/\S+)/)
    return m?.[1] ?? null
  }
  if (typeof badge === "object" && "uri" in badge) {
    const uri = (badge as { uri?: unknown }).uri
    return typeof uri === "string" ? uri : null
  }
  return null
}

interface IndexerAwardNode {
  uri: string
  cid: string
  did: string
  createdAt: string
  note?: string
  badge: unknown
}

async function fetchReceivedAwardsFromIndexer(
  profileDid: string,
  signal?: AbortSignal,
): Promise<IndexerAwardNode[]> {
  const PAGE_SIZE = 100
  const SAFETY_CAP = 10_000
  const out: IndexerAwardNode[] = []
  let cursor: string | null = null
  while (out.length < SAFETY_CAP) {
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: RECEIVED_AWARDS_QUERY,
        variables: { did: profileDid, first: PAGE_SIZE, after: cursor },
      }),
      signal,
    })
    if (!res.ok) throw new Error(`Indexer query failed: ${res.status}`)
    const json = (await res.json()) as {
      data?: {
        appCertifiedBadgeAward?: {
          edges: { node: IndexerAwardNode | null }[]
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
  return out
}

/**
 * For each unique issuer that endorsed `profileDid`, ask the issuer's
 * PDS which of their definitions are endorsement-typed. Cached so an
 * issuer with multiple awards on this profile only triggers one
 * definition fetch.
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
 * Run the scan: one indexer query for awards-targeting-me, then per
 * unique issuer load their definitions and keep awards whose badge
 * ref points at an endorsement-typed one.
 */
async function scanReceivedEndorsements(
  profileDid: string,
  signal?: AbortSignal,
): Promise<ReceivedEndorsement[]> {
  const awards = await fetchReceivedAwardsFromIndexer(profileDid, signal)
  if (signal?.aborted) return []

  const defCache = new Map<string, Set<string>>()
  const out: ReceivedEndorsement[] = []
  for (const a of awards) {
    if (signal?.aborted) return []
    const defUri = extractBadgeDefinitionUri(a.badge)
    if (!defUri) continue
    const endorsementDefUris = await getEndorsementDefUris(a.did, defCache, signal)
    if (!endorsementDefUris.has(defUri)) continue
    out.push({
      uri: a.uri,
      cid: a.cid,
      issuerDid: a.did,
      createdAt: a.createdAt,
      note: a.note,
    })
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
 * Read the cached scan result for a DID without triggering a
 * network fetch. Used by `usePendingAwardsCount` on the nav rail —
 * we don't want the nav-rail render on every authed page to kick
 * off a fan-out scan (R2 I-1). Callers get `null` when the cache
 * is cold; the chip stays hidden until something else populates
 * the cache (typically when the user actually visits /endorsements
 * or their own profile).
 */
export function peekCachedReceivedEndorsements(
  profileDid: string | null,
): ReceivedEndorsement[] | null {
  if (!profileDid) return null
  const entry = cache.get(profileDid)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt >= STALE_MS) return null
  return entry.data
}

/**
 * Fetch every public endorsement award targeting `profileDid`, AND
 * filter out awards whose latest response (on the profile owner's
 * PDS) is `"rejected"`. Scoped to the badge.{definition,award,response}
 * lexicons — the legacy `app.certified.temp.graph.endorsement`
 * collection is NOT consulted (hard cutover per the migration plan).
 *
 * Fetch shape:
 *   1. One indexer GraphQL query for awards-targeting-me (subject
 *      filter on `appCertifiedBadgeAward`).
 *   2. Per unique issuer in the result: one PDS `listDefinitions`
 *      call to verify their badge is endorsement-typed.
 *   3. One PDS `listResponses` on the profile owner for the
 *      response-state filter.
 *
 * Previously this fanned out `listAwards` across every certified
 * user (~14 round-trips today, growing linearly). With the indexer's
 * `subject: DIDFilterInput` (magic-indexer #65 + #78) the awards
 * fan-out collapses to a single query.
 *
 * Returns the **visible** awards only. Per-award response state is
 * deliberately not returned to non-owner viewers (privacy: R2 C7).
 * Owner-side surfaces compute their own state via
 * `useOwnResponseStates` (a separate hook) keyed on the same
 * underlying module cache, so callers don't double-fetch.
 *
 * Returns an empty list while loading, with `isLoading` true.
 */
export function useReceivedEndorsements(profileDid: string | null): {
  endorsements: ReceivedEndorsement[]
  isLoading: boolean
  error: string | null
} {
  const [scanResult, setScanResult] = useState<ReceivedEndorsement[]>([])
  const [scanLoading, setScanLoading] = useState(!!profileDid)
  const [error, setError] = useState<string | null>(null)

  const profileDidRef = useRef(profileDid)
  profileDidRef.current = profileDid

  const doScan = useCallback(async (did: string, signal?: AbortSignal) => {
    const cached = cache.get(did)
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
      setScanResult(cached.data)
      setScanLoading(false)
      return
    }
    setScanLoading(true)
    setError(null)
    try {
      const data = await scanReceivedEndorsements(did, signal)
      if (signal?.aborted) return
      cache.set(did, { data, fetchedAt: Date.now() })
      setScanResult(data)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : "Failed to scan endorsements")
    } finally {
      if (!signal?.aborted) setScanLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!profileDid) {
      setScanResult([])
      setScanLoading(false)
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

  // Response join: fetch the profile-OWNER's responses (their PDS).
  // The R1 reviewer flagged "viewer's responses" as a federation bug
  // — when viewing Alice's profile we need Alice's responses, not
  // ours. The hook contract bakes the fix in by sharing the same
  // profileDid across both fetches.
  const { responses, isLoading: respLoading } = useProfileResponses(profileDid)

  // Filter out awards whose latest response is "rejected". Default
  // and unknown states pass through (default = un-responded;
  // unknown = a response value we don't recognise, treated as
  // no-op so we never silently hide on an unrecognised value).
  const endorsements = useMemo(() => {
    if (responses.length === 0) return scanResult
    return scanResult.filter((e) => {
      const { state } = resolveResponseState(e.uri, responses)
      return state !== "rejected"
    })
  }, [scanResult, responses])

  return {
    endorsements,
    isLoading: scanLoading || respLoading,
    error,
  }
}
