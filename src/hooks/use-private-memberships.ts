"use client"

import { useCallback, useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { fetchRemoteMemberships, listMemberships } from "@/lib/groups/api"
import type { UserGroup } from "@/hooks/use-user-groups"

interface ResolvedDid {
  did: string
  handle: string
  displayName?: string
  description?: string
  avatar?: string
}

/**
 * Returns the groups the viewer belongs to according to the Certified
 * Group Service (CGS) which are NOT mirrored as a public membership
 * record on the viewer's PDS. These are the user's "private" groups —
 * memberships the user has chosen not to expose on their public PDS.
 *
 * Only meaningful for the signed-in user's own DID. The CGS endpoint
 * (`/api/groups/memberships`) is session-authed and silently returns []
 * when called by an unauthenticated viewer, so passing a foreign DID
 * here is safe but always returns an empty list.
 */
export function useCgsPrivateMemberships(did: string | null): {
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
      if (!did) return
      setIsLoading(true)
      setError(null)
      try {
        const [remote, local] = await Promise.all([
          fetchRemoteMemberships(signal),
          listMemberships(did, signal),
        ])
        if (signal.aborted) return

        const localSet = new Set(local.map((m) => m.groupDid))
        const privateOnly = remote.filter((rm) => !localSet.has(rm.groupDid))

        const hydrated = await Promise.all(
          privateOnly.map(async (m): Promise<UserGroup> => {
            try {
              const res = await authFetch(
                `/api/resolve-did?did=${encodeURIComponent(m.groupDid)}`,
                { signal }
              )
              if (!res.ok) {
                return {
                  groupDid: m.groupDid,
                  handle: m.groupDid,
                  role: m.role,
                  joinedAt: m.joinedAt,
                }
              }
              const data = (await res.json()) as ResolvedDid
              return {
                groupDid: m.groupDid,
                handle: data.handle || m.groupDid,
                displayName: data.displayName,
                description: data.description,
                avatarUrl: data.avatar,
                role: m.role,
                joinedAt: m.joinedAt,
              }
            } catch {
              return {
                groupDid: m.groupDid,
                handle: m.groupDid,
                role: m.role,
                joinedAt: m.joinedAt,
              }
            }
          })
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
        console.error("Failed to fetch private memberships:", err)
        setError(
          err instanceof Error ? err.message : "Failed to fetch private memberships"
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
