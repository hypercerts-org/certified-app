"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { TOUR_STEPS, type TourStep } from "./tour-steps"
import {
  isTourCompleted,
  markTourCompleted,
  isTourPending,
  clearTourPending,
} from "./tour-sentinel"

export interface TourContextValue {
  /** True while the walk-through is running. */
  readonly isActive: boolean
  /** Index into TOUR_STEPS of the current step (0-based). */
  readonly stepIndex: number
  /** The current step, or null when inactive. */
  readonly step: TourStep | null
  readonly totalSteps: number
  /** Manual start (e.g. the /help button). Ignores the completed/pending
   *  flags — always runs from the first step. */
  start: () => void
  /** Advance to the next step, finishing on the last one. */
  next: () => void
  /** Go back a step (no-op on the first). */
  back: () => void
  /** Dismiss early. Marks the tour completed so it won't auto-trigger. */
  skip: () => void
  /** Finish from the last step. Marks the tour completed. */
  finish: () => void
}

const TourContext = createContext<TourContextValue | undefined>(undefined)

export function TourProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, did } = useAuth()
  const { activeOrg } = useOrg()
  const { isDesktop } = useLayoutBreakpoints()

  // Steps that apply to the current layout. Desktop navigates from the
  // top-bar buttons; mobile from the hamburger sidebar — so each platform
  // gets its own nav steps (see `platform` in tour-steps).
  const steps = useMemo(
    () =>
      TOUR_STEPS.filter(
        (s) =>
          !s.platform || (s.platform === "desktop" ? isDesktop : !isDesktop),
      ),
    [isDesktop],
  )

  const [isActive, setIsActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  // Track which DID we've already made an auto-start decision for this
  // session, so account switches get a fresh decision but a single DID
  // never auto-starts twice.
  const [autoCheckedDid, setAutoCheckedDid] = useState<string | null>(null)

  // Reset everything when the signed-in identity goes away.
  useEffect(() => {
    if (!isAuthenticated || !did) {
      setIsActive(false)
      setStepIndex(0)
      setAutoCheckedDid(null)
    }
  }, [isAuthenticated, did])

  // Auto-start decision: once per DID per session, only in a personal
  // (non-org) context, only when onboarding flagged the tour pending and
  // it hasn't already been completed. Clears the pending flag immediately
  // so a later reload doesn't re-trigger.
  useEffect(() => {
    if (!isAuthenticated || !did) return
    if (activeOrg) return
    if (autoCheckedDid === did) return
    setAutoCheckedDid(did)
    if (isTourPending(did) && !isTourCompleted(did)) {
      clearTourPending(did)
      setStepIndex(0)
      setIsActive(true)
    }
  }, [isAuthenticated, did, activeOrg, autoCheckedDid])

  const start = useCallback(() => {
    setStepIndex(0)
    setIsActive(true)
  }, [])

  const endCompleted = useCallback(() => {
    setIsActive(false)
    setStepIndex(0)
    if (did) markTourCompleted(did)
  }, [did])

  // Pure-advance, clamped at the last step. Finishing from the last step
  // is handled by the renderer calling `finish` directly (its primary
  // button switches to "Finish" there), so `next` never runs past the end.
  const next = useCallback(() => {
    setStepIndex((i) => Math.min(steps.length - 1, i + 1))
  }, [steps.length])

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const value = useMemo<TourContextValue>(() => {
    const step =
      isActive && stepIndex >= 0 && stepIndex < steps.length
        ? steps[stepIndex]
        : null
    return {
      isActive,
      stepIndex,
      step,
      totalSteps: steps.length,
      start,
      next,
      back,
      skip: endCompleted,
      finish: endCompleted,
    }
  }, [isActive, stepIndex, steps, start, next, back, endCompleted])

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) {
    throw new Error("useTour must be used within a TourProvider")
  }
  return ctx
}
