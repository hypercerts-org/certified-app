/**
 * Trusted-evaluator expansion for the home feed.
 *
 * A "trusted evaluator" is a vetted account whose endorsements the
 * viewer is willing to use as a graph signal — when a viewer keeps
 * an evaluator selected in the home-feed settings popover, every DID
 * that evaluator has endorsed becomes part of the effective follow
 * set passed to `followerEvents`. So the viewer transitively sees
 * activity from the people their trusted evaluators have vouched
 * for, without having to follow each one directly.
 *
 * The default-selected list is hard-coded for now (curated by hand);
 * a future iteration can let the viewer add their own evaluators.
 */
import { INDEXER_PROXY_URL } from "./indexer"

/**
 * Default-selected trusted evaluators. All four are checked by
 * default in the popover; the viewer can uncheck any to drop that
 * evaluator's expansion from the feed.
 */
export const TRUSTED_EVALUATOR_DIDS = [
  "did:plc:s4puetfspot742ai7y4otuel",
  "did:plc:xqrmqd4h7f3fpe7ue7qdhp7h",
  "did:plc:qoti4acfmc5wg6zzmtix6hse",
  "did:plc:ghilmzxkfzrg6zr4bglxvlio",
] as const

/** Per-page size for the EvaluatorEndorsements indexer query. The
 *  proxy clamps `first` to 100; the upstream silently caps higher
 *  values. Larger pages halve the cold-start latency since the
 *  whole feed waits on this pagination to complete before firing
 *  FollowerEvents. */
const PAGE_SIZE = 100
/** Bound on unique endorsed-subject DIDs collected. Stops paging early
 *  when an evaluator endorses very many distinct accounts. */
const MAX_TOTAL = 500
/** Hard cap on page count, regardless of unique-DID progress. The
 *  award stream is "many awards per subject, few distinct subjects"
 *  in practice — evaluators re-endorse the same accounts repeatedly,
 *  so the unique-DID cap (`MAX_TOTAL`) doesn't trigger and the loop
 *  would otherwise crawl every award the evaluator has ever issued
 *  before returning. 5 pages × 100 awards = at most 500 awards
 *  examined, which is enough to surface the useful expansion set
 *  without delaying the feed by seconds while we walk duplicates. */
const MAX_PAGES = 5

/** localStorage cache TTL for the resolved DID set. The
 *  trusted-evaluator graph is slow-changing (evaluators add a few
 *  endorsements a day, not minutes); 1 hour is short enough that
 *  new endorsements appear soon after they're issued, long enough
 *  to skip the 5-round-trip pagination on every page reload. */
const LOCAL_STORAGE_TTL_MS = 60 * 60 * 1000
const LOCAL_STORAGE_KEY_PREFIX = "evaluator-endorsed-dids:"

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readPersistedCache(key: string): Set<string> | null {
  const storage = safeLocalStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(LOCAL_STORAGE_KEY_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      savedAt?: unknown
      dids?: unknown
    }
    if (typeof parsed.savedAt !== "number") return null
    if (Date.now() - parsed.savedAt > LOCAL_STORAGE_TTL_MS) return null
    if (!Array.isArray(parsed.dids)) return null
    const dids = parsed.dids.filter(
      (d): d is string => typeof d === "string" && d.startsWith("did:"),
    )
    return new Set(dids)
  } catch {
    return null
  }
}

function writePersistedCache(key: string, dids: Set<string>): void {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    storage.setItem(
      LOCAL_STORAGE_KEY_PREFIX + key,
      JSON.stringify({ savedAt: Date.now(), dids: [...dids] }),
    )
  } catch {
    // Quota exceeded / privacy-mode storage / serialization fail.
    // Non-fatal — module-level cache still serves this session.
  }
}

