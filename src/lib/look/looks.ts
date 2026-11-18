"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  DEFAULT_LOOK,
  LOOK_STORAGE_KEY,
  isAnyLookId,
  type AnyLookId,
} from "./look-data"

// The styles' data lives in look-data.ts (no "use client", so the root
// layout can read LOOK_INIT_SCRIPT on the server); re-exported here so
// callers keep one import.
export {
  CUSTOM_LOOKS_CSS_STORAGE_KEY,
  CUSTOM_LOOKS_STORAGE_KEY,
  CUSTOM_LOOKS_STYLE_ID,
  DEFAULT_LOOK,
  LOOKS,
  LOOK_INIT_SCRIPT,
  LOOK_STORAGE_KEY,
  isAnyLookId,
  isCustomLookId,
  isLookId,
} from "./look-data"
export type { AnyLookId, CustomLookId, LookId } from "./look-data"

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
