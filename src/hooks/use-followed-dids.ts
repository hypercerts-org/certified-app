"use client"

import { useBlueskyFollows } from "./use-bluesky-follows"

/**
 * Composition hook that aggregates followed DIDs from all sources.
 * Today: Bluesky only. Later: merge with a custom follow graph.
 */
export function useFollowedDids(did: string | null) {
  return useBlueskyFollows(did)
}
