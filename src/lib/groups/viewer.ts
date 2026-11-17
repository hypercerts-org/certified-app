"use client"

import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "./org-context"
import type { Group } from "./types"

export interface ActingViewer {
  /** The group you act as, or null for you. */
  viewer: Group | null
  /** The account whose network Feed and Explore show: the group's DID,
   *  else yours. Null while signed out. */
  viewerDid: string | null
  /** True while your groups (and the group you act as, restored from the
   *  tab) are still loading, so a page can hold its first render instead
   *  of loading your view and then switching. */
  isResolving: boolean
}

/**
 * Whose network the Feed and Explore show: the account you act as, the one
 * the account control names (account-switcher.tsx). There is no separate
 * "seen as" setting any more: what you read and what you write as are the
 * same account, switched in one place.
 */
export function useActingViewer(): ActingViewer {
  const { did } = useAuth()
  const { activeOrg, isLoading } = useOrg()
  return {
    viewer: activeOrg,
    viewerDid: activeOrg?.groupDid ?? did ?? null,
    isResolving: isLoading,
  }
}
