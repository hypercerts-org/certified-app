"use client"

import { useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useProfileResponses } from "@/hooks/use-profile-responses"
import { resolveResponseState } from "@/lib/atproto/badges"

/**
 * Count of un-responded (`default` state) awards on the viewer's
 * own profile. Drives the small "pending" chip on the Endorsements
 * nav item — the discovery cue that closes the default-show gap
 * until the notifications service learns about badge awards.
 *
 * Reuses the same module-level caches as `useReceivedEndorsements`
 * and `useProfileResponses`, so this hook on the nav doesn't double
 * the network cost when the user also has an Endorsements page open.
 *
 * Returns null while the underlying data is loading (callers
 * typically hide the chip when null). Returns 0 when there are no
 * pending awards or when the user is logged out.
 */
export function usePendingAwardsCount(): number | null {
  const { did, isAuthenticated } = useAuth()
  const { endorsements, isLoading: scanLoading } = useReceivedEndorsements(did)
  const { responses, isLoading: respLoading } = useProfileResponses(did)

  return useMemo(() => {
    if (!isAuthenticated || !did) return 0
    if (scanLoading || respLoading) return null
    let count = 0
    for (const e of endorsements) {
      const { state } = resolveResponseState(e.uri, responses)
      // "default" = no response yet. "unknown" = response value we
      // don't recognise; the safe play is to count it too so the
      // user can review and either accept it or hide it explicitly.
      if (state === "default" || state === "unknown") count++
    }
    return count
  }, [isAuthenticated, did, endorsements, responses, scanLoading, respLoading])
}
