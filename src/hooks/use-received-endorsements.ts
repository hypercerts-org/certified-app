"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { postIndexer, type IndexerPostResult } from "@/lib/atproto/indexer"

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
 * (`src/app/api/indexer/operations.ts`); the client only sends
 * `{ operationName, variables }`.
 */
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

interface ReceivedAwardsData {
  appCertifiedBadgeAward?: {
    edges: { node: IndexerAwardNode | null }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  } | null
}

// No AbortSignal: this runs inside the shared (singleflight) scan
// promise, which must not be bound to any single caller's signal.
async function fetchReceivedAwardsFromIndexer(
  profileDid: string,
): Promise<IndexerAwardNode[]> {
  const PAGE_SIZE = 100
  const SAFETY_CAP = 10_000
  const out: IndexerAwardNode[] = []
  let cursor: string | null = null
  while (out.length < SAFETY_CAP) {
    // Explicit annotation: the loop-carried `cursor` feeds the
    // variables object, and inferring through it trips TS7022.
    const result: IndexerPostResult<ReceivedAwardsData> = await postIndexer(
      "ReceivedEndorsements",
      { did: profileDid, first: PAGE_SIZE, after: cursor },
    )
    if (!result.ok) {
      // Surface the reject reason when the body carried a GraphQL
      // errors array — issue #73 noted that a bare "Indexer query
      // failed: 400" swallowed which proxy branch fired. Proxy-side
      // rejects with plain `{error}` bodies stay status-only here;
      // the network panel carries the string.
      const detail = result.errors[0] ? `: ${result.errors[0].message}` : ""
      throw new Error(`Indexer query failed: ${result.status}${detail}`)
    }
    const conn = result.data?.appCertifiedBadgeAward
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
): Promise<ReceivedEndorsement[]> {
  const awards = await fetchReceivedAwardsFromIndexer(profileDid)

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

// Singleflight: on a cold profile visit the header, sidebar and
// overview all mount this hook for the same DID in one commit — they
// share ONE scan instead of racing three identical page-walks against
// the cold cache (mirrors `inflightByDid` in use-profile-responses).
const inflightByDid = new Map<string, Promise<ReceivedEndorsement[]>>()

// ---------------------------------------------------------------------------
// Shared optimistic overlay, keyed by profileDid. Lets a mutation in one
// component (e.g. the sidebar Endorse button) reflect immediately in every
// other consumer of the same DID's received list — the sidebar "Endorsed by N"
// counter AND the Endorsements tab — without waiting on the 5-min scan cache
// or the indexer to catch up. Mirrors the module-store + useSyncExternalStore
// pattern in endorsement-closure-cache.ts.
//
// Entries are deliberately NOT pruned once the real scan catches up: the merge
// de-dups adds by URI against the scan result and a `hide` is a no-op once the
// award is already gone, so a leftover overlay entry can't double-count or
// resurrect anything. Bounded by user actions.
// ---------------------------------------------------------------------------

interface ReceivedOverlay {
  adds: ReceivedEndorsement[]
  hides: Set<string>
}

const overlays = new Map<string, ReceivedOverlay>()
let overlayVersion = 0
const overlaySubscribers = new Set<() => void>()

function notifyOverlay(): void {
  overlayVersion++
  for (const s of overlaySubscribers) s()
}

function subscribeOverlay(cb: () => void): () => void {
  overlaySubscribers.add(cb)
  return () => {
    overlaySubscribers.delete(cb)
  }
}

function mergeOverlay(
  profileDid: string,
  base: ReceivedEndorsement[],
): ReceivedEndorsement[] {
  const o = overlays.get(profileDid)
  if (!o || (o.adds.length === 0 && o.hides.size === 0)) return base
  const filtered = base.filter((e) => !o.hides.has(e.uri))
  const seen = new Set(filtered.map((e) => e.uri))
  const merged = [...o.adds.filter((e) => !seen.has(e.uri)), ...filtered]
  merged.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  return merged
}

/**
 * Optimistically add a received endorsement for `profileDid` so every
 * consumer of `useReceivedEndorsements(profileDid)` reflects it on the next
 * render. Call from the success path of a write that issues an endorsement
 * targeting `profileDid`. Idempotent by award URI.
 */
export function addOptimisticReceivedEndorsement(
  profileDid: string,
  entry: ReceivedEndorsement,
): void {
  const o = overlays.get(profileDid) ?? { adds: [], hides: new Set<string>() }
  o.hides.delete(entry.uri)
  if (!o.adds.some((e) => e.uri === entry.uri)) {
    o.adds = [entry, ...o.adds]
  }
  overlays.set(profileDid, o)
  notifyOverlay()
}

/**
 * Optimistically remove a received endorsement (by award URI) for
 * `profileDid`. Call from the success path of a revoke. Idempotent.
 */
export function removeOptimisticReceivedEndorsement(
  profileDid: string,
  uri: string,
): void {
  const o = overlays.get(profileDid) ?? { adds: [], hides: new Set<string>() }
  o.adds = o.adds.filter((e) => e.uri !== uri)
  o.hides.add(uri)
  overlays.set(profileDid, o)
  notifyOverlay()
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
      // Share the in-flight scan across instances. The promise is
      // deliberately NOT bound to any single caller's AbortSignal —
      // one consumer unmounting must not fail its siblings (same
      // contract as useTypedLists' shared fetch). Each instance keeps
      // its own aborted guard below before touching state.
      let promise = inflightByDid.get(did)
      if (!promise) {
        promise = scanReceivedEndorsements(did).then((data) => {
          cache.set(did, { data, fetchedAt: Date.now() })
          return data
        })
        inflightByDid.set(did, promise)
        const created = promise
        created
          .catch(() => {
            // Swallowed here only — each awaiting instance surfaces
            // its own error from its `await`.
          })
          .finally(() => {
            // Only clear if still ours (a later scan may have taken
            // the slot during the await window).
            if (inflightByDid.get(did) === created) {
              inflightByDid.delete(did)
            }
          })
      }
      const data = await promise
      if (signal?.aborted) return
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

  // Focus-revalidate when stale. The focus scan gets its own ref'd
  // AbortController so it's actually cancellable — aborted on the next
  // focus and on effect cleanup/unmount, so doScan's
  // `if (signal?.aborted)` guards can fire and we never setState on an
  // unmounted hook (quality-032).
  useEffect(() => {
    let focusController: AbortController | null = null
    const onFocus = () => {
      const did = profileDidRef.current
      if (!did) return
      const c = cache.get(did)
      if (!c || Date.now() - c.fetchedAt >= STALE_MS) {
        focusController?.abort()
        focusController = new AbortController()
        doScan(did, focusController.signal)
      }
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      focusController?.abort()
    }
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
  // Re-render whenever the shared optimistic overlay changes, so a write
  // in a sibling component (e.g. the sidebar Endorse button) flows into
  // this consumer's count/list immediately.
  const overlaySnapshot = useSyncExternalStore(
    subscribeOverlay,
    () => overlayVersion,
    () => overlayVersion,
  )

  const includeRejected = opts?.includeRejected ?? false
  const endorsements = useMemo(() => {
    void overlaySnapshot
    const base = profileDid ? mergeOverlay(profileDid, scanResult) : scanResult
    if (includeRejected) return base
    return base.filter((e) => e.responseState !== "rejected")
  }, [scanResult, includeRejected, profileDid, overlaySnapshot])

  return {
    endorsements,
    isLoading: scanLoading,
    error,
  }
}
