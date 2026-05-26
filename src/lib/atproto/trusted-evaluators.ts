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

const PAGE_SIZE = 50
/** Bound total endorsements pulled across pages — protects against
 *  one prolific evaluator turning the popover into a multi-second
 *  data fetch. 500 = 10 pages of 50. */
const MAX_TOTAL = 500

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
 * Fetch the set of subject DIDs endorsed by any of the given
 * evaluators. Pages through `EvaluatorEndorsements` until the
 * indexer is exhausted or `MAX_TOTAL` distinct subjects have been
 * collected.
 *
 * Returns an empty Set when `evaluators` is empty (no expansion).
 */
export async function fetchEvaluatorEndorsedDids(
  evaluators: readonly string[],
  signal?: AbortSignal,
): Promise<Set<string>> {
  const result = new Set<string>()
  if (evaluators.length === 0) return result

  let cursor: string | null = null
  while (true) {
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
      signal,
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
