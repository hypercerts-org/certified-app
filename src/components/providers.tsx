"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { UIProvider } from "./ui"

// Lets design-system buttons and rows with an href navigate through the
// Next.js router instead of full page loads.
export function Providers({ children }: { children: ReactNode }) {
  return <UIProvider link={Link}>{children}</UIProvider>
}
