"use client"

import { ThemeProvider } from "next-themes"

export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode
  /** Per-request CSP nonce for next-themes' inline anti-flash script. */
  nonce?: string
}) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  )
}
