"use client"

import { useEffect, useState } from "react"
import { isEthereumAddress, peekEns, resolveEns } from "@/lib/ens/resolve-ens"

/**
 * Resolve one Ethereum address to its ENS name + avatar through the shared
 * `/api/ens` coalescer. `name` / `avatar` / `isLoading` are derived
 * directly from the session cache (via `peekEns`), so an address resolved
 * earlier renders with no loading flash; the effect only nudges a
 * re-render once a fresh lookup settles. Never throws — an address without
 * a reverse record (or a failed lookup) settles to `name: null`, and the
 * caller falls back to the raw address.
 */
export function useEnsName(address: string | null | undefined): {
  name: string | null
  avatar: string | null
  isLoading: boolean
} {
  const valid = isEthereumAddress(address) ? address.trim() : null
  // Re-render trigger: the resolved value lives in the module cache, so we
  // only need to know "something settled", not carry it in state.
  const [, bump] = useState(0)

  useEffect(() => {
    // Already cached (resolved or known-missing) — the derived read covers
    // it, no fetch needed.
    if (!valid || peekEns(valid) !== undefined) return
    let cancelled = false
    resolveEns(valid).then(() => {
      if (!cancelled) bump((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [valid])

  const profile = valid ? peekEns(valid) : undefined
  return {
    name: profile?.name ?? null,
    avatar: profile?.avatar ?? null,
    isLoading: valid != null && profile === undefined,
  }
}
