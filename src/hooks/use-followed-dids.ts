"use client"

import { useMemo } from "react"
import { useBlueskyFollows } from "./use-bluesky-follows"
import { useFollowing } from "./use-following"

/**
 * Composition hook that aggregates followed DIDs from every supported
 * graph. We currently union two sources:
 *
 *   - `app.bsky.graph.follow`     (Bluesky's native follow graph)
 *   - `app.certified.graph.follow` (Certified's own follow graph)
 *
 * The union semantics match user expectation: if you follow somebody
 * either via Bluesky OR via Certified, their activity should appear in
 * the "Following" feed. Returning only Bluesky follows produced an
 * empty feed for users who built their graph inside Certified.
 */
export function useFollowedDids(did: string | null) {
  const bsky = useBlueskyFollows(did)
  const certified = useFollowing(did)

  const followedDids = useMemo(() => {
    const out = new Set<string>(bsky.followedDids)
    for (const subject of certified.subjects) out.add(subject)
    return out
  }, [bsky.followedDids, certified.subjects])

  return {
    followedDids,
    // Either source still resolving counts as "still loading" — we don't
    // want to render the "you follow nobody" empty state until both
    // graphs have reported in.
    isLoading: bsky.isLoading || certified.isLoading,
    // Surface whichever error landed first; the consumer's warning row
    // is generic enough to cover either source.
    error: bsky.error ?? certified.error ?? null,
  }
}
