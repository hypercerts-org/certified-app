"use client"

import { useEffect } from "react"
import { ThemeProvider } from "next-themes"
import { CUSTOM_LOOKS_STORAGE_KEY } from "@/lib/look/looks"

/** Made styles' saved CSS can predate a fix to how the app draws them:
 *  once the page is idle, rebuild it if so (syncCustomLooksCss). The code
 *  for that loads only in a browser that has made styles. */
function useFreshMadeStyles() {
  useEffect(() => {
    let made = false
    try {
      made = !!window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY)
    } catch {
      // Storage blocked: nothing saved to rebuild.
    }
    if (!made) return
    const sync = () => {
      import("@/lib/look/custom-looks").then((m) => m.syncCustomLooksCss()).catch(() => {})
    }
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(sync)
    else window.setTimeout(sync, 1)
  }, [])
}

export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode
  /** Per-request CSP nonce for next-themes' inline anti-flash script. */
  nonce?: string
}) {
  useFreshMadeStyles()
  return (
    <ThemeProvider
      attribute="data-theme"
      // Follow the device until the person picks Light or Dark (Settings ›
      // Appearance); signed-out visitors have no picker, so this is theirs.
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  )
}