interface RawResponse {
  data?: {
    appCertifiedBadgeAward?: {
      edges: {
        cursor: string
        node: {
          did: string
          subject: { __typename: string; did?: string } | null
        } | null
      }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

/**
 * Module-level cache for the resolved DID set, keyed by the sorted
 * evaluator list. Sized small because the popover only exposes
 * `TRUSTED_EVALUATOR_DIDS` (4 evaluators); the practical key set is
 * the power-set of those 4 — at most 15 non-empty subsets.
 *
 * Each entry stores the result Set itself, NOT a Promise — by the
 * time we hand a cached entry back the inflight resolution has
 * completed, so we don't need to share an in-flight promise here.
 * Repeat /home navigations get an instant evaluator-endorsed-DID
 * union instead of paying another fan-out.
 *
 * A second cache layer lives in localStorage (`readPersistedCache` /
 * `writePersistedCache`) so the warm path survives page reloads.
 * The module-level Map is the in-memory hit; localStorage is the
 * cold-start hit on subsequent navigations. Both refer to the same
 * cacheKey shape (sorted evaluator DIDs joined by commas).
 */
const endorsedDidsCache = new Map<string, Set<string>>()

/** Live in-flight resolutions so two mounts on the same /home view
 *  (Strict Mode double-mount, or a navigation back+forth) share one
 *  network fan-out. */
const endorsedDidsInflight = new Map<string, Promise<Set<string>>>()

function cacheKey(evaluators: readonly string[]): string {
  return [...evaluators].sort().join(",")
}

/**
 * Fetch the set of subject DIDs endorsed by any of the given
 * evaluators. Pages through `EvaluatorEndorsements` until the
 * indexer is exhausted or `MAX_TOTAL` distinct subjects have been
 * collected.
 *
 * Returns an empty Set when `evaluators` is empty (no expansion).
 *
 * Cached at module scope so repeat /home mounts (Strict Mode
 * double-mount, navigation back to /home, etc.) skip the indexer
 * fan-out. The popover's selection state is the cache key, so
 * toggling an evaluator computes its result once per session.
 */
export async function fetchEvaluatorEndorsedDids(
  evaluators: readonly string[],
  signal?: AbortSignal,
): Promise<Set<string>> {
  if (evaluators.length === 0) return new Set()
  const key = cacheKey(evaluators)
  const cached = endorsedDidsCache.get(key)
  if (cached) return cached
  // localStorage hit — repopulate the in-memory cache and return
  // immediately. The whole feed waits on this resolution before
  // firing FollowerEvents, so a sub-millisecond storage read beats
  // a multi-second indexer fan-out for the typical page-reload case.
  const persisted = readPersistedCache(key)
  if (persisted) {
    endorsedDidsCache.set(key, persisted)
    return persisted
  }
  // Atomic has/set so two callers racing into the same key don't
  // both fire pagination — the loser just await's the winner.
  // Signal is intentionally NOT threaded into the shared resolution:
  // a single-caller abort would otherwise resolve the shared promise
  // with partial data and poison the cache for every sibling. The
  // outer caller's own signal still gates the consumer-level result.
  // Same pattern as `useTypedLists` H1 / `loadFeaturedItemUris`.
  if (!endorsedDidsInflight.has(key)) {
    const promise = paginateEndorsedDids(evaluators).then((dids) => {
      endorsedDidsCache.set(key, dids)
      writePersistedCache(key, dids)
      return dids
    })
    endorsedDidsInflight.set(key, promise)
    promise.finally(() => {
      if (endorsedDidsInflight.get(key) === promise) {
        endorsedDidsInflight.delete(key)
      }
    })
  }
  const fetched = await endorsedDidsInflight.get(key)!
  if (signal?.aborted) return new Set()
  return fetched
}

async function paginateEndorsedDids(
  evaluators: readonly string[],
): Promise<Set<string>> {
  const result = new Set<string>()
  if (evaluators.length === 0) return result

  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "EvaluatorEndorsements",
        variables: {
          evaluators: [...evaluators],
          first: PAGE_SIZE,
          after: cursor,
        },
      }),
    })
    if (!res.ok) {
      throw new Error(`EvaluatorEndorsements proxy returned ${res.status}`)
    }
    const json = (await res.json()) as RawResponse
    if (json.errors?.length) {
      throw new Error(`EvaluatorEndorsements: ${json.errors[0].message}`)
    }
    const conn = json.data?.appCertifiedBadgeAward
    if (!conn) break
    for (const edge of conn.edges) {
      const did = edge.node?.subject?.did
      if (did) result.add(did)
      if (result.size >= MAX_TOTAL) return result
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
    cursor = conn.pageInfo.endCursor
  }
  return result
}
