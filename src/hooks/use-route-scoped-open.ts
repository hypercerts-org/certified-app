"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"

/**
 * Open state for a menu or sheet that closes itself on navigation. The
 * menu counts as open only while the pathname is the one it was opened
 * on, so back/forward (which no click handler sees) closes it without an
 * effect.
 */
export function useRouteScopedOpen(): [boolean, (next: boolean) => void] {
  const pathname = usePathname()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn !== null && openOn === pathname
  return [open, (next: boolean) => setOpenOn(next ? pathname : null)]
}
