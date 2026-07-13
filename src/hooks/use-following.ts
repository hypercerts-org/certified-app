"use client"

import { useCallback, useMemo } from "react"
import {
  FOLLOW_COLLECTION,
  listFollowing,
  type FollowRecord,
} from "@/lib/atproto/follow"
import { createCachedDidResource } from "@/hooks/create-cached-did-resource"

const STALE_MS = 5 * 60 * 1000

interface FollowingSnapshot {
  records: FollowRecord[]
  /** True when the underlying page walk hit the 10k safety cap with
   *  more upstream — preserved through the shared fetch so every
   *  consumer sees the same completeness signal. */
  truncated: boolean
}

function extractRkey(uri: string): string {
  const idx = uri.lastIndexOf("/")
  return idx >= 0 ? uri.slice(idx + 1) : uri
}

// Module-level cache + singleflight (inside the factory) keyed by DID.
// Re-mounts (e.g. tab switches) reuse the snapshot instead of
// re-paginating the PDS, and simultaneous mounts (header + sidebar +
// follow button on a cold profile view) share ONE page walk.
//
// **Invalidation contract:** this cache lives entirely inside the
// `useFollowing` hook. There is no cross-component invalidation bus
// (unlike `useTypedLists`, which subscribes to
// `endorsement-lists-cache`). Mutations through `unfollow` /
// `followBack` write through via the optimistic mutators so this
// hook stays self-consistent, but a different component issuing a
// follow / unfollow without going through this hook would leave
// the cache stale until the next page-reload. There are no such
// out-of-band writes today.
const useFollowingResource = createCachedDidResource<FollowingSnapshot>({
  staleMs: STALE_MS,
  // `force` (post-write refetch) bypasses the proxy's 5s same-session
  // listRecords cache — the caller just wrote and needs the new state.
  fetch: (did, { force }) =>
    listFollowing(did, undefined, force ? { noCache: true } : undefined),
  // Keep the previous snapshot next to the error — the follow set is
  // used for O(1) "already following?" checks, and an empty flash on a
  // transient failure would misrender every Follow button.
  onError: "retain",
  errorFallback: "Failed to load follows",
})

// Stable empty list so `records`-derived memos don't churn pre-load.
const NO_RECORDS: FollowRecord[] = []

/**
 * Read every `app.certified.graph.follow` record on `did`'s repo.
 * "Following" semantics: this is the set of subjects `did` is following.
 *
 * Authoritative for own-profile views (the viewer's PDS is the source
 * of truth) and acceptable for foreign profiles since the PDS hosts
 * the records publicly.
 *
 * Exposes:
 *   - `records`    — full follow records (rkey included so unfollow
 *                    can target the right one).
 *   - `subjects`   — `Set<string>` of subject DIDs, for O(1) lookup
 *                    in the Follow/Unfollow button.
 *   - `count`      — convenience for sidebar counts.
 *   - `truncated`  — true if the underlying page walk hit the 10k
 *                    safety cap and the upstream still has more.
 *                    Consumers that derive set arithmetic from
 *                    `subjects` (e.g. social-graph-sync) MUST refuse
 *                    to act on the result when this is true — the
 *                    "do I already follow X?" check would return
 *                    false-negatives and cause duplicate writes.
 *   - `refetch`    — bypass cache; call after the viewer follows or
 *                    unfollows somebody.
 *   - `addFollow`/`removeFollow` — optimistic mutators so the Follow
 *                    button can update both the viewer's "following"
 *                    set and the foreign profile's follower list
 *                    without waiting for the PDS / indexer to
 *                    re-page.
 *
 * Returns empty + isLoading=false when `did` is null.
 */
export function useFollowing(did: string | null): {
  records: FollowRecord[]
  subjects: Set<string>
  count: number
  truncated: boolean
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  addFollow: (subjectDid: string, uri: string, cid: string) => void
  removeFollow: (subjectDid: string) => void
} {
  const { data, isLoading, error, refetch, mutate } = useFollowingResource(did)

  // Optimistic insert — the Follow button calls this on a successful
  // createFollow so the viewer's "following" set and the count both
  // update immediately. Idempotent on subjectDid; updates the
  // module-level cache too so re-mounts inside the stale window see
  // the new record.
  const addFollow = useCallback(
    (subjectDid: string, uri: string, cid: string) => {
      mutate((prev) => {
        const current = prev?.records ?? []
        if (current.some((r) => r.value.subject === subjectDid)) return prev
        const record: FollowRecord = {
          uri,
          cid,
          rkey: extractRkey(uri),
          value: {
            $type: FOLLOW_COLLECTION,
            subject: subjectDid,
            createdAt: new Date().toISOString(),
          },
        }
        // Preserve the prior `truncated` flag — adding one record to a
        // truncated snapshot doesn't change whether the upstream still
        // has more pages.
        return {
          records: [record, ...current],
          truncated: prev?.truncated ?? false,
        }
      })
    },
    [mutate],
  )

  // Optimistic delete — same contract as addFollow.
  const removeFollow = useCallback(
    (subjectDid: string) => {
      mutate((prev) => {
        if (!prev || !prev.records.some((r) => r.value.subject === subjectDid)) {
          return prev
        }
        return {
          records: prev.records.filter((r) => r.value.subject !== subjectDid),
          truncated: prev.truncated,
        }
      })
    },
    [mutate],
  )

  const records = data?.records ?? NO_RECORDS

  const subjects = useMemo(
    () => new Set(records.map((r) => r.value.subject)),
    [records],
  )

  return {
    records,
    subjects,
    count: records.length,
    truncated: data?.truncated ?? false,
    isLoading,
    error,
    refetch,
    addFollow,
    removeFollow,
  }
}
