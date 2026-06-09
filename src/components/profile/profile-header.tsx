"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Pencil, UserPlus, Settings as SettingsIcon, Users, ThumbsUp } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import { getInitials } from "@/lib/utils/initials"
import { formatGraphCount } from "@/lib/utils/format-graph-count"
import { useFollowers } from "@/hooks/use-followers"
import { useFollowing } from "@/hooks/use-following"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
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
  /** Current profile path (e.g. "/alice.certified.one"), used to link the
   *  follower / following / endorsed-by counts to their tabs. Mirrors the
   *  desktop sidebar's `basePath`. */
  basePath?: string
  /** True when an `app.certified.actor.profile` record with a
   *  populated displayName exists. When false, the displayName /
   *  description / avatar / banner all came from `app.bsky.actor.profile`
   *  and we show a "Bluesky profile" tag next to the handle. Issue #74. */
  hasCertifiedProfile?: boolean
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
  hasCertifiedProfile = false,
  basePath = "",
}: ProfileHeaderProps) {
  const displayName = profile?.displayName || (handle ? `@${handle}` : "Anonymous")
  const initials = getInitials(profile?.displayName, did)

  // Follower / following / endorsed-by counts for THIS profile. The desktop
  // sidebar (always mounted, just CSS-hidden on mobile) already fetches these,
  // so reading them here is a cache hit — it surfaces the same social signal on
  // mobile that the ≥1300px sidebar shows, closing the parity gap.
  const viewedFollowers = useFollowers(did)
  const viewedFollowing = useFollowing(did)
  const viewedReceived = useReceivedEndorsements(did)

  // Track banner load failures so we fall back to the plain gradient
  // instead of showing the browser's broken-image icon. Reset the flag
  // when the URL changes (e.g. when the user switches profiles).
  const [bannerFailed, setBannerFailed] = useState(false)
  useEffect(() => {
    setBannerFailed(false)
  }, [bannerUrl])

  const hasAdminActions = !!editHref || !!settingsHref

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
                    <Button variant="secondary" size="sm" tooltip="Group settings">
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
            {/* "Bluesky profile" tag — shown when the displayed
                profile data came from app.bsky.actor.profile because
                no app.certified.actor.profile record with a
                displayName exists for this user. Issue #74. */}
            {!hasCertifiedProfile ? (
              <span
                className="profile-hero__pds-tag"
                title="This profile information is imported from Bluesky"
              >
                Bluesky profile
              </span>
            ) : null}
          </p>
        ) : null}

        {profile?.pronouns ? (
          <p className="profile-hero__pronouns">{profile.pronouns}</p>
        ) : null}

        <p className="profile-hero__count">
          <span className="profile-hero__count-value">{activityCountLabel}</span>
          <span className="profile-hero__count-label">
            {activityCountLabel === "1" ? "activity claim" : "activity claims"}
          </span>
        </p>

        {/* Social-graph strip — mirrors the desktop sidebar so mobile viewers
            see follower / following / endorsed-by counts too. */}
        <div className="profile-hero__graph">
          <p className="profile-hero__graph-row" aria-label="Followers and following">
            <Users size={16} strokeWidth={1.75} aria-hidden />
            <span>
              <span className="profile-hero__graph-count">
                {formatGraphCount(viewedFollowers.count ?? viewedFollowers.entries.length)}
              </span>{" "}
              <Link href={`${basePath}?tab=followers`} scroll={false} className="profile-hero__graph-link">
                followers
              </Link>
            </span>
            <span aria-hidden className="profile-hero__graph-sep">·</span>
            <span>
              <span
                className="profile-hero__graph-count"
                title={
                  viewedFollowing.truncated
                    ? "Hit the 10,000 follow display cap; the underlying repo has more."
                    : undefined
                }
              >
                {formatGraphCount(viewedFollowing.count, viewedFollowing.truncated)}
              </span>{" "}
              <Link
                href={`${basePath}?tab=followers&sub=following`}
                scroll={false}
                className="profile-hero__graph-link"
              >
                following
              </Link>
            </span>
          </p>
          <p className="profile-hero__graph-row" aria-label="Endorsed by">
            <ThumbsUp size={16} strokeWidth={1.75} aria-hidden />
            <Link
              href={`${basePath}?tab=endorsements&sub=received`}
              scroll={false}
              className="profile-hero__graph-link"
            >
              Endorsed by{" "}
              <span className="profile-hero__graph-count">
                {formatGraphCount(viewedReceived.endorsements.length)}
              </span>
            </Link>
          </p>
        </div>

        {profile?.description ? (
          <p className="profile-hero__bio">{profile.description}</p>
        ) : null}
      </div>
    </header>
  )
}
