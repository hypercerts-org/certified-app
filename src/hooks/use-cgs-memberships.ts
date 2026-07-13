"use client"

import { useCallback, useEffect, useState } from "react"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"
import { fetchRemoteMemberships } from "@/lib/groups/api"

export interface UserGroup {
  groupDid: string
  handle: string
  displayName?: string
  description?: string
  avatarUrl?: string
  role?: string
  joinedAt?: string
}

/**
 * Returns the groups the signed-in viewer belongs to, sourced
 * directly from the Certified Group Service (CGS) — the single
 * source of truth for membership. The PDS `app.certified.actor.
 * membership` lexicon is deliberately ignored: there's no public/
 * private split anymore, just one CGS-backed list.
 *
 * The CGS endpoint is session-authed and returns [] for any DID
 * that isn't the signed-in viewer, so passing a foreign DID is
 * safe but always empty. Callers gate rendering on own-profile.
 */
export function useCgsMemberships(did: string | null): {
  groups: UserGroup[]
  isLoading: boolean
  error: string | null
  refresh: () => void
} {
  const [groups, setGroups] = useState<UserGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!did) {
      setGroups([])
      setIsLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    const { signal } = controller

    async function run() {
      setIsLoading(true)
      setError(null)
      try {
        const remote = await fetchRemoteMemberships(signal)
        if (signal.aborted) return

        // Resolve group profiles through the batched coalescer — one
        // coalesced POST /api/resolve-dids for all K groups, plus
        // session caching across refreshes. The previous per-row
        // GET /api/resolve-did pattern is exactly what blew that
        // route's 60/min rate limit (see resolve-did-batch.ts).
        // loadResolvedProfile never rejects (null on failure) and
        // takes no signal; a fetch completing after unmount only
        // warms the shared cache — the aborted guard below still
        // gates setState.
        const hydrated = await Promise.all(
          remote.map(async (m): Promise<UserGroup> => {
            const profile = await loadResolvedProfile(m.groupDid)
            if (!profile) {
              return {
                groupDid: m.groupDid,
                handle: m.groupDid,
                role: m.role,
                joinedAt: m.joinedAt,
              }
            }
            return {
              groupDid: m.groupDid,
              handle: profile.handle || m.groupDid,
              displayName: profile.displayName,
              description: profile.description,
              avatarUrl: profile.avatar ?? undefined,
              role: m.role,
              joinedAt: m.joinedAt,
            }
          }),
        )
        if (signal.aborted) return

        hydrated.sort((a, b) => {
          if (a.joinedAt && b.joinedAt && a.joinedAt !== b.joinedAt) {
            return a.joinedAt > b.joinedAt ? -1 : 1
          }
          const nameA = (a.displayName || a.handle).toLowerCase()
          const nameB = (b.displayName || b.handle).toLowerCase()
          return nameA.localeCompare(nameB)
        })

        setGroups(hydrated)
      } catch (err) {
        if (signal.aborted) return
        console.error("Failed to fetch CGS memberships:", err)
        setError(
          err instanceof Error ? err.message : "Failed to fetch memberships",
        )
        setGroups([])
      } finally {
        if (!signal.aborted) setIsLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [did, nonce])

  return { groups, isLoading, error, refresh }
}
