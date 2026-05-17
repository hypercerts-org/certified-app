"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Award } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { getInitials } from "@/lib/utils/initials"
import { useUserGroups } from "@/hooks/use-user-groups"
import { useReceivedEndorsements, type ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { activityDetailHref } from "@/lib/atproto/activity-uri"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import type { ClaimActivity } from "@/lib/atproto/activity-types"
import type { CertifiedProfile } from "@/lib/atproto/types"
import { formatShortDate } from "@/lib/utils/format-date"

interface ProfileOverviewProps {
  bannerUrl: string | null
  did: string
  profile: CertifiedProfile | null
  basePath: string
}

const ACTIVITY_PREVIEW = 3
const ENDORSEMENT_PREVIEW = 3

/**
 * Overview tab — right-pane content.
 *
 * Renders the banner (Overview-only, sits at the top of the right pane),
 * three stat cards linking into the other tabs, and digest previews of
 * recent certs and recent endorsements. The identity block is no longer
 * rendered here: the profile page renders <ProfileSidebar> as the left
 * pane of a shared 2-column layout that wraps every tab.
 */
export default function ProfileOverview({
  bannerUrl,
  did,
  profile,
  basePath,
}: ProfileOverviewProps) {
  const [bannerFailed, setBannerFailed] = useState(false)
  useEffect(() => setBannerFailed(false), [bannerUrl])
  const showBanner = !!bannerUrl && !bannerFailed

  const { groups, isLoading: groupsLoading } = useUserGroups(did)
  const { endorsements, isLoading: endorsementsLoading } = useReceivedEndorsements(did)
  const { endorsements: givenEndorsements, isLoading: givenLoading } = useGivenEndorsements(did)
  const { projects, isLoading: projectsLoading } = useUserProjects(did)
  // Indexer-backed combined feed: split locally to count Created vs
  // Contributed to. Same pattern as <ProfileCerts>.
  const {
    activities,
    dids: activityDids,
    isLoading: activitiesLoading,
    hasMore: activitiesHasMore,
  } = useUserIndexerActivities(did)

  const { createdCount, contributedCount } = useMemo(() => {
    let created = 0
    let contributed = 0
    for (const r of activities) {
      const authorDid = activityDids.get(r.uri)
      if (authorDid === did) created++
      else if (authorDid) contributed++
    }
    return { createdCount: created, contributedCount: contributed }
  }, [activities, activityDids, did])

  const previewActivities = useMemo(
    () => activities.slice(0, ACTIVITY_PREVIEW),
    [activities],
  )
  const previewEndorsements = useMemo(
    () => endorsements.slice(0, ENDORSEMENT_PREVIEW),
    [endorsements],
  )


  return (
    <div className="profile-overview">
      {showBanner ? (
        <div className="profile-overview__banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl!}
            alt=""
            className="profile-overview__banner-img"
            onError={() => setBannerFailed(true)}
          />
        </div>
      ) : null}

      {profile?.description ? (
        <section
          className="profile-overview__about"
          aria-labelledby="profile-overview-about-heading"
        >
          <h2
            id="profile-overview-about-heading"
            className="profile-overview__section-title"
          >
            About
          </h2>
          <p className="profile-overview__about-body">{profile.description}</p>
        </section>
      ) : null}

      <section className="profile-overview__stats" aria-label="Profile stats">
        <Link
          href={`${basePath}?tab=endorsements`}
          scroll={false}
          className="profile-overview__stat"
        >
          <span className="profile-overview__stat-label">Endorsements</span>
          <span className="profile-overview__stat-split">
            <span className="profile-overview__stat-value">
              {endorsementsLoading ? "—" : endorsements.length}
            </span>
            <span className="profile-overview__stat-sub">received</span>
          </span>
          <span className="profile-overview__stat-split">
            <span className="profile-overview__stat-value">
              {givenLoading ? "—" : givenEndorsements.length}
            </span>
            <span className="profile-overview__stat-sub">given</span>
          </span>
        </Link>
        <Link
          href={`${basePath}?tab=certs`}
          scroll={false}
          className="profile-overview__stat"
        >
          <span className="profile-overview__stat-label">Certs</span>
          <span className="profile-overview__stat-split">
            <span className="profile-overview__stat-value">
              {activitiesLoading
                ? "—"
                : `${createdCount}${activitiesHasMore ? "+" : ""}`}
            </span>
            <span className="profile-overview__stat-sub">created</span>
          </span>
          <span className="profile-overview__stat-split">
            <span className="profile-overview__stat-value">
              {activitiesLoading
                ? "—"
                : `${contributedCount}${activitiesHasMore ? "+" : ""}`}
            </span>
            <span className="profile-overview__stat-sub">contributed</span>
          </span>
        </Link>
        <Link
          href={`${basePath}?tab=projects`}
          scroll={false}
          className="profile-overview__stat"
        >
          <span className="profile-overview__stat-label">Projects</span>
          <span className="profile-overview__stat-split profile-overview__stat-split--solo">
            <span className="profile-overview__stat-value">
              {projectsLoading ? "—" : projects.length}
            </span>
          </span>
        </Link>
        <Link
          href={`${basePath}?tab=groups`}
          scroll={false}
          className="profile-overview__stat"
        >
          <span className="profile-overview__stat-label">Groups</span>
          <span className="profile-overview__stat-split profile-overview__stat-split--solo">
            <span className="profile-overview__stat-value">
              {groupsLoading ? "—" : groups.length}
            </span>
          </span>
        </Link>
      </section>

      <section
        className="profile-overview__digest"
        aria-labelledby="profile-overview-activities-heading"
      >
        <div className="profile-overview__section-head">
          <h2
            id="profile-overview-activities-heading"
            className="profile-overview__section-title"
          >
            Recent certs
          </h2>
          {activities.length > ACTIVITY_PREVIEW ? (
            <Link
              href={`${basePath}?tab=certs`}
              scroll={false}
              className="profile-overview__see-all"
            >
              See all <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </div>

        {activitiesLoading && previewActivities.length === 0 ? (
          <div className="profile-overview__loading"><LoadingSpinner size="sm" /></div>
        ) : previewActivities.length === 0 ? (
          <p className="profile-overview__empty">No certs yet.</p>
        ) : (
          <ul className="profile-overview__activity-list">
            {previewActivities.map((a) => {
              const href = activityDetailHref(did, uriToRkey(a.uri))
              return (
                <li key={a.uri} className="profile-overview__activity-item">
                  <Link href={href} className="profile-overview__activity-link">
                    <ActivityThumb value={a.value} did={did} />
                    <span className="profile-overview__activity-text">
                      <span className="profile-overview__activity-title">
                        {a.value.title || "Untitled cert"}
                      </span>
                      {a.value.shortDescription ? (
                        <span className="profile-overview__activity-desc">
                          {a.value.shortDescription}
                        </span>
                      ) : null}
                      <span className="profile-overview__activity-meta">
                        {formatShortDate(a.value.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section
        className="profile-overview__digest"
        aria-labelledby="profile-overview-endorsements-heading"
      >
        <div className="profile-overview__section-head">
          <h2
            id="profile-overview-endorsements-heading"
            className="profile-overview__section-title"
          >
            Recent endorsements
          </h2>
          {endorsements.length > ENDORSEMENT_PREVIEW ? (
            <Link
              href={`${basePath}?tab=endorsements`}
              scroll={false}
              className="profile-overview__see-all"
            >
              See all <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </div>

        {endorsementsLoading && previewEndorsements.length === 0 ? (
          <div className="profile-overview__loading"><LoadingSpinner size="sm" /></div>
        ) : previewEndorsements.length === 0 ? (
          <p className="profile-overview__empty">No endorsements yet.</p>
        ) : (
          <ul className="profile-overview__endorse-list">
            {previewEndorsements.map((e) => (
              <EndorsementPreviewRow key={e.uri} endorsement={e} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function uriToRkey(uri: string): string {
  const parts = uri.split("/")
  return parts[parts.length - 1] || ""
}

interface ActivityThumbProps {
  value: ClaimActivity
  did: string
}

function ActivityThumb({ value, did }: ActivityThumbProps) {
  const imageUrl = value.image ? resolveActivityImageUrl(value.image, did) : null
  const [failed, setFailed] = useState(false)

  if (imageUrl && !failed) {
    return (
      <span className="profile-overview__activity-thumb" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="profile-overview__activity-thumb-img"
        />
      </span>
    )
  }
  return (
    <span
      className="profile-overview__activity-thumb profile-overview__activity-thumb--placeholder"
      aria-hidden="true"
    >
      <Award size={20} strokeWidth={1.25} />
    </span>
  )
}

interface EndorsementPreviewRowProps {
  readonly endorsement: ReceivedEndorsement
}

function EndorsementPreviewRow({ endorsement }: EndorsementPreviewRowProps) {
  const { info } = useAuthorInfo(endorsement.issuerDid)
  const displayName = info?.displayName || info?.handle || endorsement.issuerDid
  const initials = getInitials(info?.displayName, endorsement.issuerDid)
  const href = `/profile/${encodeURIComponent(info?.handle || endorsement.issuerDid)}`

  return (
    <li className="profile-overview__endorse-item">
      <Link href={href} className="profile-overview__endorse-link">
        <Avatar
          size="sm"
          src={info?.avatarUrl || undefined}
          fallbackInitials={initials}
        />
        <span className="profile-overview__endorse-meta">
          <span className="profile-overview__endorse-name">{displayName}</span>
          <span className="profile-overview__endorse-when">
            {formatShortDate(endorsement.createdAt)}
          </span>
        </span>
        {endorsement.note ? (
          <span className="profile-overview__endorse-note">{endorsement.note}</span>
        ) : null}
      </Link>
    </li>
  )
}
