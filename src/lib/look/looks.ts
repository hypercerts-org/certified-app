"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Styles ("looks"): experimental design directions for the whole app, picked
 * in Settings → Appearance and kept in this browser. Each one redefines the
 * design tokens (colours light and dark, typefaces, corners, shadows) in
 * src/app/styles/looks.css under `html[data-look="<id>"]`, so every page
 * changes at once. "neutral" is the app as designed (no attribute).
 *
 * From the design-directions exploration (Almanac … Stamp). This is the
 * token level only: the directions' signature pieces (Banknote's seal,
 * Wallet's pass, Glass's cover photo …) are not built.
 */
export const LOOKS = [
  {
    id: "neutral",
    name: "Neutral",
    description: "Certified's own look: monochrome, serif names, 2px corners.",
  },
  {
    id: "almanac",
    name: "Almanac",
    description: "Monochrome taken all the way: a large serif, mono labels, ink rules, no corners.",
  },
  {
    id: "linen",
    name: "Linen",
    description: "The calm of a private bank: warm neutrals, light names, soft panels, serif numbers.",
  },
  {
    id: "banknote",
    name: "Banknote",
    description: "Passport and banknote craft: intaglio blue on paper, a note-green accent.",
  },
  {
    id: "wallet",
    name: "Wallet",
    description: "The account as a pass you carry: Geist, rounded cells on a grouped grey.",
  },
  {
    id: "dots",
    name: "Dot matrix",
    description: "A calm grotesk with dot-matrix numbers and mono labels on a dot field.",
  },
  {
    id: "glass",
    name: "Glass",
    description: "Content leads, chrome floats: translucent panels over a landscape gradient.",
  },
  {
    id: "shapes",
    name: "Shapes",
    description: "Round type, tonal colour and a friendly purple; soft, large corners.",
  },
  {
    id: "stamp",
    name: "Stamp",
    description: "Two spot inks on newsprint: condensed capitals, riso blue and pink, hard shadows.",
  },
] as const

export type LookId = (typeof LOOKS)[number]["id"]

export const DEFAULT_LOOK: LookId = "neutral"

/** Where the choice is kept (this browser only). */
export const LOOK_STORAGE_KEY = "certified_look"

const LOOK_IDS: readonly string[] = LOOKS.map((l) => l.id)

export function isLookId(value: unknown): value is LookId {
  return typeof value === "string" && LOOK_IDS.includes(value)
}

/**
 * Runs in <head> before first paint (root layout), so a chosen style never
 * flashes the default first: reads the stored id and, if it is a known
 * non-default one, sets `data-look` on <html>.
 */
export const LOOK_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem(${JSON.stringify(
  LOOK_STORAGE_KEY,
)});var ids=${JSON.stringify(LOOK_IDS.filter((id) => id !== DEFAULT_LOOK))};if(l&&ids.indexOf(l)>-1)document.documentElement.setAttribute("data-look",l)}catch(e){}})()`

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The style on the page now (the attribute is the source of truth). */
export function currentLook(): LookId {
  if (typeof document === "undefined") return DEFAULT_LOOK
  const value = document.documentElement.getAttribute("data-look")
  return isLookId(value) ? value : DEFAULT_LOOK
}

/** Apply a style to the page and remember it in this browser. */
export function applyLook(id: LookId) {
  const root = document.documentElement
  if (id === DEFAULT_LOOK) root.removeAttribute("data-look")
  else root.setAttribute("data-look", id)
  try {
    if (id === DEFAULT_LOOK) window.localStorage.removeItem(LOOK_STORAGE_KEY)
    else window.localStorage.setItem(LOOK_STORAGE_KEY, id)
  } catch {
    // Storage unavailable: the style still applies until reload.
  }
  for (const listener of listeners) listener()
}

/** The current style and a setter, for the Settings picker. */
export function useLook(): [LookId, (id: LookId) => void] {
  const look = useSyncExternalStore(subscribe, currentLook, () => DEFAULT_LOOK)
  const set = useCallback((id: LookId) => applyLook(id), [])
  return [look, set]
}
