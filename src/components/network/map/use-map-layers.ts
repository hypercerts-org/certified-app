"use client"

import { useCallback, useState } from "react"
import { useSearchParams } from "next/navigation"
import { DEFAULT_LAYERS, LAYERS, type Layer } from "@/lib/map/model"

const KEY = "layers"
const isLayer = (v: string): v is Layer => (LAYERS as readonly string[]).includes(v)

function parse(raw: string | null): Set<Layer> {
  if (raw === null) return new Set(DEFAULT_LAYERS)
  return new Set(raw.split(",").filter(isLayer))
}

const isDefault = (s: ReadonlySet<Layer>) => s.size === DEFAULT_LAYERS.length && DEFAULT_LAYERS.every((l) => s.has(l))

/**
 * The map's layer chips, kept in the address (`?layers=activity,project`;
 * left out for the default). State is the source of truth and the address
 * follows it, so quick clicks never act on a stale value; the address is
 * written straight to history with a null state, as the funding chips do, so
 * Next.js keeps its search params in step without a navigation.
 */
export interface MapLayers {
  layers: ReadonlySet<Layer>
  toggle: (layer: Layer) => void
  /** Back to the default layers (activities and projects). */
  reset: () => void
  /** How many layers differ from the default: the phone Filters count. */
  changed: number
}

function writeAddress(next: ReadonlySet<Layer>): void {
  const search = new URLSearchParams(window.location.search)
  if (isDefault(next)) search.delete(KEY)
  else search.set(KEY, LAYERS.filter((l) => next.has(l)).join(","))
  const qs = search.toString()
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
}

export function useMapLayers(): MapLayers {
  const params = useSearchParams()
  const [layers, setLayers] = useState<Set<Layer>>(() => parse(params.get(KEY)))

  const toggle = useCallback((layer: Layer) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      writeAddress(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    const next = new Set(DEFAULT_LAYERS)
    writeAddress(next)
    setLayers(next)
  }, [])

  const changed = LAYERS.filter((l) => layers.has(l) !== DEFAULT_LAYERS.includes(l)).length

  return { layers, toggle, reset, changed }
}
