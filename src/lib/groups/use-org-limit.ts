"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "./org-context"
import { getSelfCreatedOrgCount } from "./api"
import { MAX_SELF_CREATED_ORGS } from "./constants"

export function useOrgCreationLimit() {
  const { did } = useAuth()
  const { groups, isLoading: orgsLoading } = useOrg()
  const [selfCreatedCount, setSelfCreatedCount] = useState<number | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  // Adjust state during render once the org list settles: with no
  // signed-in DID there is nothing to check (don't sit on the spinner
  // forever), with one the count fetch is about to start.
  const limitKey = `${did}|${orgsLoading}`
  const [prevLimitKey, setPrevLimitKey] = useState(limitKey)
  if (prevLimitKey !== limitKey) {
    setPrevLimitKey(limitKey)
    if (!orgsLoading) setIsChecking(!!did)
  }

  useEffect(() => {
    // Wait while the org list is still resolving — `did` may arrive late.
    if (orgsLoading || !did) return
    const controller = new AbortController()
    getSelfCreatedOrgCount(did, groups, controller.signal)
      .then((count) => {
        if (!controller.signal.aborted) setSelfCreatedCount(count)
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsChecking(false)
      })
    return () => controller.abort()
  }, [did, groups, orgsLoading])

  return {
    selfCreatedCount,
    isChecking: isChecking || orgsLoading,
    limitReached: selfCreatedCount !== null && selfCreatedCount >= MAX_SELF_CREATED_ORGS,
  }
}
