"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ENDORSEMENT_BADGE_TITLE,
  resolveResponseState,
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
  /** Title of the issuer's list this endorsement was awarded under,
   *  when the award belongs to a user-created list rather than the
   *  default "Endorsement" definition. `undefined` for default
   *  endorsements. */
  listTitle?: string
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
    // Stop at whitespace OR the closing `]` of the map literal — otherwise
    // the trailing `]` leaks into the captured URI and the equality check
    // against the real definition URI silently fails.
    const m = badge.match(/uri:(at:\/\/[^\s\]]+)/)
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
        operationName: "ReceivedEndorsements",
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
 * Single indexer query for every endorsement-typed definition URI
 * across the given set of issuer DIDs. Replaces what used to be a
 * per-issuer PDS `listDefinitions` fan-out — that path serialised at
 * the slowest issuer PDS in the set and was the dominant latency on
 * the Endorsements tab. The indexer already maintains
 * `appCertifiedBadgeDefinition` with `did: { in: [...] }` +
 * `badgeType: { eq: ... }` filters (see #65), so one round-trip
 * answers the "which of these issuers' definitions are
 * endorsement-typed?" question for the whole batch.
 *
 * Returns a Set of definition URIs.
 */
async function fetchEndorsementDefMapForIssuers(
  issuerDids: string[],
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  if (issuerDids.length === 0) return new Map()
  // Query string lives server-side in `OPERATIONS.EndorsementDefs`
  // (`src/app/api/indexer/route.ts`); the `first` param is clamped
  // server-side, we pass it explicitly for clarity.
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "EndorsementDefs",
      variables: { dids: issuerDids, first: 1000 },
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Indexer definition query failed: ${res.status}`)
  }
  const json = (await res.json()) as {
    data?: {
      appCertifiedBadgeDefinition?: {
        edges: { node: { uri: string; title: string | null } | null }[]
      } | null
    } | null
    errors?: { message: string }[]
  }
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message)
  }
  const edges = json.data?.appCertifiedBadgeDefinition?.edges ?? []
  const out = new Map<string, string>()
  for (const e of edges) {
    if (e.node?.uri) out.set(e.node.uri, e.node.title ?? "")
  }
  return out
}

/**
 * Run the scan in TWO indexer calls — no PDS fan-out.
 *
 *   1. Pull every badge.award whose subject is the profile DID.
 *   2. Pull every endorsement-typed badge.definition for the unique
 *      issuers in those awards (one batch query via
 *      `did: { in: [...] }` + `badgeType: { eq: "endorsement" }`).
 *   3. Locally filter awards to those whose badge ref points at one
 *      of the endorsement-typed definition URIs.
 *
 * Replaces the previous per-issuer PDS `listDefinitions` fan-out,
 * which serialised at the slowest issuer's PDS (~200ms × N issuers)
 * and was the dominant latency on the Endorsements tab. The proper
 * one-round-trip fix would be a nested-where on awards — see the
 * companion `hb-agent/magic-indexer` issue.
 */
async function scanReceivedEndorsements(
  profileDid: string,
  signal?: AbortSignal,
): Promise<ReceivedEndorsement[]> {
  const awards = await fetchReceivedAwardsFromIndexer(profileDid, signal)
  if (signal?.aborted) return []

  // Collect every unique issuer that also has a parseable badge ref
  // — there's no point fetching definitions for an award we'd skip
  // anyway because we couldn't extract its definition URI.
  const uniqueIssuers = new Set<string>()
  for (const a of awards) {
    if (extractBadgeDefinitionUri(a.badge)) uniqueIssuers.add(a.did)
  }

  const endorsementDefs = await fetchEndorsementDefMapForIssuers(
    Array.from(uniqueIssuers),
    signal,
  )
  if (signal?.aborted) return []

  const out: ReceivedEndorsement[] = []
  for (const a of awards) {
    const defUri = extractBadgeDefinitionUri(a.badge)
    if (!defUri) continue
    if (!endorsementDefs.has(defUri)) continue
    const title = endorsementDefs.get(defUri)
    // Surface the list title only when it's NOT the reserved default
    // ("Endorsement") — otherwise the card would tag every regular
    // endorsement with "Endorsement", which is noise.
    const listTitle =
      title && title !== ENDORSEMENT_BADGE_TITLE ? title : undefined
    out.push({
      uri: a.uri,
      cid: a.cid,
      issuerDid: a.did,
      createdAt: a.createdAt,
      note: a.note,
      listTitle,
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

  // Response join: fetch the profile-OWNER's responses (their PDS).
  // The R1 reviewer flagged "viewer's responses" as a federation bug
  // — when viewing Alice's profile we need Alice's responses, not
  // ours. The hook contract bakes the fix in by sharing the same
  // profileDid across both fetches.
  const { responses, isLoading: respLoading } = useProfileResponses(profileDid)

  // Filter out awards whose latest response is "rejected" — unless
  // the caller opted into seeing rejected entries (owner-side
  // surfaces). Default and unknown states pass through (default =
  // un-responded; unknown = a response value we don't recognise,
  // treated as no-op so we never silently hide on an unrecognised
  // value).
  const includeRejected = opts?.includeRejected ?? false
  const endorsements = useMemo(() => {
    if (includeRejected) return scanResult
    if (responses.length === 0) return scanResult
    return scanResult.filter((e) => {
      const { state } = resolveResponseState(e.uri, responses)
      return state !== "rejected"
    })
  }, [scanResult, responses, includeRejected])

  return {
    endorsements,
    isLoading: scanLoading || respLoading,
    error,
  }
}
