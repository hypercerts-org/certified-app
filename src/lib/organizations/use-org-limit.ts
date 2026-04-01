"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "./org-context"
import { getSelfCreatedOrgCount } from "./api"
import { MAX_SELF_CREATED_ORGS } from "./constants"

export function useOrgCreationLimit() {
  const { did } = useAuth()
  const { organizations, isLoading: orgsLoading } = useOrg()
  const [selfCreatedCount, setSelfCreatedCount] = useState<number | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (orgsLoading || !did) return
    const controller = new AbortController()
    setIsChecking(true)
    getSelfCreatedOrgCount(did, organizations, controller.signal)
      .then((count) => {
        if (!controller.signal.aborted) setSelfCreatedCount(count)
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsChecking(false)
      })
    return () => controller.abort()
  }, [did, organizations, orgsLoading])

  return {
    selfCreatedCount,
    isChecking: isChecking || orgsLoading,
    limitReached: selfCreatedCount !== null && selfCreatedCount >= MAX_SELF_CREATED_ORGS,
  }
}
