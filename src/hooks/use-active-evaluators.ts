"use client"

import { useCallback, useMemo, useState } from "react"
import { TRUSTED_EVALUATORS } from "@/config/trusted-evaluators"

const STORAGE_KEY = "activeEvaluators.v1"

/**
 * Tracks which trusted evaluators the current user has toggled on.
 * Persisted to localStorage. Default: all evaluators from
 * TRUSTED_EVALUATORS enabled.
 *
 * Returns a `stableKey` derived from the active set (sorted, joined).
 * Downstream hooks should include this key in their dependency arrays
 * so toggling an evaluator produces a deterministic refetch.
 */
export function useActiveEvaluators() {
  const [active, setActive] = useState<Set<string>>(() => initialActive())

  const persist = useCallback((next: Set<string>) => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)))
  }, [])

  const toggle = useCallback(
    (did: string) => {
      setActive(prev => {
        const next = new Set(prev)
        if (next.has(did)) next.delete(did)
        else if (TRUSTED_EVALUATORS.includes(did)) next.add(did)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const selectAll = useCallback(() => {
    const next = new Set<string>(TRUSTED_EVALUATORS)
    persist(next)
    setActive(next)
  }, [persist])

  const deselectAll = useCallback(() => {
    const next = new Set<string>()
    persist(next)
    setActive(next)
  }, [persist])

  const activeList = useMemo(
    () => Array.from(active).sort(),
    [active],
  )

  const stableKey = useMemo(() => activeList.join(","), [activeList])

  return { active, activeList, toggle, selectAll, deselectAll, stableKey }
}

function initialActive(): Set<string> {
  if (typeof window === "undefined") {
    return new Set(TRUSTED_EVALUATORS)
  }
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return new Set(TRUSTED_EVALUATORS)
  try {
    const parsed = JSON.parse(stored) as string[]
    const valid = new Set(TRUSTED_EVALUATORS)
    // Prune entries no longer in the registry (evaluator removed from
    // TRUSTED_EVALUATORS). New entries are NOT silently added --
    // existing users keep their explicit opt-in set.
    return new Set(parsed.filter(d => valid.has(d)))
  } catch {
    return new Set(TRUSTED_EVALUATORS)
  }
}
