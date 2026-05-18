"use client"

import { useCallback, useEffect, useState } from "react"
import { listMemberships } from "@/lib/groups/api"
import { authFetch } from "@/lib/auth/fetch"

export interface UserGroup {
  groupDid: string
  handle: string
  displayName?: string
  description?: string
  avatarUrl?: string
  role?: string
  joinedAt?: string
}

interface ResolvedDid {
  did: string
  handle: string
  displayName?: string
  description?: string
  avatar?: string
}

/**
 * Fetch the groups a given DID is a member of.
 *
 * Source: `app.certified.actor.membership` records on the user's PDS.
 * This works for any user (signed-in viewer or not) because
 * `com.atproto.repo.listRecords` is a public read method that the xrpc
 * proxy routes to foreign PDSes for non-session DIDs.
 *
 * Each membership is hydrated with the group's display name / handle /
 * avatar URL via `/api/resolve-did` (Certs → Bluesky fallback).
 */
export function useUserGroups(did: string | null): {
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
      // narrow for TS — the outer guard ensures did is non-null here
      if (!did) return
      setIsLoading(true)
      setError(null)
      try {
        const memberships = await listMemberships(did, signal)
        if (signal.aborted) return

        // Hydrate each membership's group profile. Use the cached
        // resolve-did endpoint; failures fall back to the bare DID.
        const hydrated = await Promise.all(
          memberships.map(async (m): Promise<UserGroup> => {
            try {
              const res = await authFetch(
                `/api/resolve-did?did=${encodeURIComponent(m.groupDid)}`,
                { signal }
              )
              if (!res.ok) {
                return { groupDid: m.groupDid, handle: m.groupDid, role: m.role, joinedAt: m.joinedAt }
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
              return { groupDid: m.groupDid, handle: m.groupDid, role: m.role, joinedAt: m.joinedAt }
            }
          })
        )
        if (signal.aborted) return

        // Sort by joinedAt descending (most-recent first), then by name.
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
        console.error("Failed to fetch user groups:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch groups")
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
