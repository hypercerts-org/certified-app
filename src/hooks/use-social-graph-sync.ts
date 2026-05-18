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
  importDids: (dids: string[]) => Promise<SocialGraphSyncResult>
} {
  const certified = useFollowing(did)
  const bluesky = useBlueskyFollows(did)
  const ownDid = opts?.ownDid ?? did
  const targetDid = opts?.targetDid

  const stats = useMemo<SocialGraphSyncStats>(() => {
    const inBoth: string[] = []
    const onlyCertified: string[] = []
    const onlyBluesky: string[] = []
    certified.subjects.forEach((d) => {
      if (bluesky.followedDids.has(d)) inBoth.push(d)
      else onlyCertified.push(d)
    })
    bluesky.followedDids.forEach((d) => {
      if (!certified.subjects.has(d)) onlyBluesky.push(d)
    })
    return { inBoth, onlyCertified, onlyBluesky }
  }, [certified.subjects, bluesky.followedDids])

  const refetch = useCallback(async () => {
    await Promise.all([certified.refetch(), bluesky ? Promise.resolve() : Promise.resolve()])
  }, [certified])
  // `useBlueskyFollows` doesn't expose a refetch — the cache
  // refreshes on focus when stale, which is good enough for the
  // post-import view (the bluesky data didn't change, only certified
  // did).

  const [isWriting, setIsWriting] = useState(false)

  const importDids = useCallback(
    async (dids: string[]): Promise<SocialGraphSyncResult> => {
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
      // Skip anything already in the certified set — covers the
      // race where the user opens the modal, follows someone via the
      // sidebar, then clicks Import. Also dedupes within `dids`.
      const seen = new Set<string>()
      for (const subjectDid of dids) {
        if (seen.has(subjectDid)) continue
        seen.add(subjectDid)
        if (certified.subjects.has(subjectDid)) continue
        try {
          const result = await createFollow(ownDid, subjectDid, { targetDid })
          // Optimistically update the local certified set so the
          // stats tile flips immediately AND a partial failure
          // leaves the count accurate. Refetch below catches up to
          // the PDS for the final reconciliation.
          certified.addFollow(subjectDid, result.uri, result.cid)
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
      await certified.refetch()
      setIsWriting(false)
      return { imported, failed: errors.length, errors }
    },
    [ownDid, targetDid, isWriting, certified],
  )

  return {
    certifiedCount: certified.count,
    blueskyCount: bluesky.followedDids.size,
    stats,
    isLoading: certified.isLoading || bluesky.isLoading,
    error: certified.error || bluesky.error,
    refetch,
    importDids,
  }
}
