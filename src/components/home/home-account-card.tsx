"use client"

import { useId, useState } from "react"
import { Pencil } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Card from "@/components/ui/card"
import Skeleton from "@/components/ui/skeleton"
import SmartLink from "@/components/ui/smart-link"
import CopyPill from "@/components/account/copy-pill"
import { useUserProfile } from "@/hooks/use-user-profile"
import { getInitials } from "@/lib/utils/initials"
import { profileUrl } from "@/lib/urls"
import type { Group } from "@/lib/groups/types"

/**
 * The account card at the top of the signed-in home: the profile (banner,
 * avatar, name, handle, bio, website) and the ID (handle + DID, each
 * click-to-copy). It describes whichever account the viewer is acting as,
 * so a group admin who switched into a group sees the group's account.
 */
export default function HomeAccountCard({
  did,
  activeGroup,
}: {
  did: string
  /** Set when the viewer is acting as a group; null for the personal account. */
  activeGroup: Group | null
}) {
  const { profile, avatarUrl, bannerUrl, handle, isLoading } = useUserProfile(did)
  const nameId = useId()
  const idHeadingId = useId()

  // No banner (or one that fails to load) means no banner strip at all: the
  // card starts with the avatar instead of an empty grey band. Reset the
  // failure flag when the URL changes, using the adjust-state-during-render
  // pattern.
  const [bannerFailed, setBannerFailed] = useState(false)
  const [prevBannerUrl, setPrevBannerUrl] = useState(bannerUrl)
  if (prevBannerUrl !== bannerUrl) {
    setPrevBannerUrl(bannerUrl)
    setBannerFailed(false)
  }
  const showBanner = !!bannerUrl && !bannerFailed

  const isGroup = !!activeGroup
  const canManageGroup =
    isGroup && (activeGroup.role === "owner" || activeGroup.role === "admin")

  // Personal accounts edit on the settings form; a group is edited by its
  // owners and admins on the group's own form. A plain member acting as the
  // group gets no edit link.
  const editHref = !isGroup
    ? "/settings/edit-profile"
    : canManageGroup
      ? `/groups/${encodeURIComponent(did)}/edit-profile`
      : null

  const displayName =
    profile?.displayName || activeGroup?.displayName || (handle ? `@${handle}` : "Your account")
  const initials = getInitials(profile?.displayName ?? activeGroup?.displayName, handle ?? did)
  const profileHref = profileUrl(handle || did)

  return (
    <Card
      as="section"
      unpadded
      className={showBanner ? "home-account" : "home-account home-account--no-banner"}
      aria-labelledby={nameId}
      data-tour="home-account"
    >
      {showBanner ? (
        <div className="home-account__banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl!}
            alt=""
            className="home-account__banner-img"
            loading="lazy"
            onError={() => setBannerFailed(true)}
          />
        </div>
      ) : null}

      <div className="home-account__body">
        <div className="home-account__avatar">
          <Avatar
            size="lg"
            src={avatarUrl || activeGroup?.avatarUrl || undefined}
            fallbackInitials={initials}
            bordered
          />
        </div>

        {isLoading && !profile ? (
          <div className="home-account__name-skeleton">
            {/* Keeps the section named while the profile loads. */}
            <span id={nameId} className="sr-only">Your account</span>
            <Skeleton variant="line" width="60%" height={24} aria-hidden />
            <Skeleton variant="line" width="40%" height={14} aria-hidden />
          </div>
        ) : (
          <>
            <h2 id={nameId} className="home-account__name font-headline text-h3" dir="auto">
              {displayName}
            </h2>
            {/* No handle line here: the ID section below shows it. */}
            {profile?.pronouns ? (
              <p className="home-account__pronouns">{profile.pronouns}</p>
            ) : null}
          </>
        )}
        {profile?.description ? (
          <p className="home-account__bio" dir="auto">{profile.description}</p>
        ) : !isLoading && editHref ? (
          <p className="home-account__bio home-account__bio--empty">
            Add a few lines about {isGroup ? "this group" : "yourself"} so
            people know who they are looking at.
          </p>
        ) : null}

        {profile?.website ? (
          <div className="home-account__website">
            <SmartLink url={profile.website} />
          </div>
        ) : null}

        <div className="home-account__actions">
          {editHref ? (
            <Button href={editHref} variant="secondary" size="sm">
              <Pencil size={14} aria-hidden />
              Edit profile
            </Button>
          ) : null}
          <Button href={profileHref} variant="ghost" size="sm">
            View profile
          </Button>
        </div>
      </div>

      <div className="home-account__id" role="group" aria-labelledby={idHeadingId}>
        <h3 id={idHeadingId} className="home-account__id-title">ID</h3>
        <p className="home-account__id-note">
          {isGroup
            ? "Identifies this group's account in every app."
            : "Identifies your account in every app."}
        </p>
        <dl className="home-account__id-list">
          {handle ? (
            <div className="home-account__id-row">
              <dt className="home-account__id-label">Handle</dt>
              <dd className="home-account__id-value">
                <CopyPill value={handle} display={`@${handle}`} label="handle" />
              </dd>
            </div>
          ) : null}
          <div className="home-account__id-row">
            <dt className="home-account__id-label">Permanent ID</dt>
            <dd className="home-account__id-value">
              <CopyPill value={did} label="permanent ID" />
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  )
}
