"use client"

import Link from "next/link"
import { Eye } from "lucide-react"

interface ProfileOwnerBarProps {
  /** The viewer is acting as this group (rather than viewing their own
   *  personal profile). Changes "your profile" to "this group's profile". */
  isGroup?: boolean
  /** Enters edit mode. */
  onEditClick: () => void
}

/**
 * The slim bar at the top of your own profile: it says this is the public
 * view and offers the two ways on, editing the profile or going back Home.
 */
export default function ProfileOwnerBar({
  isGroup = false,
  onEditClick,
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
        <button
          type="button"
          className="profile-owner-bar__link"
          onClick={onEditClick}
        >
          Edit profile
        </button>
        <Link href="/home" className="profile-owner-bar__link">
          Back to Home
        </Link>
      </div>
    </div>
  )
}
