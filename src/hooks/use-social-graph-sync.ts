"use client"

import { useCallback, useMemo, useState } from "react"
import { useBlueskyFollows } from "@/hooks/use-bluesky-follows"
import { useFollowing } from "@/hooks/use-following"
import { createFollow } from "@/lib/atproto/follow"

export interface SocialGraphSyncStats {
  /** Subject DIDs followed on BOTH Certified and Bluesky. */
  inBoth: string[]
  /** Followed only on the Certified graph. */
  onlyCertified: string[]
  /** Followed on Bluesky but not yet on Certified — the import
   *  candidates. */
  onlyBluesky: string[]
}

export interface SocialGraphSyncResult {
  /** Number of follows successfully written. */
  imported: number
  /** Number of follows that failed to write (sum of `errors`). */
  failed: number
  /** Per-failure { subjectDid, message } for surfacing in the UI. */
  errors: { subjectDid: string; message: string }[]
}

/**
 * Compare the certified social graph against the bluesky social
 * graph for the same `did` and expose a one-click import for
 * accounts followed on Bluesky that aren't yet on Certified.
 *
 * Read side:
 *   - `useFollowing(did)`     → Certified follows on the same repo.
 *   - `useBlueskyFollows(did)` → Bluesky follows on the same repo.
 *   Both hit the PDS via the XRPC proxy and run in parallel; the
 *   set arithmetic happens locally here.
 *
 * Write side:
 *   - `importDids(dids)` writes one certified follow per DID. When
 *     `targetDid` is set (acting-as-group) writes route through the
 *     group's BFF; otherwise they go to the personal repo.
 *
 * The hook does NOT swallow failures — the result object surfaces
 * per-DID errors so the caller can show them next to the right row.
 */
export function useSocialGraphSync(
  did: string | null,
  opts?: { ownDid?: string | null; targetDid?: string },
): {
  certifiedCount: number
  blueskyCount: number
  stats: SocialGraphSyncStats
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  importDids: (
    dids: string[],
    opts?: { signal?: AbortSignal },
  ) => Promise<SocialGraphSyncResult>
} {
  // Destructure both sources so the closures below close over
  // individually-stable callbacks rather than the always-fresh
  // wrapping object literal returned each render. This lets the React
  // Compiler preserve memoization for `refetch` and `importDids`.
  const {
    subjects: certifiedSubjects,
    count: certifiedCount,
    isLoading: certifiedLoading,
    error: certifiedError,
    refetch: certifiedRefetch,
    addFollow: certifiedAddFollow,
  } = useFollowing(did)
  const { followedDids: blueskyDids, isLoading: blueskyLoading, error: blueskyError } =
    useBlueskyFollows(did)
  const blueskyCount = blueskyDids.size
  const ownDid = opts?.ownDid ?? did
  const targetDid = opts?.targetDid

  const stats = useMemo<SocialGraphSyncStats>(() => {
    const inBoth: string[] = []
    const onlyCertified: string[] = []
    const onlyBluesky: string[] = []
    certifiedSubjects.forEach((d) => {
      if (blueskyDids.has(d)) inBoth.push(d)
      else onlyCertified.push(d)
    })
    blueskyDids.forEach((d) => {
      if (!certifiedSubjects.has(d)) onlyBluesky.push(d)
    })
    return { inBoth, onlyCertified, onlyBluesky }
  }, [certifiedSubjects, blueskyDids])

  // `useBlueskyFollows` doesn't expose a refetch — the cache
  // refreshes on focus when stale, which is good enough for the
  // post-import view (the bluesky data didn't change, only certified
  // did).
  const refetch = useCallback(() => certifiedRefetch(), [certifiedRefetch])

  const [isWriting, setIsWriting] = useState(false)

  const importDids = useCallback(
    async (
      dids: string[],
      opts?: { signal?: AbortSignal },
    ): Promise<SocialGraphSyncResult> => {
      if (!ownDid) {
        return {
          imported: 0,
          failed: dids.length,
          errors: dids.map((subjectDid) => ({
            subjectDid,
            message: "Not signed in",
          })),
        }
      }
      if (isWriting) {
        return { imported: 0, failed: 0, errors: [] }
      }
      setIsWriting(true)
      let imported = 0
      const errors: { subjectDid: string; message: string }[] = []
      try {
        // Skip anything already in the certified set — covers the
        // race where the user opens the modal, follows someone via
        // the sidebar, then clicks Import. Also dedupes within `dids`.
        const seen = new Set<string>()
        for (const subjectDid of dids) {
          // Honor caller cancellation between iterations. Closing the
          // modal mid-import should stop further writes, otherwise the
          // loop continues populating the user's repo (and the local
          // cache) with rows the user thought they cancelled.
          if (opts?.signal?.aborted) break
          if (seen.has(subjectDid)) continue
          seen.add(subjectDid)
          if (certifiedSubjects.has(subjectDid)) continue
          try {
            const result = await createFollow(ownDid, subjectDid, {
              targetDid,
            })
            // Optimistically update the local certified set so the
            // stats tile flips immediately AND a partial failure
            // leaves the count accurate. Refetch below catches up to
            // the PDS for the final reconciliation.
            certifiedAddFollow(subjectDid, result.uri, result.cid)
            imported++
          } catch (err) {
            errors.push({
              subjectDid,
              message:
                err instanceof Error ? err.message : "Failed to create follow",
            })
          }
        }
        // Refetch the certified list so the cache reflects the new
        // commits authoritatively. The bluesky side didn't change.
        // If refetch throws, the finally below still clears
        // `isWriting` — without the try/finally the modal would stay
        // stuck on "Importing…" forever.
        await certifiedRefetch()
      } finally {
        setIsWriting(false)
      }
      return { imported, failed: errors.length, errors }
    },
    [ownDid, targetDid, isWriting, certifiedSubjects, certifiedAddFollow, certifiedRefetch],
  )

  return {
    certifiedCount,
    blueskyCount,
    stats,
    isLoading: certifiedLoading || blueskyLoading,
    error: certifiedError || blueskyError,
    refetch,
    importDids,
  }
}
