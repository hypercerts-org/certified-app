"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Pencil, UserPlus, Settings as SettingsIcon } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import { getInitials } from "@/lib/utils/initials"
import { useProfilePds } from "@/hooks/use-profile-pds"
import type { CertifiedProfile } from "@/lib/atproto/types"

interface ProfileHeaderProps {
  profile: CertifiedProfile | null
  avatarUrl: string | null
  bannerUrl: string | null
  handle: string | null
  did: string | null
  /** Display string for activity claim count, e.g. "12" or "20+". */
  activityCountLabel: string
  /** If set, render an "Edit" button linking here (in place of Follow). */
  editHref?: string
  /** If set, render a Settings cog button next to Edit. Independent of
   *  editHref — a viewer might have manage-permissions without
   *  edit-profile permissions, or vice versa. */
  settingsHref?: string
  /** Small uppercase tag above the display name ("Your profile",
   *  "Acting as this group", etc.). */
  eyebrow?: string
}

/**
 * Twitter/Bluesky-style profile header. Mobile-first.
 *
 * Action buttons (right side of the avatar row):
 *   - editHref set  → "Edit" linking there
 *   - settingsHref set → Settings cog (icon-only) linking there
 *   - neither set → "Follow" button (no-op today; placeholder for the
 *     future follow flow)
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
  activityCountLabel,
  editHref,
  settingsHref,
  eyebrow,
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

  const hasAdminActions = !!editHref || !!settingsHref

  const { isBskyHosted } = useProfilePds(did)

  // Half-height when there's no real banner — a half-height gradient
  // panel reads as "no banner set" intentionally rather than
  // "loading" or "broken".
  const showBannerImage = !!bannerUrl && !bannerFailed
  const bannerClass = showBannerImage
    ? "profile-hero__banner"
    : "profile-hero__banner profile-hero__banner--empty"

  return (
    <header className="profile-hero">
      <div className={bannerClass}>
        {showBannerImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl!}
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
            {hasAdminActions ? (
              <div className="profile-hero__action-group">
                {editHref ? (
                  <Link href={editHref}>
                    <Button variant="secondary" size="sm">
                      <Pencil size={14} />
                      Edit
                    </Button>
                  </Link>
                ) : null}
                {settingsHref ? (
                  <Link href={settingsHref} aria-label="Group settings">
                    <Button variant="secondary" size="sm">
                      <SettingsIcon size={14} />
                    </Button>
                  </Link>
                ) : null}
              </div>
            ) : (
              <Button variant="primary" size="sm">
                <UserPlus size={14} />
                Follow
              </Button>
            )}
          </div>
        </div>

        {eyebrow ? <p className="profile-hero__eyebrow">{eyebrow}</p> : null}
        <h1 className="profile-hero__name">{displayName}</h1>
        {handle ? (
          <p className="profile-hero__handle">
            @{handle}
            {isBskyHosted ? (
              <span
                className="profile-hero__pds-tag"
                title="This profile information is imported from Bluesky"
              >
                Bluesky profile
              </span>
            ) : null}
          </p>
        ) : null}

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
