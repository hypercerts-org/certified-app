"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchEndorsements, type IndexerEndorsementRecord } from "@/lib/atproto/indexer"

export interface EvaluatorAttribution {
  evaluatorDid: string
  createdAt: string
}

export interface TrustedEndorsedDidsResult {
  endorsedDids: Set<string>
  /** Map from endorsed subject DID to the list of evaluators who endorsed them. */
  attribution: Map<string, EvaluatorAttribution[]>
  totalEndorsements: number
  isLoading: boolean
  error: string | null
}

const EMPTY_SET = new Set<string>()
const EMPTY_MAP = new Map<string, EvaluatorAttribution[]>()

const STALE_TIME = 5 * 60 * 1000 // 5 minutes

// Single-entry module-level cache. Only one stableKey is active at a time,
// so we discard on key change to prevent unbounded growth.
let cache: {
  key: string
  data: { endorsedDids: Set<string>; attribution: Map<string, EvaluatorAttribution[]>; totalEndorsements: number }
  fetchedAt: number
} | null = null

function buildTrustedEndorsedDids(records: IndexerEndorsementRecord[]) {
  // Dedup by (author, subject) -- multiple endorsements from the same
  // evaluator for the same subject collapse into one. Keep the most recent.
  const byPair = new Map<string, IndexerEndorsementRecord>()
  for (const r of records) {
    const key = `${r.author}\0${r.subject}`
    const existing = byPair.get(key)
    if (!existing || r.createdAt > existing.createdAt) {
      byPair.set(key, r)
    }
  }
  const endorsedDids = new Set<string>()
  const attribution = new Map<string, EvaluatorAttribution[]>()
  for (const r of byPair.values()) {
    endorsedDids.add(r.subject)
    const existing = attribution.get(r.subject) ?? []
    existing.push({ evaluatorDid: r.author, createdAt: r.createdAt })
    attribution.set(r.subject, existing)
  }
  return { endorsedDids, attribution, totalEndorsements: byPair.size }
}

/**
 * Fetches all endorsement records authored by the given active
 * evaluator list and derives both the endorsed-DID set (for filtering
 * the feed) and an attribution map (for the "Endorsed by ..." chip
 * on each activity card).
 *
 * Empty activeEvaluators returns empty results without a network call.
 *
 * Uses a module-level cache with 5min stale time. Refetches on
 * window focus when stale.
 */
export function useTrustedEndorsedDids(
  activeEvaluators: string[],
  stableKey: string,
): TrustedEndorsedDidsResult {
  const [endorsedDids, setEndorsedDids] = useState<Set<string>>(EMPTY_SET)
  const [attribution, setAttribution] = useState<Map<string, EvaluatorAttribution[]>>(EMPTY_MAP)
  const [totalEndorsements, setTotalEndorsements] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stableKeyRef = useRef(stableKey)
  stableKeyRef.current = stableKey

  const activeEvaluatorsRef = useRef(activeEvaluators)
  activeEvaluatorsRef.current = activeEvaluators

  const doFetch = useCallback(
    async (evaluators: string[], key: string, signal?: AbortSignal) => {
      if (evaluators.length === 0) {
        setEndorsedDids(EMPTY_SET)
        setAttribution(EMPTY_MAP)
        setTotalEndorsements(0)
        setIsLoading(false)
        return
      }

      // Check single-entry cache
      if (cache && cache.key === key && Date.now() - cache.fetchedAt < STALE_TIME) {
        setEndorsedDids(cache.data.endorsedDids)
        setAttribution(cache.data.attribution)
        setTotalEndorsements(cache.data.totalEndorsements)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const records = await fetchEndorsements({ authors: evaluators, signal })
        if (signal?.aborted) return
        const data = buildTrustedEndorsedDids(records)
        cache = { key, data, fetchedAt: Date.now() }
        setEndorsedDids(data.endorsedDids)
        setAttribution(data.attribution)
        setTotalEndorsements(data.totalEndorsements)
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch endorsements:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch endorsements")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [],
  )

  // Fetch on mount and when the evaluator selection changes
  useEffect(() => {
    const controller = new AbortController()
    doFetch(activeEvaluators, stableKey, controller.signal)
    return () => controller.abort()
  }, [stableKey, activeEvaluators, doFetch])

  // Refetch on window focus when data is stale
  useEffect(() => {
    const handleFocus = () => {
      const currentKey = stableKeyRef.current
      if (!cache || cache.key !== currentKey || Date.now() - cache.fetchedAt >= STALE_TIME) {
        doFetch(activeEvaluatorsRef.current, currentKey)
      }
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [doFetch])

  return { endorsedDids, attribution, totalEndorsements, isLoading, error }
}
