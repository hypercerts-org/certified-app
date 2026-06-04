"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import Banner from "@/components/ui/banner"
import { useManagesAnyGroup } from "@/lib/groups/managed"
import { useManagedProjects } from "@/hooks/use-managed-projects"

const DISMISS_KEY = "certified:profile-managed-bridge:dismissed"

interface ProfileManagedBridgeProps {
  /** Only the viewer's OWN profile shows the bridge — a foreign profile
   *  is one public identity and never advertises the viewer's groups. */
  isOwnProfile: boolean
}

/**
 * Own-profile bridge to the Managed surface.
 *
 * The public profile stays single-identity: group-owned projects are
 * deliberately NOT folded into the profile's Projects tab. Instead, on
 * the viewer's own profile we surface a dismissible link out — "You also
 * manage N projects via your groups → View in Managed" — so the
 * aggregated view is one click away without diluting the public profile.
 *
 * Gated three ways:
 *   - own profile only (foreign profiles never see it),
 *   - the viewer owns/admins at least one group, and
 *   - that aggregate actually contains group-owned projects (N > 0).
 *
 * Dismissal persists for the browser session (sessionStorage) so the
 * banner doesn't nag across tab navigations, while still returning on a
 * fresh session.
 */
export default function ProfileManagedBridge({
  isOwnProfile,
}: ProfileManagedBridgeProps) {
  const managesAnyGroup = useManagesAnyGroup()
  // Only pay for the aggregation when the cheap gates already pass.
  const eligible = isOwnProfile && managesAnyGroup

  const { items, isLoading } = useManagedProjects()

  // Count projects owned by a group (not the viewer's personal account).
  const groupProjectCount = useMemo(
    () => items.filter((it) => it.owner.kind === "group").length,
    [items],
  )

  // Dismiss state is session-scoped. The lazy initialiser returns false
  // during SSR (no `window`) and reads sessionStorage on the client's
  // first render. This is hydration-safe: the banner is also gated on
  // `isLoading` (the managed aggregation is still loading on first paint,
  // server AND client), so both render nothing until data lands — well
  // after hydration — by which point the dismiss flag is already settled.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      // sessionStorage can throw in private-mode / sandboxed contexts —
      // treat as "not dismissed" and carry on.
      return false
    }
  })

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Non-fatal — the banner still hides for this render.
    }
  }

  if (!eligible || dismissed || isLoading || groupProjectCount === 0) {
    return null
  }

  const noun = groupProjectCount === 1 ? "project" : "projects"

  return (
    <Banner
      variant="info"
      icon={false}
      onDismiss={handleDismiss}
      dismissLabel="Dismiss"
      className="profile-managed-bridge"
    >
      <span className="profile-managed-bridge__text">
        You also manage {groupProjectCount} {noun} via your groups.
      </span>{" "}
      <Link href="/managed" className="profile-managed-bridge__link">
        View in Managed
        <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
      </Link>
    </Banner>
  )
}
