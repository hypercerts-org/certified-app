"use client"

import { useAuth } from "@/lib/auth/auth-context"
import { useUserActivities } from "./use-user-activities"

export function useActivities() {
  const { isAuthenticated, did } = useAuth()
  return useUserActivities(isAuthenticated ? did : null)
}
