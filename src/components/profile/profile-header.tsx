"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Pencil, UserPlus } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import { getInitials } from "@/lib/utils/initials"
import type { CertifiedProfile } from "@/lib/atproto/types"

interface ProfileHeaderProps {
  profile: CertifiedProfile | null
  avatarUrl: string | null
  bannerUrl: string | null
  handle: string | null
  did: string | null
  isOwnProfile: boolean
  /** Display string for activity claim count, e.g. "12" or "20+". */
  activityCountLabel: string
}

/**
 * Twitter/Bluesky-style profile header. Mobile-first.
 *
 * Layout (top to bottom):
 *   1. Full-bleed banner image (fallback gradient if no banner)
 *   2. Avatar overlapping the bottom-left of the banner (bordered, circular),
 *      with an Edit or Follow button on the right side of the same row
 *   3. Display name (bold), handle (small + muted)
 *   4. Activity claim count
 *   5. Description / bio
 *
 * The back arrow lives in the transparent navbar overlay above — NOT in
 * this component. Pages that use ProfileHeader should also call
 * useProfileNavbar() so the navbar renders as a transparent floating bar
 * with only the back arrow visible.
 */
export default function ProfileHeader({
  profile,
  avatarUrl,
  bannerUrl,
  handle,
  did,
  isOwnProfile,
  activityCountLabel,
}: ProfileHeaderProps) {
  const displayName = profile?.displayName || (handle ? `@${handle}` : "Anonymous")
  const initials = getInitials(profile?.displayName, did)

  // Track banner load failures so we fall back to the plain gradient
  // instead of showing the browser's broken-image icon. Reset the flag
  // when the URL changes (e.g. when the user switches profiles).
  const [bannerFailed, setBannerFailed] = useState(false)
  useEffect(() => {
    setBannerFailed(false)
  }, [bannerUrl])

  return (
    <header className="profile-hero">
      <div className="profile-hero__banner">
        {bannerUrl && !bannerFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            className="profile-hero__banner-img"
            onError={() => setBannerFailed(true)}
          />
        ) : null}
      </div>

      <div className="profile-hero__body">
        <div className="profile-hero__row">
          <div className="profile-hero__avatar-wrap">
            <Avatar
              size="xl"
              src={avatarUrl || undefined}
              fallbackInitials={initials}
            />
          </div>

          <div className="profile-hero__action">
            {isOwnProfile ? (
              <Link href="/settings/edit-profile">
                <Button variant="secondary" size="sm">
                  <Pencil size={14} />
                  Edit
                </Button>
              </Link>
            ) : (
              <Button variant="primary" size="sm">
                <UserPlus size={14} />
                Follow
              </Button>
            )}
          </div>
        </div>

        {isOwnProfile ? (
          <p className="profile-hero__eyebrow">Your profile</p>
        ) : null}
        <h1 className="profile-hero__name">{displayName}</h1>
        {handle ? <p className="profile-hero__handle">@{handle}</p> : null}

        <p className="profile-hero__count">
          <span className="profile-hero__count-value">{activityCountLabel}</span>
          <span className="profile-hero__count-label">
            {activityCountLabel === "1" ? "activity claim" : "activity claims"}
          </span>
        </p>

        {profile?.description ? (
          <p className="profile-hero__bio">{profile.description}</p>
        ) : null}
      </div>
    </header>
  )
}
