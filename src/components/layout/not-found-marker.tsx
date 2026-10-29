"use client"

import { useEffect, useSyncExternalStore } from "react"

/**
 * Lets the app chrome know the current route rendered a not-found page.
 *
 * The desktop top bar derives its rows (profile tab strip, record detail
 * tabs) from the pathname alone, so a "Profile not found" page at
 * `/{handle}` would otherwise still show Overview / Activities / … tabs for
 * an actor that doesn't exist. `not-found.tsx` renders <NotFoundMarker />;
 * the chrome reads `useIsNotFound()` and drops those rows.
 *
 * The store is a mount counter rather than a boolean so overlapping
 * mounts (StrictMode's double effect, a not-found page replacing another)
 * can't clear the flag early: it stays set until the last marker unmounts,
 * which happens on navigation away from the not-found page.
 */

let mountedMarkers = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return mountedMarkers > 0
}

// The marker only flips the flag after mount, so the server render and the
// hydration pass both read "found" and the chrome hydrates without mismatch.
function getServerSnapshot() {
  return false
}

/**
 * Flags the route as not-found while mounted. The hidden `data-not-found`
 * span is in the server HTML, so CSS (layout.css) hides the tab rows before
 * hydration; the hook takes over once the effect has run.
 */
export default function NotFoundMarker() {
  useEffect(() => {
    mountedMarkers += 1
    emit()
    return () => {
      mountedMarkers -= 1
      emit()
    }
  }, [])
  return <span hidden data-not-found="" />
}

/** True while a <NotFoundMarker /> is mounted (i.e. on a not-found page). */
export function useIsNotFound(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
