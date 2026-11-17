"use client"

import { createPortal } from "react-dom"
import { useMounted } from "@/hooks/use-mounted"

/**
 * Dims the page, top bar included, while a menu opened from the phone pill
 * (Workspace, Network) is open, so it is clear the menu has the focus. The
 * pill stays above it, so you still see which item opened the menu.
 * Tapping it closes the menu through the popover's outside-click handling;
 * it keeps catching taps through its fade-out, so a tap never lands on
 * the page behind. The same `--scrim` as the sheets.
 */
export default function PillMenuScrim({ open }: { open: boolean }) {
  const mounted = useMounted()
  if (!mounted) return null
  return createPortal(
    <div className="pill-scrim" data-open={open ? "" : undefined} aria-hidden="true" />,
    document.body,
  )
}
