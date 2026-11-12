"use client"

import { useId, useState } from "react"
import Link from "next/link"
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

  // A banner that fails to load falls back to the plain fill rather than
  // the browser's broken-image glyph. Reset when the URL changes (e.g. the
  // viewer switches account) using the adjust-state-during-render pattern.
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
  // Where the handle (and, for a person, the custom domain) is changed.
  const settingsHref = !isGroup
    ? "/settings"
    : canManageGroup
      ? `/groups/${encodeURIComponent(did)}/settings`
      : null

  const realName = profile?.displayName || activeGroup?.displayName || null
  const displayName = realName || (handle ? `@${handle}` : "Your account")
  const initials = getInitials(profile?.displayName ?? activeGroup?.displayName, handle ?? did)
  const profileHref = profileUrl(handle || did)

  return (
    <Card
      as="section"
      unpadded
      className="home-account"
      aria-labelledby={nameId}
      data-tour="home-account"
    >
      <div
        className={
          showBanner ? "home-account__banner" : "home-account__banner home-account__banner--empty"
        }
      >
        {showBanner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl!}
            alt=""
            className="home-account__banner-img"
            loading="lazy"
            onError={() => setBannerFailed(true)}
          />
        ) : null}
      </div>

      <div className="home-account__body">
        <div className="home-account__avatar">
          <Avatar
            size="lg"
            src={avatarUrl || activeGroup?.avatarUrl || undefined}
            fallbackInitials={initials}
            bordered
          />
        </div>

        <p className="home-account__eyebrow">
          {isGroup ? "Group account" : "Your account"}
        </p>
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
            {/* Without a display name the heading already is the handle. */}
            {handle && realName ? <p className="home-account__handle">@{handle}</p> : null}
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
            ? "Identifies this group's account wherever its records appear."
            : "Identifies your account. Apps use it to sign you in."}
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
        {settingsHref ? (
          <Link href={settingsHref} className="home-account__id-link">
            {isGroup ? "Group settings" : "Change your handle in settings"}
          </Link>
        ) : null}
      </div>
    </Card>
  )
}
