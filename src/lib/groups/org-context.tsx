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

interface OrgContextValue {
  /** The group the user is currently acting as, or null for personal account */
  activeOrg: Group | null
  /** All groups the user belongs to (excluding a self-owned group). */
  groups: Group[]
  /** When the logged-in account is itself a group (you promoted your own
   *  account, so its DID is your DID), the Group for that self-owned account —
   *  else null. The account *is* this group, so the UI presents it as a
   *  "Group account" with group settings rather than listing it as a peer. */
  selfGroup: Group | null
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
    const parsed = JSON.parse(raw) as Partial<Group> | null
    // A stale or tampered payload (e.g. persisted before a Group schema
    // change) would drive /api/groups/undefined/... requests until fetchOrgs
    // reconciles — require the fields every acting-as-group consumer uses.
    if (
      !parsed ||
      typeof parsed.groupDid !== "string" ||
      !parsed.groupDid.startsWith("did:") ||
      typeof parsed.handle !== "string"
    ) {
      window.sessionStorage.removeItem(ACTIVE_ORG_KEY)
      return null
    }
    return parsed as Group
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

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, did } = useAuth()
  // Start null so the server render and the first client render agree; the
  // persisted org is restored in an effect below. Reading sessionStorage in the
  // initializer caused a hydration mismatch (React #418): the server had no org
  // and rendered the personal settings, the client immediately rendered the
  // group settings, and that broke hydration on /settings.
  const [activeOrg, setActiveOrg] = useState<Group | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [selfGroup, setSelfGroup] = useState<Group | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore the persisted active org after mount (client-only).
  useEffect(() => {
    const persisted = loadPersistedOrg()
    if (persisted) setActiveOrg(persisted)
  }, [])

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
        setSelfGroup(null)
        setActiveOrg(null)
        persistOrg(null)
        return
      }
      setIsLoading(true)
      try {
        const resolved = await resolveGroups(did, signal)
        // A self-owned group — one whose DID is your own account (you
        // promoted your own account to a group) — is that account itself,
        // not a separate group to switch into. Hide it from the groups list
        // so it doesn't appear as a peer next to your own account.
        const orgs = resolved.filter((o) => o.groupDid !== did)
        const self = resolved.find((o) => o.groupDid === did) ?? null
        if (!signal?.aborted) {
          setGroups(orgs)
          setSelfGroup(self)
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

  const value = useMemo(
    () => ({ activeOrg, groups, selfGroup, isLoading, switchOrg, refetchOrgs }),
    [activeOrg, groups, selfGroup, isLoading, switchOrg, refetchOrgs],
  )

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
