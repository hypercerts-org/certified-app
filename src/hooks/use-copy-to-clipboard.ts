"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Click-to-copy state with an auto-resetting "Copied" flag.
 *
 * `copy(value)` writes to the clipboard and flips `copied` true for
 * `resetMs` (default 1500). The reset timer is cleared on unmount and on a
 * re-copy, so it never calls setState on an unmounted component. Clipboard
 * failures (unsupported / denied) are swallowed and leave `copied` false —
 * the affordance is non-critical.
 *
 * Centralises the click-to-copy pattern that was reimplemented across the
 * funding detail modal, the wallet-address primitive, the profile sidebar,
 * and the locations map.
 */
export function useCopyToClipboard(
  resetMs = 1500
): { copied: boolean; copy: (value: string) => Promise<void> } {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const copy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        // Clipboard unavailable / denied — silently do nothing.
        return
      }
      setCopied(true)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setCopied(false)
        timerRef.current = null
      }, resetMs)
    },
    [resetMs]
  )

  return { copied, copy }
}
