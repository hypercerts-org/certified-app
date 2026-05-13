"use client"

import { useMemo, useCallback } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import {
  useProfileResponses,
  invalidateProfileResponses,
} from "@/hooks/use-profile-responses"
import {
  resolveResponseState,
  type ResponseState,
} from "@/lib/atproto/badges"

/**
 * Owner-only hook: returns the authenticated viewer's response
 * state for any award URI they care about, plus an invalidator to
 * call after a write.
 *
 * The R2 reviewer flagged "accept-state must be owner-only" — the
 * per-row response metadata leaks information about the user's
 * curation that other viewers shouldn't see ("vouched harder for
 * that one" misread). This hook is the gate: only the viewer's
 * own profile pages consume it; non-owner profile views don't
 * receive the per-award state at all.
 */
export function useOwnResponseStates(): {
  /** Returns the latest response state for a given award URI. */
  resolve: (awardUri: string) => {
    state: ResponseState
    latestRkey?: string
    rawValue?: string
  }
  /** The raw response records — exposed for `deleteAllResponsesForAward`
   *  in the "Reset to default" flow. */
  responses: ReturnType<typeof useProfileResponses>["responses"]
  isLoading: boolean
  /** Call after a write (createResponse / deleteResponse) so the
   *  next render reflects the new state without a 5min cache wait. */
  invalidate: () => void
  /** Re-fetch immediately after a write, in addition to the cache
   *  drop. Combine: `invalidate(); await refetch();`. */
  refetch: () => Promise<void>
} {
  const { did } = useAuth()
  const { responses, isLoading, refetch } = useProfileResponses(did)

  const resolve = useCallback(
    (awardUri: string) => resolveResponseState(awardUri, responses),
    [responses],
  )

  const invalidate = useCallback(() => {
    if (did) invalidateProfileResponses(did)
  }, [did])

  return useMemo(
    () => ({ resolve, responses, isLoading, invalidate, refetch }),
    [resolve, responses, isLoading, invalidate, refetch],
  )
}
