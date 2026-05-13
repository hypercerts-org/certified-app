"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { peekCachedReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useProfileResponses } from "@/hooks/use-profile-responses"
import { resolveResponseState } from "@/lib/atproto/badges"

/**
 * Count of un-responded (`default` or `unknown` state) awards on
 * the viewer's profile. Drives the "pending" chip on the
 * Endorsements nav item.
 *
 * **Read-only / passive.** Critically, this hook does NOT kick off
 * the expensive fan-out scan (R2 I-1 in the round-1 impl review).
 * The nav rail renders on every authenticated page, so triggering
 * the scan from here would balloon the perf cost surface from "the
 * user visits /endorsements" to "the user opens any page in the
 * app." Instead we peek at the cached scan result; the chip stays
 * hidden until something else populates the cache — typically when
 * the user actually visits /endorsements or their own profile.
 *
 * Reactivity is driven by `useProfileResponses` (which DOES use a
 * useSyncExternalStore-backed module store), so when a write
 * invalidates responses we get a re-render and the chip count
 * updates. The scan cache populates separately when the user lands
 * on a surface that needs it.
 *
 * Returns null when:
 *   - logged out (chip should hide)
 *   - the scan cache is cold (chip should hide rather than show 0)
 *   - the responses fetch is still loading
 *
 * Returns 0 when everything's loaded and there are no pending
 * awards (chip should still hide — formatter rule).
 */
export function usePendingAwardsCount(): number | null {
  const { did, isAuthenticated } = useAuth()
  // useProfileResponses fetches the viewer's responses (a single
  // cheap listRecords). Acceptable on the nav rail — the cost is
  // one round-trip; the scan was the expensive part.
  const { responses, isLoading: respLoading } = useProfileResponses(did)

  // Peek the scan cache reactively. We track it in local state and
  // refresh on focus + on every render of the nav rail (which
  // happens on route changes). This keeps the chip up-to-date
  // without ever triggering a fetch from the nav.
  const [scanResult, setScanResult] = useState(() =>
    peekCachedReceivedEndorsements(did),
  )
  useEffect(() => {
    setScanResult(peekCachedReceivedEndorsements(did))
    // Re-check on focus — if the user visited /endorsements in a
    // different tab while this tab was idle, the scan there
    // populated the shared module cache; on return we see it.
    const onFocus = () =>
      setScanResult(peekCachedReceivedEndorsements(did))
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [did])

  if (!isAuthenticated || !did) return 0
  if (!scanResult || respLoading) return null

  let count = 0
  for (const e of scanResult) {
    const { state } = resolveResponseState(e.uri, responses)
    if (state === "default" || state === "unknown") count++
  }
  return count
}
