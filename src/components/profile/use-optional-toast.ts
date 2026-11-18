"use client"

import { useToast } from "@/components/ui/toast"

/**
 * The app's toasts, or null outside a `<ToastProvider>` (a test, a surface
 * rendered on its own): the caller then says it inline. A failed Follow,
 * Unfollow or Revoke is an error toast, as a failed Like is (DESIGN.md
 * §10.1), so the action row never shifts. Mirrors the Like button's own.
 */
export function useOptionalToast(): ReturnType<typeof useToast> | null {
  try {
    return useToast()
  } catch {
    return null
  }
}
