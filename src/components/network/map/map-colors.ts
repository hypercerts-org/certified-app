"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

/** Map colours, resolved from tokens for canvas drawing (see tokens.css
 *  "Map"). Transparency is applied with globalAlpha at draw time. */
export interface MapColors {
  sea: string
  land: string
  border: string
  /** The ring drawn around marks so overlaps stay legible: the land colour. */
  halo: string
  activity: string
  project: string
  org: string
  unused: string
  fg: string
  muted: string
  canvas: string
  elevated: string
  /** Changes whenever the colours are re-read; empty until the first read. */
  key: string
}

const TOKENS = {
  sea: "--map-sea",
  land: "--map-land",
  border: "--map-border",
  halo: "--map-land",
  activity: "--map-activity",
  project: "--map-project",
  org: "--map-org",
  unused: "--map-unused",
  fg: "--fg-primary",
  muted: "--fg-muted",
  canvas: "--bg-canvas",
  elevated: "--bg-elevated",
} as const

type Key = keyof typeof TOKENS
const EMPTY = Object.fromEntries([...Object.keys(TOKENS), "key"].map((k) => [k, ""])) as unknown as MapColors

/**
 * Token colours for the map canvas, re-read when the theme or the look
 * changes. Each token goes through a probe element, so whatever colour
 * syntax a token uses comes back as a computed colour the canvas accepts.
 */
export function useMapColors(): MapColors {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<MapColors>(EMPTY)
  useEffect(() => {
    const read = () => {
      const probe = document.createElement("span")
      probe.style.display = "none"
      document.body.appendChild(probe)
      const next = {} as Record<Key, string>
      for (const k of Object.keys(TOKENS) as Key[]) {
        probe.style.color = `var(${TOKENS[k]})`
        next[k] = getComputedStyle(probe).color
      }
      probe.remove()
      const key = Object.values(next).join("|")
      setColors((prev) => (prev.key === key ? prev : { ...next, key }))
    }
    const id = requestAnimationFrame(read)
    const mo = new MutationObserver(() => requestAnimationFrame(read))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-look", "style"] })
    return () => {
      cancelAnimationFrame(id)
      mo.disconnect()
    }
  }, [resolvedTheme])
  return colors
}
