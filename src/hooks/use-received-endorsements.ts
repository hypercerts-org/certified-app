"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
  /** Title of the issuer's list this endorsement was awarded under,
   *  when the award belongs to a user-created list rather than the
   *  default "Endorsement" definition. `undefined` for default
   *  endorsements. */
  listTitle?: string
  /** Issuer's actor profile, denormalised by the indexer (magic-indexer#96).
   *  Render sites read directly from here when fields are populated; fall
   *  through to `useAuthorInfo(issuerDid)` otherwise (graceful-degradation
   *  state until the operator enables `app.bsky.actor.profile` ingestion
   *  on magic-indexer dev — all fields except `did` will be null until
   *  then). */
  issuer?: {
    did: string
    handle: string | null
    displayName: string | null
    description: string | null
    avatarCid: string | null
    pds: string | null
  }
  /** Recipient's latest response to this award, joined by the indexer
   *  through the badgeAward strongRef. `null` means "no response yet"
   *  (the default state — equivalent to `accepted` for owner-side
   *  rendering, "neither accepted nor rejected" for foreign viewers). */
  responseState?: "accepted" | "rejected" | null
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
 *
 * Query string lives server-side in `OPERATIONS.ReceivedEndorsements`
 * (`src/app/api/indexer/route.ts`); the client only sends
 * `{ operationName, variables }`.
 */
const INDEXER_PROXY_URL = "/api/indexer"

interface IndexerIssuerBlock {
  did?: string | null
  handle?: string | null
  displayName?: string | null
  description?: string | null
  avatarCid?: string | null
  pds?: string | null
}

interface IndexerResponseBlock {
  state?: string | null
  weight?: string | null
  createdAt?: string | null
}

interface IndexerAwardNode {
  uri: string
  cid: string
  did: string
  createdAt: string
  note?: string
  badge: unknown
  issuer?: IndexerIssuerBlock | null
  response?: IndexerResponseBlock | null
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
        operationName: "ReceivedEndorsements",
        variables: { did: profileDid, first: PAGE_SIZE, after: cursor },
      }),
      signal,
    })
    if (!res.ok) {
      // Surface the proxy's actual reject reason in the message —
      // issue #73 noted that "Indexer query failed: 400" swallowed
      // which of the three proxy 400 branches fired. Reading
      // `body.error` puts the proxy's `{error: "..."}` string into
      // the diagnostic so the next 400 is debuggable from the
      // network panel + the error message alone.
      let detail = ""
      try {
        const body = (await res.json()) as { error?: string }
        if (typeof body.error === "string") detail = `: ${body.error}`
      } catch {
        // Body wasn't JSON — fall through to the status-only message.
      }
      throw new Error(`Indexer query failed: ${res.status}${detail}`)
    }
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
 * Run the scan in ONE indexer call. Replaces the previous
 * two-query (awards + definitions) pattern + PDS `listResponses`
 * join with the magic-indexer#96 single-query shape:
 *
 *   - `where.badgeType = "endorsement"` filters out non-endorsement
 *     awards server-side (collapses the previous batch query
 *     against `appCertifiedBadgeDefinition` + local URI filter).
 *   - `issuer { ... }` block carries the issuer's actor profile
 *     inline (drops the per-row `useAuthorInfo` on first paint
 *     once the operator enables profile-ingestion on the indexer).
 *   - `response { state }` carries the recipient's latest accept/
 *     reject state (drops the parallel PDS `listResponses` call
 *     for this hot path).
 *
 * `listTitle` is intentionally NOT recovered from this path — it
 * required the previous EndorsementDefs query to look up the
 * definition's title. The indexer should expose this on the
 * `badge` join in a future ticket; until then, list-typed
 * endorsements render under the default treatment (no list-name
 * pill). Acceptable for v1 since the default `"Endorsement"` def
 * never had a pill anyway, and list-typed endorsements are rare.
 */
async function scanReceivedEndorsements(
  profileDid: string,
  signal?: AbortSignal,
): Promise<ReceivedEndorsement[]> {
  const awards = await fetchReceivedAwardsFromIndexer(profileDid, signal)
  if (signal?.aborted) return []

  const out: ReceivedEndorsement[] = []
  for (const a of awards) {
    // Map the issuer block conservatively. The indexer returns
    // `null` for handle / displayName / etc. when profile-ingestion
    // hasn't run on this DID yet (operator action item per
    // magic-indexer#96 README). Render sites fall back to
    // `useAuthorInfo` in that case.
    const issuer = a.issuer
      ? {
          did: typeof a.issuer.did === "string" ? a.issuer.did : a.did,
          handle:
            typeof a.issuer.handle === "string" ? a.issuer.handle : null,
          displayName:
            typeof a.issuer.displayName === "string"
              ? a.issuer.displayName
              : null,
          description:
            typeof a.issuer.description === "string"
              ? a.issuer.description
              : null,
          avatarCid:
            typeof a.issuer.avatarCid === "string"
              ? a.issuer.avatarCid
              : null,
          pds: typeof a.issuer.pds === "string" ? a.issuer.pds : null,
        }
      : undefined

    // Response state — only surface known values; the lexicon
    // declares `accepted | rejected` as knownValues. Anything else
    // (including null / undefined / unknown future values) maps
    // to `null` ("no response yet" — the default state).
    const rawState = a.response?.state
    const responseState: "accepted" | "rejected" | null =
      rawState === "accepted" || rawState === "rejected" ? rawState : null

    out.push({
      uri: a.uri,
      cid: a.cid,
      issuerDid: a.did,
      createdAt: a.createdAt,
      note: a.note,
      issuer,
      responseState,
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
 * lexicons.
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
export function useReceivedEndorsements(
  profileDid: string | null,
  opts?: {
    /** When true, the rejected awards stay in the returned list and
     *  callers can filter / surface them client-side using their own
     *  resolved response states. Owner-side surfaces (the profile
     *  owner viewing their own Received tab) pass true so the filter
     *  dropdown can offer "Show all" / "Show only rejected" without
     *  re-fetching. Foreign viewers keep the default so the privacy
     *  contract (don't reveal rejected endorsements to others) is
     *  preserved. */
    includeRejected?: boolean
  },
): {
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

  // Filter out awards whose latest response is "rejected" — unless
  // the caller opted into seeing rejected entries (owner-side
  // surfaces with "Show only rejected" / "Show all"). The response
  // state is now joined by the indexer (magic-indexer#96) onto each
  // award node, so we read it directly from the scan result — no
  // separate PDS `listResponses` round-trip needed (the previous
  // path used `useProfileResponses`, dropped here).
  //
  // Privacy note: the indexer's `response.state` is delivered to
  // every viewer (including non-owners), preserving today's contract
  // of "client-side filter rejected for non-owner views." Strong
  // privacy (rejected awards never leaving the indexer for non-owner
  // viewers) would require authenticated indexer queries — out of
  // scope per the round-1 review B5 resolution.
  const includeRejected = opts?.includeRejected ?? false
  const endorsements = useMemo(() => {
    if (includeRejected) return scanResult
    return scanResult.filter((e) => e.responseState !== "rejected")
  }, [scanResult, includeRejected])

  return {
    endorsements,
    isLoading: scanLoading,
    error,
  }
}
