"use client"

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { resolveGroups } from "./api"
import type { Group } from "./types"

const ACTIVE_ORG_KEY = "certified_active_org"

/**
 * `activeOrg` is READ-SCOPE ONLY.
 *
 * As of the per-action posting-as model (Wave 2), the active org sets
 * the lens the viewer reads/operates a group THROUGH — managed feeds,
 * the "Operating <group>" mode bar, group-scoped aggregation. It does
 * NOT, and must not, decide who a write is authored AS. Every write
 * target comes from an explicit per-action identity (`<PostingAs>` /
 * `usePostingIdentity`, default You) or the owner DID of the record
 * being edited — never silently from `activeOrg`. New code must not
 * derive a `targetDid` / write repo from `activeOrg`; if you need the
 * write identity, take it from the picker.
 */
interface OrgContextValue {
  /** The group the user is currently acting as (READ-SCOPE only — see the
   *  module note above), or null for the personal account. */
  activeOrg: Group | null
  /** All groups the user belongs to */
  groups: Group[]
  /** Loading state */
  isLoading: boolean
  /** Switch to a group (or null to go back to personal) */
  switchOrg: (org: Group | null) => void
  /** Refresh the groups list */
  refetchOrgs: () => Promise<void>
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined)

function loadPersistedOrg(): Group | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_ORG_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Group
  } catch {
    return null
  }
}

function persistOrg(org: Group | null) {
  try {
    if (org) {
      window.sessionStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify(org))
    } else {
      window.sessionStorage.removeItem(ACTIVE_ORG_KEY)
    }
  } catch {
    // ignore — sessionStorage may be unavailable
  }
}

// Initialize synchronously so the first render already has the org
function getInitialOrg(): Group | null {
  if (typeof window === "undefined") return null
  return loadPersistedOrg()
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, did } = useAuth()
  const [activeOrg, setActiveOrg] = useState<Group | null>(getInitialOrg)
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Clear org when logged out (only after auth has finished loading)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setActiveOrg(null)
      persistOrg(null)
    }
  }, [authLoading, isAuthenticated])

  const fetchOrgs = useCallback(
    async (signal?: AbortSignal) => {
      // Don't clear state while auth is still loading — the persisted org
      // from sessionStorage should survive until auth resolves
      if (authLoading) return
      if (!isAuthenticated || !did) {
        setGroups([])
        setActiveOrg(null)
        persistOrg(null)
        return
      }
      setIsLoading(true)
      try {
        const orgs = await resolveGroups(did, signal)
        if (!signal?.aborted) {
          setGroups(orgs)
          // If active org is set, refresh it with latest data from the list
          setActiveOrg((prev) => {
            if (!prev) return null
            const updated = orgs.find((o) => o.groupDid === prev.groupDid)
            if (updated) {
              persistOrg(updated)
              return updated
            }
            // Org no longer in list — clear it
            persistOrg(null)
            return null
          })
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Failed to fetch groups:", err)
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
        }
      }
    },
    [authLoading, isAuthenticated, did]
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchOrgs(controller.signal)
    return () => controller.abort()
  }, [fetchOrgs])

  const switchOrg = useCallback((org: Group | null) => {
    setActiveOrg(org)
    persistOrg(org)
  }, [])

  const refetchOrgs = useCallback(async () => {
    await fetchOrgs()
  }, [fetchOrgs])

  const value = useMemo(() => ({ activeOrg, groups, isLoading, switchOrg, refetchOrgs }), [activeOrg, groups, isLoading, switchOrg, refetchOrgs])

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error("useOrg must be used within OrgProvider")
  return ctx
}
