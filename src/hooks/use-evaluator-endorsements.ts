"use client"

import { useEffect, useMemo, useState } from "react"
import { fetchEvaluatorEndorsedDids } from "@/lib/atproto/trusted-evaluators"

/**
 * Resolve the union of subject DIDs endorsed by a chosen set of
 * trusted evaluators. Backs the home feed's transitive-graph
 * expansion: the returned DIDs are added to the viewer's direct
 * follow set before the feed query fires.
 *
 * Refetches when the selected-evaluators set changes (stringified
 * sorted key). Returns an empty Set while loading and on the empty-
 * selection case so the caller can blindly union without guarding.
 */
export function useEvaluatorEndorsements(selected: Set<string>) {
  const selectedKey = useMemo(
    () => (selected.size === 0 ? "" : Array.from(selected).sort().join(",")),
    [selected],
  )

  const [endorsedDids, setEndorsedDids] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(selected.size > 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (selectedKey === "") {
      setEndorsedDids(new Set())
      setIsLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    fetchEvaluatorEndorsedDids(selectedKey.split(","), controller.signal)
      .then((dids) => {
        if (controller.signal.aborted) return
        setEndorsedDids(dids)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load endorsements")
        setEndorsedDids(new Set())
        setIsLoading(false)
      })
    return () => controller.abort()
  }, [selectedKey])

  return { endorsedDids, isLoading, error }
}
