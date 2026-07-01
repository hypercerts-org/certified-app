"use client"

import { useEffect, useState } from "react"
import { fetchTrustedEvaluatorDids } from "@/lib/atproto/trusted-evaluators"

/**
 * Live trusted-evaluator DID set, sourced from the curated
 * `list:accounts` record (`TRUSTED_EVALUATORS_LIST_URI`) — the sole
 * source of truth. Editing that list in-app changes the evaluators with
 * no deploy.
 *
 * Resolves once per session: a module-level cache + shared in-flight
 * promise mean repeated mounts (the home-feed popover, the activity
 * detail funding modal) skip the network read. Until it resolves — and
 * if the read fails — callers get an empty set (no expansion), never a
 * stale hardcoded list.
 */

let cache: string[] | null = null
let inflight: Promise<string[]> | null = null

export function useTrustedEvaluators(): {
  evaluatorDids: string[]
  isLoading: boolean
} {
  const [evaluatorDids, setEvaluatorDids] = useState<string[]>(
    () => cache ?? [],
  )
  const [isLoading, setIsLoading] = useState<boolean>(() => cache === null)

  useEffect(() => {
    let cancelled = false
    if (!cache && !inflight) {
      inflight = fetchTrustedEvaluatorDids().then((dids) => {
        cache = dids
        return dids
      })
      inflight.finally(() => {
        inflight = null
      })
    }
    // setState only inside the async resolution — never synchronously in
    // the effect body — so a cache hit and the fetch path share one path.
    const pending = cache ? Promise.resolve(cache) : inflight
    pending?.then((dids) => {
      if (cancelled) return
      setEvaluatorDids(dids)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { evaluatorDids, isLoading }
}
