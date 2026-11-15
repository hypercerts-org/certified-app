"use client"

import { useCallback, useEffect, useState } from "react"
import type { MapDataset } from "@/lib/map/dataset-types"

// One request per session: the dataset is large and the server caches it
// for an hour, so navigating away and back reuses the copy in memory.
let cached: MapDataset | null = null
let pending: Promise<MapDataset> | null = null

function load(): Promise<MapDataset> {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch("/api/map/dataset")
      .then(async (res) => {
        if (!res.ok) throw new Error(`The map failed to load (${res.status})`)
        const ds = (await res.json()) as MapDataset
        cached = ds
        return ds
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}

/** The /map dataset (see `src/lib/map/dataset-types.ts`). */
export function useMapDataset(): {
  data: MapDataset | null
  error: string | null
  retry: () => void
} {
  const [data, setData] = useState<MapDataset | null>(cached)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (cached) {
      setData(cached)
      return
    }
    let live = true
    setError(null)
    load()
      .then((ds) => {
        if (live) setData(ds)
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "The map failed to load")
      })
    return () => {
      live = false
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, retry }
}
