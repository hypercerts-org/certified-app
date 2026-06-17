"use client"

import { useCallback, useEffect, useState } from "react"
import {
  fetchDisplayProfile,
  invalidateDisplayProfile,
} from "@/lib/atproto/hyperboard"
import type { DisplayProfileRecord } from "@/lib/atproto/hyperboard-types"

export interface UseDisplayProfileResult {
  profile: DisplayProfileRecord | null
  isLoading: boolean
  reload: () => void
}

/**
 * Load a user's own org.hyperboards.displayProfile (rkey self) — their
 * self-declared appearance on contributor boards. Used by the displayProfile
 * editor and as a fallback layer when rendering tiles.
 */
export function useDisplayProfile(
  did: string | null | undefined,
): UseDisplayProfileResult {
  const [profile, setProfile] = useState<DisplayProfileRecord | null>(null)
  const [isLoading, setIsLoading] = useState(!!did)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!did) return
    let cancelled = false
    // Nest the state writes in an async runner so they read as a fetch
    // lifecycle update rather than a synchronous effect-body cascade.
    const run = async () => {
      setIsLoading(true)
      const p = await fetchDisplayProfile(did)
      if (!cancelled) {
        setProfile(p)
        setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // reloadTick re-runs the single cancellation-guarded loader (no stale
    // write race from a second, unguarded fetch).
  }, [did, reloadTick])

  const reload = useCallback(() => {
    if (did) invalidateDisplayProfile(did)
    setReloadTick((t) => t + 1)
  }, [did])

  return { profile, isLoading, reload }
}
