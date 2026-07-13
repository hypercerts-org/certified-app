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
  /** Index into the platform-filtered steps of the current step
   *  (0-based). Always clamped into range, even right after a layout
   *  flip shrinks the steps array. */
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset tour state on sign-out (external auth input); all three setStates bail out when already reset
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- once-per-DID auto-start decision (pending-flag check + clear) on auth/org settle; the autoCheckedDid latch prevents re-fire
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

  // Clamp against the current steps array so stepping back from an
  // index that overflowed after a layout flip lands on the new last
  // step instead of appearing dead for several clicks.
  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, Math.min(i, steps.length - 1) - 1))
  }, [steps.length])

  // If the layout flips mid-tour (crossing 800px swaps the desktop/mobile
  // nav steps, which can differ in length), the stored index can point
  // past the new end. Expose a clamped index instead of storing one —
  // every consumer (progress dots, "Step N of M", isLast) sees an
  // in-range value with no corrective re-render. `next` self-heals via
  // its own Math.min and `back` clamps above.
  const value = useMemo<TourContextValue>(() => {
    const effectiveStepIndex = Math.min(stepIndex, Math.max(0, steps.length - 1))
    const step =
      isActive && steps.length > 0 ? steps[effectiveStepIndex] : null
    return {
      isActive,
      stepIndex: effectiveStepIndex,
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
