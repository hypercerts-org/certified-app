"use client"

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { resolveGroups } from "./api"
import type { Group } from "./types"

const ACTIVE_ORG_KEY = "certified_active_org"

interface OrgContextValue {
  /** The group the user is currently acting as, or null for personal account */
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
    const raw = localStorage.getItem(ACTIVE_ORG_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Group
  } catch {
    return null
  }
}

function persistOrg(org: Group | null) {
  try {
    if (org) {
      localStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify(org))
    } else {
      localStorage.removeItem(ACTIVE_ORG_KEY)
    }
  } catch {
    // ignore — localStorage may be unavailable
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
      // from localStorage should survive until auth resolves
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

  return (
    <OrgContext.Provider
      value={{ activeOrg, groups, isLoading, switchOrg, refetchOrgs }}
    >
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error("useOrg must be used within OrgProvider")
  return ctx
}
