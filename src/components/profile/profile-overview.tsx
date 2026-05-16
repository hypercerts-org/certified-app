"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils/initials"
import { useProfilePds } from "@/hooks/use-profile-pds"
import { useUserGroups } from "@/hooks/use-user-groups"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import LoadingSpinner from "@/components/ui/loading-spinner"
import type { CertifiedProfile } from "@/lib/atproto/types"

interface ProfileOverviewProps {
  profile: CertifiedProfile | null
  avatarUrl: string | null
  bannerUrl: string | null
  handle: string | null
  did: string
  activityCountLabel: string
  basePath: string
}

const GROUPS_PREVIEW_LIMIT = 4

/**
 * Overview tab — the identity face card.
 *
 * On desktop this is the landing surface for `/profile/[handle]`: banner,
 * avatar, name, handle, bio, headline counts, plus a digest of groups and
 * endorsements with "see more" links into the other tabs.
 *
 * On mobile the in-page <ProfileHeader> already carries banner/avatar/name
 * above the tab strip; the `.profile-overview__identity` block here is
 * CSS-hidden on <800px to avoid duplication. The digest block stays.
 */
export default function ProfileOverview({
  profile,
  avatarUrl,
  bannerUrl,
  handle,
  did,
  activityCountLabel,
  basePath,
}: ProfileOverviewProps) {
  const displayName = profile?.displayName || (handle ? `@${handle}` : "Anonymous")
  const initials = getInitials(profile?.displayName, did)
  const { isBskyHosted } = useProfilePds(did)

  const [bannerFailed, setBannerFailed] = useState(false)
  useEffect(() => {
    setBannerFailed(false)
  }, [bannerUrl])
  const showBannerImage = !!bannerUrl && !bannerFailed
  const bannerClass = showBannerImage
    ? "profile-overview__banner"
    : "profile-overview__banner profile-overview__banner--empty"

  const { groups, isLoading: groupsLoading } = useUserGroups(did)
  const { endorsements, isLoading: endorsementsLoading } = useReceivedEndorsements(did)

  const previewGroups = useMemo(() => groups.slice(0, GROUPS_PREVIEW_LIMIT), [groups])

  return (
    <div className="profile-overview" role="region" aria-label="Profile overview">
      <section className="profile-overview__identity">
        <div className={bannerClass}>
          {showBannerImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl!}
              alt=""
              className="profile-overview__banner-img"
              onError={() => setBannerFailed(true)}
            />
          ) : null}
        </div>

        <div className="profile-overview__identity-body">
          <div className="profile-overview__avatar-wrap">
            <Avatar
              size="xl"
              src={avatarUrl || undefined}
              fallbackInitials={initials}
            />
          </div>

          <h1 className="profile-overview__name">{displayName}</h1>
          {handle ? (
            <p className="profile-overview__handle">
              @{handle}
              {isBskyHosted ? (
                <span
                  className="profile-overview__pds-tag"
                  title="This profile information is imported from Bluesky"
                >
                  Bluesky profile
                </span>
              ) : null}
            </p>
          ) : null}

          {profile?.description ? (
            <p className="profile-overview__bio">{profile.description}</p>
          ) : null}
        </div>
      </section>

      <section className="profile-overview__stats" aria-label="Profile stats">
        <Link
          href={`${basePath}?tab=activities`}
          scroll={false}
          className="profile-overview__stat profile-overview__stat--linked"
        >
          <span className="profile-overview__stat-value">{activityCountLabel}</span>
          <span className="profile-overview__stat-label">
            {activityCountLabel === "1" ? "activity claim" : "activity claims"}
          </span>
        </Link>
        <Link
          href={`${basePath}?tab=endorsements`}
          scroll={false}
          className="profile-overview__stat profile-overview__stat--linked"
        >
          <span className="profile-overview__stat-value">
            {endorsementsLoading ? "—" : endorsements.length}
          </span>
          <span className="profile-overview__stat-label">
            {endorsements.length === 1 ? "endorsement" : "endorsements"}
          </span>
        </Link>
        <Link
          href={`${basePath}?tab=groups`}
          scroll={false}
          className="profile-overview__stat profile-overview__stat--linked"
        >
          <span className="profile-overview__stat-value">
            {groupsLoading ? "—" : groups.length}
          </span>
          <span className="profile-overview__stat-label">
            {groups.length === 1 ? "group" : "groups"}
          </span>
        </Link>
      </section>

      <section className="profile-overview__section" aria-labelledby="overview-groups-heading">
        <header className="profile-overview__section-head">
          <h2 id="overview-groups-heading" className="profile-overview__section-title">Groups</h2>
          {groups.length > GROUPS_PREVIEW_LIMIT ? (
            <Link
              href={`${basePath}?tab=groups`}
              scroll={false}
              className="profile-overview__see-all"
            >
              See all <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </header>

        {groupsLoading ? (
          <div className="profile-overview__loading">
            <LoadingSpinner size="sm" />
          </div>
        ) : previewGroups.length === 0 ? (
          <p className="profile-overview__empty">No groups yet.</p>
        ) : (
          <ul className="profile-overview__groups">
            {previewGroups.map((g) => {
              const name = g.displayName || g.handle
              return (
                <li key={g.groupDid} className="profile-overview__group-item">
                  <Link
                    href={`/profile/${encodeURIComponent(g.handle)}`}
                    className="profile-overview__group-link"
                  >
                    <Avatar
                      size="sm"
                      src={g.avatarUrl || undefined}
                      fallbackInitials={getInitials(name)}
                    />
                    <span className="profile-overview__group-meta">
                      <span className="profile-overview__group-name">{name}</span>
                      <span className="profile-overview__group-handle">@{g.handle}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="profile-overview__section" aria-labelledby="overview-endorse-heading">
        <header className="profile-overview__section-head">
          <h2 id="overview-endorse-heading" className="profile-overview__section-title">
            Endorsements
          </h2>
          {endorsements.length > 0 ? (
            <Link
              href={`${basePath}?tab=endorsements`}
              scroll={false}
              className="profile-overview__see-all"
            >
              See all <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </header>

        {endorsementsLoading ? (
          <div className="profile-overview__loading">
            <LoadingSpinner size="sm" />
          </div>
        ) : endorsements.length === 0 ? (
          <p className="profile-overview__empty">No endorsements yet.</p>
        ) : (
          <p className="profile-overview__endorse-summary">
            <span className="profile-overview__endorse-count">{endorsements.length}</span>
            {" "}
            {endorsements.length === 1 ? "endorsement received" : "endorsements received"}
          </p>
        )}
      </section>
    </div>
  )
}

