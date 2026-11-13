"use client"

import Link from "next/link"
import { Eye } from "lucide-react"

interface ProfileOwnerBarProps {
  /** The viewer is acting as this group (rather than viewing their own
   *  personal profile). Changes "your profile" to "this group's profile". */
  isGroup?: boolean
  /** The group's settings, for its owners and admins. */
  groupSettingsHref?: string
}

/**
 * The slim bar at the top of your own profile (or your group's, while
 * acting as it): it says this is the public view and offers the way back
 * Home, plus the group's settings for its admins. "Edit profile" lives in
 * the header's actions.
 */
export default function ProfileOwnerBar({
  isGroup = false,
  groupSettingsHref,
}: ProfileOwnerBarProps) {
  return (
    <div className="profile-owner-bar" role="note">
      <p className="profile-owner-bar__text">
        <Eye size={16} strokeWidth={1.75} aria-hidden />
        {isGroup
          ? "This is how others see this group's profile."
          : "This is how others see your profile."}
      </p>
      <div className="profile-owner-bar__links">
        {groupSettingsHref ? (
          <Link href={groupSettingsHref} className="profile-owner-bar__link">
            Group settings
          </Link>
        ) : null}
        <Link href="/home" className="profile-owner-bar__link">
          Back to Home
        </Link>
      </div>
    </div>
  )
}
