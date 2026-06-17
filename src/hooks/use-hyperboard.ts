"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildAtUri } from "@/lib/urls"
import { isDid } from "@/lib/utils/did"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"
import {
  fetchBoardForActivity,
  fetchContributorInfoMap,
  fetchDisplayProfile,
  buildBoardEntries,
  invalidateBoardForActivity,
  type ResolvedContributorProfile,
} from "@/lib/atproto/hyperboard"
import {
  DEFAULT_BOARD_CONFIG,
  type BoardConfig,
  type BoardEntry,
  type BoardWithRef,
  type ContributorInformationRecord,
  type DisplayProfileRecord,
} from "@/lib/atproto/hyperboard-types"
import type { ActivityContributor } from "@/lib/atproto/activity-types"

const ACTIVITY_NSID = "org.hypercerts.claim.activity"

interface ResolvedMaps {
  contributorInfo: Map<string, ContributorInformationRecord>
  resolved: Map<string, ResolvedContributorProfile>
  displayProfiles: Map<string, DisplayProfileRecord>
}

const EMPTY_MAPS: ResolvedMaps = {
  contributorInfo: new Map(),
  resolved: new Map(),
  displayProfiles: new Map(),
}

export interface UseHyperboardResult {
  /** the board record + its location, or null when the author has none yet */
  boardRef: BoardWithRef | null
  /** the resolved visual config (board's, or the default) */
  config: BoardConfig
  /** render-ready tiles, sized by contribution weight */
  entries: BoardEntry[]
  isLoading: boolean
  error: string | null
  /** re-fetch the board + identities (call after an edit save) */
  reload: () => void
}

/** Stable signature of the contributor identities (not weights). */
function identitiesSignature(contributors: ActivityContributor[]): string {
  return contributors
    .map((c) =>
      "uri" in c.contributorIdentity
        ? c.contributorIdentity.uri
        : c.contributorIdentity.identity,
    )
    .join("|")
}

/**
 * Load the Contributor Board for an activity: the author's board record (if
 * any) plus the identity/profile/displayProfile data needed to render tiles.
 * Tile sizes come from the contributors' weights; pass the live `contributors`
 * array so the memoised entries track edits without a network round-trip.
 */
export function useHyperboard(
  authorDid: string | null,
  rkey: string | null,
  contributors: ActivityContributor[],
): UseHyperboardResult {
  const [boardRef, setBoardRef] = useState<BoardWithRef | null>(null)
  const [maps, setMaps] = useState<ResolvedMaps>(EMPTY_MAPS)
  const [isLoading, setIsLoading] = useState(!!(authorDid && rkey))
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const idsSig = identitiesSignature(contributors)
  // Keep the latest contributors for the loader without making it a dep.
  const contributorsRef = useRef(contributors)
  contributorsRef.current = contributors

  useEffect(() => {
    if (!authorDid || !rkey) {
      setBoardRef(null)
      setMaps(EMPTY_MAPS)
      setIsLoading(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const activityUri = buildAtUri(authorDid, ACTIVITY_NSID, rkey)
        const [board, contributorInfo] = await Promise.all([
          fetchBoardForActivity(authorDid, activityUri),
          fetchContributorInfoMap(authorDid),
        ])

        // Resolve each atproto contributor identity to a DID + profile.
        const current = contributorsRef.current
        const idStrings = new Set<string>()
        for (const c of current) {
          const id = c.contributorIdentity
          const s = "uri" in id ? contributorInfo.get(id.uri)?.identifier : id.identity
          if (s && isAtprotoIdentity(s)) idStrings.add(s)
        }

        const resolved = new Map<string, ResolvedContributorProfile>()
        await Promise.all(
          [...idStrings].map(async (s) => {
            const r = await loadResolvedProfile(s)
            if (r) {
              resolved.set(s, {
                did: r.did,
                displayName: r.displayName ?? null,
                avatarUrl: r.avatar ?? null,
              })
            }
          }),
        )

        // Fetch each resolved contributor's own displayProfile.
        const dids = new Set<string>()
        for (const r of resolved.values()) dids.add(r.did)
        for (const s of idStrings) if (isDid(s)) dids.add(s)
        const displayProfiles = new Map<string, DisplayProfileRecord>()
        await Promise.all(
          [...dids].map(async (did) => {
            const dp = await fetchDisplayProfile(did)
            if (dp) displayProfiles.set(did, dp)
          }),
        )

        if (cancelled) return
        setBoardRef(board)
        setMaps({ contributorInfo, resolved, displayProfiles })
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : "Failed to load contributor board",
        )
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // idsSig re-runs the load when contributors are added/removed.
  }, [authorDid, rkey, idsSig, reloadTick])

  const entries = useMemo(
    () =>
      buildBoardEntries({
        contributors,
        board: boardRef?.board ?? null,
        boardDid: authorDid ?? "",
        contributorInfo: maps.contributorInfo,
        resolved: maps.resolved,
        displayProfiles: maps.displayProfiles,
      }),
    [contributors, boardRef, maps, authorDid],
  )

  const config = boardRef?.board.config ?? DEFAULT_BOARD_CONFIG

  const reload = useCallback(() => {
    if (authorDid && rkey) {
      invalidateBoardForActivity(buildAtUri(authorDid, ACTIVITY_NSID, rkey))
    }
    setReloadTick((t) => t + 1)
  }, [authorDid, rkey])

  return { boardRef, config, entries, isLoading, error, reload }
}
