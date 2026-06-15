"use client"

import { useState, type ReactNode } from "react"

/**
 * Direction-aware enter animation for tab content panels (desktop).
 *
 * Wrap the per-tab content of a tabbed surface (profile sections, the
 * activity / project detail tabs) in this. On every `activeKey` change it
 * re-mounts the content (via `key`) and tags it with a slide-in class
 * whose direction comes from the key's position in `order` — moving to a
 * tab further right slides the new content in from the right, further left
 * from the left. The page chrome and the surface's own sidebar/aside sit
 * outside this wrapper, so only the content panel moves.
 *
 * The animation itself lives in `view-transitions.css`, gated to ≥800px and
 * disabled under `prefers-reduced-motion` — so below desktop (where the
 * full-page View Transitions slide still runs) and for reduced-motion users
 * this is an inert wrapper.
 */
export function TabPanelTransition({
  activeKey,
  order,
  children,
  className,
}: {
  /** The currently active tab's key. */
  activeKey: string
  /** Tab keys in their left-to-right strip order; drives slide direction. */
  order: readonly string[]
  children: ReactNode
  /** Extra class(es) on the wrapper. */
  className?: string
}) {
  // Track the previous key in state and derive the slide direction when it
  // changes — React's sanctioned "adjust state during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // Setting state during render (not in an effect, no ref read in render)
  // re-renders immediately with the new direction before commit.
  const [shown, setShown] = useState<{ key: string; dir: string }>({
    key: activeKey,
    dir: "",
  })
  if (shown.key !== activeKey) {
    const a = order.indexOf(shown.key)
    const b = order.indexOf(activeKey)
    const dir =
      a !== -1 && b !== -1
        ? b >= a
          ? "tab-panel--from-right"
          : "tab-panel--from-left"
        : ""
    setShown({ key: activeKey, dir })
  }

  return (
    <div
      key={activeKey}
      className={`tab-panel ${shown.dir} ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  )
}

export default TabPanelTransition
