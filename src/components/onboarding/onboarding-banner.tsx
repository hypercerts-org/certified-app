"use client"

import { Sparkles } from "lucide-react"
import Button from "@/components/ui/button"
import { useOnboarding } from "@/lib/onboarding/onboarding-context"

/**
 * Re-entry banner for users who skipped the first-signin onboarding
 * modal. Renders on the viewer's own profile when they have a
 * Bluesky profile but no Certified profile yet. Clicking opens the
 * same modal that auto-opened (or would have) right after sign-in.
 *
 * Visibility is owned by the OnboardingContext (`shouldShowBanner`),
 * which is independent of the dismissed-auto-popup sentinel — this
 * banner is the recovery surface and stays until the user finishes
 * onboarding.
 */
export default function OnboardingBanner() {
  const { shouldShowBanner, openOnboarding } = useOnboarding()
  if (!shouldShowBanner) return null
  return (
    <div className="onboarding-banner" role="status">
      <Sparkles
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className="onboarding-banner__icon"
      />
      <div className="onboarding-banner__body">
        <span className="onboarding-banner__title">
          Finish setting up your Certified profile
        </span>
        <span className="onboarding-banner__desc">
          Bring your Bluesky profile and follows over — takes about a minute.
        </span>
      </div>
      <Button variant="primary" size="sm" onClick={openOnboarding}>
        Continue
      </Button>
    </div>
  )
}
