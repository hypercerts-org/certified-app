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
import {
  isOnboardingDismissed,
  markOnboardingDismissed,
  clearOnboardingDismissed,
} from "./dismissed-sentinel"
import { markTourPending } from "@/lib/tour/tour-sentinel"

/**
 * Bluesky seed values surfaced by /api/resolve-did. The shape
 * mirrors the route's `blueskyProfile` field exactly.
 */
export interface BlueskySeed {
  readonly displayName?: string
  readonly description?: string
  readonly avatar?: string
  readonly banner?: string
}

export interface OnboardingContextValue {
  /**
   * Modal visibility. True when the gate condition holds (first
   * signin + has-bsky + no-certified + not-dismissed + personal-context),
   * OR when something explicitly called `openOnboarding()`.
   */
  readonly isOpen: boolean
  /** Bsky seed values for Step 1's form. `null` until the resolve-did
   *  lookup completes, or if the lookup returned no bsky profile. */
  readonly bskySeed: BlueskySeed | null
  /** True once we've fetched the gate-relevant state for this DID
   *  at least once. Consumers can use this to render banners only
   *  after the underlying state is known. */
  readonly isReady: boolean
  /** True when the user has a bsky profile but no certified profile
   *  yet. Banner-visible gate (independent of the dismissed sentinel). */
  readonly shouldShowBanner: boolean
  /** Open the modal from a manual trigger (banner click, settings
   *  card). Does NOT clear the dismissed sentinel — that flag only
   *  governs the auto-popup. */
  openOnboarding: () => void
  /** User skipped or closed the modal. Sets the dismissed sentinel
   *  so the modal doesn't auto-pop again, but the banner stays
   *  visible until they finish onboarding. */
  dismissOnboarding: () => void
  /** User finished onboarding successfully. Clears the sentinel
   *  for symmetry — once they have a certified profile the gate
   *  condition is naturally false anyway, so the sentinel is moot. */
  completeOnboarding: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(
  undefined,
)

interface OnboardingState {
  /** True when /api/resolve-did has succeeded for the current DID. */
  isReady: boolean
  hasCertifiedProfile: boolean
  hasBlueskyProfile: boolean
  bskySeed: BlueskySeed | null
}

const EMPTY_STATE: OnboardingState = {
  isReady: false,
  hasCertifiedProfile: false,
  hasBlueskyProfile: false,
  bskySeed: null,
}

interface ResolveDidPayload {
  hasCertifiedProfile?: boolean
  hasBlueskyProfile?: boolean
  blueskyProfile?: BlueskySeed | null
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, did } = useAuth()
  const { activeOrg } = useOrg()

  const [state, setState] = useState<OnboardingState>(EMPTY_STATE)
  const [isOpen, setIsOpen] = useState(false)
  // Track which DID the modal was auto-popped for so account switches
  // get a fresh popup decision instead of inheriting the previous DID's
  // open state.
  const [autoPoppedDid, setAutoPoppedDid] = useState<string | null>(null)

  // Adjust state during render for the signed-out branch — resetting to
  // the initializer values must not wait for an effect pass.
  const authKey = `${isAuthenticated}|${did}`
  const [prevAuthKey, setPrevAuthKey] = useState(authKey)
  if (prevAuthKey !== authKey) {
    setPrevAuthKey(authKey)
    if (!isAuthenticated || !did) {
      setState(EMPTY_STATE)
      setIsOpen(false)
      setAutoPoppedDid(null)
    }
  }

  // Re-fetch gate state whenever the active personal DID changes.
  // Personal DID only — org sessions are out of scope (separate flow).
  useEffect(() => {
    if (!isAuthenticated || !did) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/resolve-did?did=${encodeURIComponent(did)}`,
          { cache: "no-store" },
        )
        if (!res.ok) {
          if (!cancelled) setState({ ...EMPTY_STATE, isReady: true })
          return
        }
        const data = (await res.json()) as ResolveDidPayload
        if (cancelled) return
        setState({
          isReady: true,
          hasCertifiedProfile: !!data.hasCertifiedProfile,
          hasBlueskyProfile: !!data.hasBlueskyProfile,
          bskySeed: data.blueskyProfile ?? null,
        })
      } catch {
        if (!cancelled) setState({ ...EMPTY_STATE, isReady: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, did])

  // Auto-popup decision: fire once per DID per session, only when
  // every gate condition holds AND we haven't already auto-popped for
  // this DID this session.
  useEffect(() => {
    if (!did) return
    if (!state.isReady) return
    if (activeOrg) return // org-context — skip
    if (state.hasCertifiedProfile) return
    if (!state.hasBlueskyProfile) return
    if (isOnboardingDismissed(did)) return
    if (autoPoppedDid === did) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- once-per-DID auto-popup decision fired when the async resolve-did gate data settles; the autoPoppedDid latch prevents re-fire and no user event exists to host this
    setAutoPoppedDid(did)
    setIsOpen(true)
  }, [
    did,
    state.isReady,
    state.hasCertifiedProfile,
    state.hasBlueskyProfile,
    activeOrg,
    autoPoppedDid,
  ])

  const openOnboarding = useCallback(() => {
    setIsOpen(true)
  }, [])

  const dismissOnboarding = useCallback(() => {
    setIsOpen(false)
    if (did) markOnboardingDismissed(did)
  }, [did])

  const completeOnboarding = useCallback(() => {
    // Do NOT close the modal here — the modal's success view paints
    // when commit.status === "success". The user closes it via the
    // explicit "Take me to my profile" button on that screen.
    if (did) clearOnboardingDismissed(did)
    // Queue the product walk-through to auto-start on the next load. The
    // success screen does a full page reload to the profile page, so the
    // "just onboarded" intent has to survive in localStorage rather than
    // in memory; TourProvider reads + clears this flag after the reload.
    if (did) markTourPending(did)
    // Optimistically reflect the finished state so the banner
    // disappears immediately; the next resolve-did fetch will
    // confirm.
    setState((prev) => ({ ...prev, hasCertifiedProfile: true }))
  }, [did])

  // Banner visibility is independent of the dismissed sentinel —
  // the sentinel only suppresses the auto-popup. Once the user has
  // a certified profile the banner disappears naturally.
  const shouldShowBanner =
    state.isReady &&
    !!did &&
    !activeOrg &&
    !state.hasCertifiedProfile &&
    state.hasBlueskyProfile

  const value = useMemo<OnboardingContextValue>(
    () => ({
      isOpen,
      bskySeed: state.bskySeed,
      isReady: state.isReady,
      shouldShowBanner,
      openOnboarding,
      dismissOnboarding,
      completeOnboarding,
    }),
    [
      isOpen,
      state.bskySeed,
      state.isReady,
      shouldShowBanner,
      openOnboarding,
      dismissOnboarding,
      completeOnboarding,
    ],
  )

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error("useOnboarding must be used within an OnboardingProvider")
  }
  return ctx
}
