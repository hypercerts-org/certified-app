"use client"

import { useCallback, useSyncExternalStore } from "react"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { SIDEBAR_ATTR, SIDEBAR_STORAGE_KEY } from "./sidebar-init-script"

/**
 * Whether the desktop sidebar is collapsed to its rail (from 1300px, where
 * it is otherwise full). Below 1300px it is always the rail, whatever this
 * says.
 *
 * Held as `data-sidebar="rail"` on <html> (CSS switches the layout from
 * it, with no JS breakpoint) and remembered in this browser
 * (localStorage). `SIDEBAR_INIT_SCRIPT` (sidebar-init-script.ts) sets the
 * attribute before first paint, so a collapsed sidebar never flashes open.
 */
const KEY = SIDEBAR_STORAGE_KEY
const ATTR = SIDEBAR_ATTR

const listeners = new Set<() => void>()

function read(): boolean {
  return document.documentElement.dataset[ATTR] === "rail"
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function write(collapsed: boolean) {
  if (collapsed) document.documentElement.dataset[ATTR] = "rail"
  else delete document.documentElement.dataset[ATTR]
  try {
    if (collapsed) localStorage.setItem(KEY, "rail")
    else localStorage.removeItem(KEY)
  } catch {
    // Storage may be unavailable; the choice then lasts for this page.
  }
  for (const listener of listeners) listener()
}

/** The collapsed state and a setter. The server (and hydration) reads
 *  "not collapsed"; the real state follows right after. */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false)
  const set = useCallback((next: boolean) => write(next), [])
  return [collapsed, set]
}

/** True when the full sidebar shows: from 1300px and not collapsed. */
export function useSidebarIsFull(): boolean {
  const { isFullDesktop } = useLayoutBreakpoints()
  const [collapsed] = useSidebarCollapsed()
  return isFullDesktop && !collapsed
}
