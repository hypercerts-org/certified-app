"use client"

import { useCallback, useEffect, useState } from "react"
import type { FundingDataset } from "@/lib/funding/dataset-types"

// One request per session: the dataset is large and the server caches it
// for an hour, so navigating away and back reuses the copy in memory.
let cached: FundingDataset | null = null
let pending: Promise<FundingDataset> | null = null

function load(): Promise<FundingDataset> {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch("/api/funding/dataset")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Funding data failed to load (${res.status})`)
        const ds = (await res.json()) as FundingDataset
        cached = ds
        return ds
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}

/** The /funding dataset (see `src/lib/funding/dataset-types.ts`). */
export function useFundingDataset(): {
  data: FundingDataset | null
  error: string | null
  retry: () => void
} {
  const [data, setData] = useState<FundingDataset | null>(cached)
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
        if (live) setError(err instanceof Error ? err.message : "Funding data failed to load")
      })
    return () => {
      live = false
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, retry }
}
