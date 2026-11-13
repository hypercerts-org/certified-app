"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Styles ("looks"): experimental design directions for the whole app, picked
 * in Settings → Appearance and kept in this browser. Each one redefines the
 * design tokens (colours light and dark, typefaces, corners, shadows) in
 * src/app/styles/looks.css under `html[data-look="<id>"]`, so every page
 * changes at once. "neutral" is the app as designed (no attribute).
 *
 * From the design-directions exploration (Almanac … Stamp). Besides these,
 * a person can make their own from a website (Settings → Appearance, with
 * their Claude API key; custom-looks.ts): those have ids `custom-<8 chars>`
 * and their CSS lives in this browser, injected before paint.
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

/** A style made from a website (custom-looks.ts). */
export type CustomLookId = `custom-${string}`

/** Any style the page can wear: built in, or made from a website. */
export type AnyLookId = LookId | CustomLookId

export const DEFAULT_LOOK: LookId = "neutral"

/** Where the choice is kept (this browser only). */
export const LOOK_STORAGE_KEY = "certified_look"

/** The styles made from websites (JSON), and their compiled CSS. */
export const CUSTOM_LOOKS_STORAGE_KEY = "certified_custom_looks"
export const CUSTOM_LOOKS_CSS_STORAGE_KEY = "certified_custom_looks_css"

/** The <style> element that carries the made styles' CSS. */
export const CUSTOM_LOOKS_STYLE_ID = "custom-looks"

const LOOK_IDS: readonly string[] = LOOKS.map((l) => l.id)

/** Lowercase letters and digits only, so an id is safe in a selector. */
const CUSTOM_LOOK_ID = /^custom-[a-z0-9]{8}$/

export function isLookId(value: unknown): value is LookId {
  return typeof value === "string" && LOOK_IDS.includes(value)
}

export function isCustomLookId(value: unknown): value is CustomLookId {
  return typeof value === "string" && CUSTOM_LOOK_ID.test(value)
}

export function isAnyLookId(value: unknown): value is AnyLookId {
  return isLookId(value) || isCustomLookId(value)
}

/**
 * Runs in <head> before first paint (root layout), so a chosen style never
 * flashes the default first. Puts the made styles' CSS in place, then reads
 * the stored id and, if it is a known non-default style (or a made one
 * whose CSS is there), sets `data-look` on <html>.
 */
export const LOOK_INIT_SCRIPT = `(function(){try{var s=localStorage,l=s.getItem(${JSON.stringify(
  LOOK_STORAGE_KEY,
)}),c=s.getItem(${JSON.stringify(CUSTOM_LOOKS_CSS_STORAGE_KEY)});if(c){var e=document.createElement("style");e.id=${JSON.stringify(
  CUSTOM_LOOKS_STYLE_ID,
)};e.textContent=c;document.head.appendChild(e)}var ids=${JSON.stringify(
  LOOK_IDS.filter((id) => id !== DEFAULT_LOOK),
)};if(l&&(ids.indexOf(l)>-1||(c&&${CUSTOM_LOOK_ID.toString()}.test(l)&&c.indexOf('"'+l+'"')>-1)))document.documentElement.setAttribute("data-look",l)}catch(e){}})()`

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The style on the page now (the attribute is the source of truth). */
export function currentLook(): AnyLookId {
  if (typeof document === "undefined") return DEFAULT_LOOK
  const value = document.documentElement.getAttribute("data-look")
  return isAnyLookId(value) ? value : DEFAULT_LOOK
}

/** Apply a style to the page and remember it in this browser. */
export function applyLook(id: AnyLookId) {
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
export function useLook(): [AnyLookId, (id: AnyLookId) => void] {
  const look = useSyncExternalStore(subscribe, currentLook, () => DEFAULT_LOOK)
  const set = useCallback((id: AnyLookId) => applyLook(id), [])
  return [look, set]
}
