"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "./org-context"
import type { Group } from "./types"

/**
 * "Seen as": which account the Network's Feed and Explore are shown for,
 * you or one of your groups. Its own setting, apart from the workspace
 * (who you act as, `activeOrg`): switching one never moves the other. It
 * only changes what Feed and Explore show; anything you do there (follow,
 * endorse) is still done as the account whose workspace is open.
 *
 * Kept per browser tab, like the workspace, as the chosen group's DID. A
 * DID that isn't one of your groups (you left it, or another account
 * signed in) reads as you.
 */
const SEEN_AS_KEY = "certified_seen_as"

const listeners = new Set<() => void>()

function read(): string | null {
  try {
    return window.sessionStorage.getItem(SEEN_AS_KEY)
  } catch {
    return null
  }
}

function write(groupDid: string | null) {
  try {
    if (groupDid) window.sessionStorage.setItem(SEEN_AS_KEY, groupDid)
    else window.sessionStorage.removeItem(SEEN_AS_KEY)
  } catch {
    // sessionStorage may be unavailable; the choice then lasts until reload.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export interface SeenAs {
  /** The group the network is seen as, or null for you. */
  seenAs: Group | null
  /** The account whose perspective Feed and Explore show: the group's DID,
   *  else yours. Null while signed out. */
  viewerDid: string | null
  /** True while a remembered group is waiting on the groups list, so a
   *  page can hold its first render instead of showing your view first. */
  isResolving: boolean
  setSeenAs: (next: Group | null) => void
}

export function useSeenAs(): SeenAs {
  const { did, isAuthenticated, isLoading: authLoading } = useAuth()
  const { groups, selfGroup, isLoading: orgLoading } = useOrg()
  const storedDid = useSyncExternalStore(subscribe, read, () => null)

  // Signing out forgets the choice, as it does the workspace.
  useEffect(() => {
    if (!authLoading && !isAuthenticated && read()) write(null)
  }, [authLoading, isAuthenticated])

  const seenAs =
    storedDid && !selfGroup ? (groups.find((g) => g.groupDid === storedDid) ?? null) : null
  const setSeenAs = useCallback((next: Group | null) => write(next?.groupDid ?? null), [])

  return {
    seenAs,
    viewerDid: seenAs?.groupDid ?? did ?? null,
    isResolving: !!storedDid && !seenAs && orgLoading,
    setSeenAs,
  }
}
