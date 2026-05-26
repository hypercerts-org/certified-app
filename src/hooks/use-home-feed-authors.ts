"use client"

import { useMemo } from "react"
import { useBlueskyFollows } from "@/hooks/use-bluesky-follows"
import { useFollowing } from "@/hooks/use-following"
import { MAX_AUTHORS_FILTER_SIZE } from "@/lib/atproto/follower-events"

/**
 * Pure helper — exported for unit testing. Encodes the union + sort +
 * truncate policy without React. The hook below wraps this in a
 * memo.
 */
export function computeHomeFeedAuthors(
  did: string | null,
  blueskyDids: Set<string>,
  certifiedSubjects: Set<string>,
): { authors: string[]; isOversized: boolean } {
  if (!did) return { authors: [], isOversized: false }
  const union = new Set<string>()
  blueskyDids.forEach((d) => union.add(d))
  certifiedSubjects.forEach((d) => union.add(d))
  const sorted = Array.from(union).sort()
  if (sorted.length > MAX_AUTHORS_FILTER_SIZE) {
    return {
      authors: sorted.slice(0, MAX_AUTHORS_FILTER_SIZE),
      isOversized: true,
    }
  }
  return { authors: sorted, isOversized: false }
}

export interface UseHomeFeedAuthorsResult {
  /**
   * Deduped, alphabetically-sorted union of the viewer's Bluesky and
   * Certified follows. Truncated to `MAX_AUTHORS_FILTER_SIZE` if the
   * union exceeds the cap (see `isOversized` below).
   *
   * Stable identity across renders when the underlying sets are
   * unchanged — uses `useMemo` keyed on a deterministic join of
   * sorted DIDs. Safe to pass into `useEffect` deps via
   * `authors.join(",")`.
   */
  authors: string[]
  /** True when the raw union exceeded the cap and was truncated. */
  isOversized: boolean
  /**
   * True when either of the upstream hooks hit its 10k page-walk cap.
   * Consumers should not derive set-arithmetic conclusions when this
   * is true — for the feed query it's a soft warning.
   */
  truncatedBySource: boolean
  isLoading: boolean
  error: string | null
}

/**
 * Composes `useBlueskyFollows` + `useFollowing` into a single author
 * list suitable for passing to `fetchFollowerEvents`. Both upstream
 * hooks cache at the module level (5-min TTL), so calling this hook
 * in multiple components is cheap.
 *
 * Ranking for over-cap follow sets: v1 uses ascending DID-string
 * sort. The issue's recommended "most-recently-interacted-with"
 * ranking needs a per-DID timestamp signal the union doesn't expose
 * today (Bluesky follows arrive in PDS insertion order; Certified
 * follows have a `createdAt` field that isn't comparable to Bluesky's
 * insertion order). Recency ranking is tracked as a follow-up.
 */
export function useHomeFeedAuthors(did: string | null): UseHomeFeedAuthorsResult {
  const {
    followedDids: blueskyDids,
    truncated: blueskyTruncated,
    isLoading: blueskyLoading,
    error: blueskyError,
  } = useBlueskyFollows(did)

  const {
    subjects: certifiedSubjects,
    truncated: certifiedTruncated,
    isLoading: certifiedLoading,
    error: certifiedError,
  } = useFollowing(did)

  const { authors, isOversized } = useMemo(
    () => computeHomeFeedAuthors(did, blueskyDids, certifiedSubjects),
    [did, blueskyDids, certifiedSubjects],
  )

  return {
    authors,
    isOversized,
    truncatedBySource: blueskyTruncated || certifiedTruncated,
    isLoading: blueskyLoading || certifiedLoading,
    error: blueskyError ?? certifiedError ?? null,
  }
}
