"use client"

import { useEffect, useState } from "react"
import {
  fetchActorWorkspaceCounts,
  fetchNetworkActors,
  type NetworkActor,
  type WorkspaceCounts,
} from "@/lib/atproto/workspace"

const EMPTY_COUNTS: WorkspaceCounts = {
  certs: null,
  projects: null,
  lists: null,
  endorsementsReceived: null,
  followers: null,
}

// Module-level cache for the actor list — it doesn't move much and
// every layout variant hits the same data.
let actorsCache: NetworkActor[] | null = null
let actorsInflight: Promise<NetworkActor[]> | null = null

export function useNetworkActors(): {
  actors: NetworkActor[]
  isLoading: boolean
} {
  const [actors, setActors] = useState<NetworkActor[]>(
    () => actorsCache ?? [],
  )
  const [isLoading, setIsLoading] = useState(!actorsCache)

  useEffect(() => {
    if (actorsCache) {
      setActors(actorsCache)
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    if (!actorsInflight) {
      actorsInflight = fetchNetworkActors({ first: 30, signal: controller.signal })
        .then((page) => {
          actorsCache = page.actors
          return page.actors
        })
        .finally(() => {
          actorsInflight = null
        })
    }
    actorsInflight!
      .then((list) => {
        if (controller.signal.aborted) return
        setActors(list)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.warn("[workspace] actors fetch failed:", err)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [])

  return { actors, isLoading }
}

export function useActorWorkspaceCounts(did: string | null): {
  counts: WorkspaceCounts
  isLoading: boolean
} {
  const [counts, setCounts] = useState<WorkspaceCounts>(EMPTY_COUNTS)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!did) {
      setCounts(EMPTY_COUNTS)
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    setIsLoading(true)
    fetchActorWorkspaceCounts(did, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return
        setCounts(next)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.warn("[workspace] counts fetch failed:", err)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [did])

  return { counts, isLoading }
}
