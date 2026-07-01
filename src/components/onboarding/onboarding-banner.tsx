"use client"

import { Sparkles, ChevronRight } from "lucide-react"
import { useOnboarding } from "@/lib/onboarding/onboarding-context"

/**
 * Re-entry banner for users who skipped the first-signin onboarding
 * modal. Renders on the viewer's own profile when they have a
 * Bluesky profile but no Certified profile yet. The whole banner is
 * a button — click anywhere on it to re-open the onboarding modal.
 *
 * Sits inside the page content (24px lateral margin / 16px top)
 * matching the inline edit banner so the spacing under the navbar
 * is consistent across surfaces.
 */
export default function OnboardingBanner() {
  const { shouldShowBanner, openOnboarding } = useOnboarding()
  if (!shouldShowBanner) return null
  return (
    <button
      type="button"
      className="onboarding-banner"
      onClick={openOnboarding}
      aria-label="Finish setting up your Certified profile"
    >
      <Sparkles
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className="onboarding-banner__icon"
      />
      <span className="onboarding-banner__title">
        Finish setting up your Certified profile
      </span>
      <ChevronRight
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className="onboarding-banner__chevron"
      />
    </button>
  )
}
