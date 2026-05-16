"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Calendar,
  Link as LinkIcon,
  Pencil,
  Settings as SettingsIcon,
  UserPlus,
  Users,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { getInitials } from "@/lib/utils/initials"
import { useProfilePds } from "@/hooks/use-profile-pds"
import { useUserGroups } from "@/hooks/use-user-groups"
import { useReceivedEndorsements, type ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useUserActivities } from "@/hooks/use-user-activities"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { activityDetailHref } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import type { CertifiedProfile } from "@/lib/atproto/types"

interface ProfileOverviewProps {
  profile: CertifiedProfile | null
  avatarUrl: string | null
  bannerUrl: string | null
  handle: string | null
  did: string
  activityCountLabel: string
  basePath: string
  /** If set, render an Edit button linking here (own profile / group admin). */
  editHref?: string
  /** If set, render a Settings cog (group admin only). */
  settingsHref?: string
  /** If true, this is the viewer's own profile — affects the action area. */
  isOwnProfile: boolean
}

const GROUPS_GRID_LIMIT = 12
const ACTIVITY_PREVIEW = 3
const ENDORSEMENT_PREVIEW = 3

function formatJoined(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `Joined ${date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
}

function buildWebsiteHref(website: string): string {
  if (/^https?:\/\//i.test(website)) return website
  return `https://${website}`
}

function websiteDisplay(website: string): string {
  return website.replace(/^https?:\/\//i, "").replace(/\/$/, "")
}

/**
 * Overview tab — GitHub-style two-column profile.
 *
 * Layout (≥800px):
 *   ┌─────────────┬────────────────────────────────────┐
 *   │  sidebar    │  banner                            │
 *   │  avatar     │  stats cards                       │
 *   │  name       │  recent activities                 │
 *   │  @handle    │  recent endorsements               │
 *   │  did:…      │                                    │
 *   │  bio        │                                    │
 *   │  Edit       │                                    │
 *   │  followers  │                                    │
 *   │  links      │                                    │
 *   │  groups     │                                    │
 *   └─────────────┴────────────────────────────────────┘
 *
 * Below 800px the columns stack and the sidebar identity block is
 * hidden (the page renders <ProfileHeader> at the top of mobile
 * already; the banner there carries that role).
 */
export default function ProfileOverview({
  profile,
  avatarUrl,
  bannerUrl,
  handle,
  did,
  activityCountLabel,
  basePath,
  editHref,
  settingsHref,
  isOwnProfile,
}: ProfileOverviewProps) {
  const displayName = profile?.displayName || (handle ? `@${handle}` : "Anonymous")
  const initials = getInitials(profile?.displayName, did)
  const { isBskyHosted } = useProfilePds(did)

  const [bannerFailed, setBannerFailed] = useState(false)
  useEffect(() => setBannerFailed(false), [bannerUrl])
  const showBanner = !!bannerUrl && !bannerFailed

  const { groups, isLoading: groupsLoading } = useUserGroups(did)
  const { endorsements, isLoading: endorsementsLoading } = useReceivedEndorsements(did)
  const { activities, isLoading: activitiesLoading } = useUserActivities(did)

  const previewGroups = useMemo(() => groups.slice(0, GROUPS_GRID_LIMIT), [groups])
  const previewActivities = useMemo(
    () => activities.slice(0, ACTIVITY_PREVIEW),
    [activities],
  )
  const previewEndorsements = useMemo(
    () => endorsements.slice(0, ENDORSEMENT_PREVIEW),
    [endorsements],
  )

  const joinedText = formatJoined(profile?.createdAt)
  const hasEdit = !!editHref

  return (
    <div className="profile-overview">
      <div className="profile-overview__layout">
        {/* ===== Left pane: identity sidebar ===== */}
        <aside className="profile-overview__sidebar" aria-label="Profile identity">
          <div className="profile-overview__avatar">
            <Avatar
              size="xl"
              src={avatarUrl || undefined}
              fallbackInitials={initials}
              className="!h-[240px] !w-[240px] !text-5xl"
            />
          </div>

          <div className="profile-overview__name-block">
            <h1 className="profile-overview__name">{displayName}</h1>
            {handle ? (
              <p className="profile-overview__handle">@{handle}</p>
            ) : null}
            <p className="profile-overview__did" title={did}>
              <span className="profile-overview__did-prefix">DID</span>
              <span className="profile-overview__did-value">{did}</span>
            </p>
          </div>

          {profile?.pronouns ? (
            <p className="profile-overview__pronouns">{profile.pronouns}</p>
          ) : null}

          {profile?.description ? (
            <p className="profile-overview__bio">{profile.description}</p>
          ) : null}

          <div className="profile-overview__actions">
            {hasEdit ? (
              <>
                <Link href={editHref!} className="profile-overview__action-primary">
                  <Pencil size={14} strokeWidth={1.75} aria-hidden />
                  Edit profile
                </Link>
                {settingsHref ? (
                  <Link
                    href={settingsHref}
                    aria-label="Group settings"
                    className="profile-overview__action-secondary"
                  >
                    <SettingsIcon size={14} strokeWidth={1.75} aria-hidden />
                  </Link>
                ) : null}
              </>
            ) : (
              <Button variant="primary" size="sm">
                <UserPlus size={14} strokeWidth={1.75} aria-hidden />
                Follow
              </Button>
            )}
          </div>

          <p className="profile-overview__followers" aria-label="Followers and following">
            <Users size={16} strokeWidth={1.75} aria-hidden />
            <span>
              <span className="profile-overview__followers-count">—</span> followers
            </span>
            <span aria-hidden className="profile-overview__followers-sep">·</span>
            <span>
              <span className="profile-overview__followers-count">—</span> following
            </span>
          </p>

          <ul className="profile-overview__details">
            {joinedText ? (
              <li>
                <Calendar size={16} strokeWidth={1.75} aria-hidden />
                <span>{joinedText}</span>
              </li>
            ) : null}
            {profile?.website ? (
              <li>
                <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
                <a
                  href={buildWebsiteHref(profile.website)}
                  className="profile-overview__detail-link"
                  rel="me noopener noreferrer"
                  target="_blank"
                >
                  {websiteDisplay(profile.website)}
                </a>
              </li>
            ) : null}
            {isBskyHosted && handle ? (
              <li>
                <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
                <a
                  href={`https://bsky.app/profile/${encodeURIComponent(handle)}`}
                  className="profile-overview__detail-link"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Bluesky profile
                </a>
              </li>
            ) : null}
          </ul>

          <section
            className="profile-overview__groups"
            aria-labelledby="profile-overview-groups-heading"
          >
            <div className="profile-overview__section-head">
              <h2
                id="profile-overview-groups-heading"
                className="profile-overview__section-title"
              >
                Groups
              </h2>
              {groups.length > GROUPS_GRID_LIMIT ? (
                <Link
                  href={`${basePath}?tab=groups`}
                  scroll={false}
                  className="profile-overview__see-all"
                >
                  See all <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
                </Link>
              ) : null}
            </div>

            {groupsLoading ? (
              <div className="profile-overview__loading"><LoadingSpinner size="sm" /></div>
            ) : previewGroups.length === 0 ? (
              <p className="profile-overview__empty">No groups yet.</p>
            ) : (
              <ul className="profile-overview__groups-grid">
                {previewGroups.map((g) => {
                  const name = g.displayName || g.handle
                  return (
                    <li key={g.groupDid}>
                      <Link
                        href={`/profile/${encodeURIComponent(g.handle)}`}
                        className="profile-overview__group-tile"
                        title={`${name} (@${g.handle})`}
                        aria-label={name}
                      >
                        <Avatar
                          size="md"
                          src={g.avatarUrl || undefined}
                          fallbackInitials={getInitials(name)}
                        />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </aside>

        {/* ===== Right pane: banner + main content ===== */}
        <div className="profile-overview__main">
          <div
            className={`profile-overview__banner ${
              showBanner ? "" : "profile-overview__banner--empty"
            }`}
          >
            {showBanner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl!}
                alt=""
                className="profile-overview__banner-img"
                onError={() => setBannerFailed(true)}
              />
            ) : null}
          </div>

          <section className="profile-overview__stats" aria-label="Profile stats">
            <Link
              href={`${basePath}?tab=activities`}
              scroll={false}
              className="profile-overview__stat"
            >
              <span className="profile-overview__stat-value">
                {activityCountLabel}
              </span>
              <span className="profile-overview__stat-label">
                {activityCountLabel === "1" ? "Activity claim" : "Activity claims"}
              </span>
            </Link>
            <Link
              href={`${basePath}?tab=endorsements`}
              scroll={false}
              className="profile-overview__stat"
            >
              <span className="profile-overview__stat-value">
                {endorsementsLoading ? "—" : endorsements.length}
              </span>
              <span className="profile-overview__stat-label">
                {endorsements.length === 1 ? "Endorsement" : "Endorsements"}
              </span>
            </Link>
            <Link
              href={`${basePath}?tab=groups`}
              scroll={false}
              className="profile-overview__stat"
            >
              <span className="profile-overview__stat-value">
                {groupsLoading ? "—" : groups.length}
              </span>
              <span className="profile-overview__stat-label">
                {groups.length === 1 ? "Group" : "Groups"}
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
                Recent activities
              </h2>
              {activities.length > ACTIVITY_PREVIEW ? (
                <Link
                  href={`${basePath}?tab=activities`}
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
              <p className="profile-overview__empty">No activity claims yet.</p>
            ) : (
              <ul className="profile-overview__activity-list">
                {previewActivities.map((a) => {
                  const href = activityDetailHref(did, uriToRkey(a.uri))
                  return (
                    <li key={a.uri} className="profile-overview__activity-item">
                      <Link href={href} className="profile-overview__activity-link">
                        <span className="profile-overview__activity-title">
                          {a.value.title || "Untitled activity"}
                        </span>
                        {a.value.shortDescription ? (
                          <span className="profile-overview__activity-desc">
                            {a.value.shortDescription}
                          </span>
                        ) : null}
                        <span className="profile-overview__activity-meta">
                          {formatShortDate(a.value.createdAt)}
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
      </div>
    </div>
  )
}

/** Parse an at-URI `at://did/collection/rkey` and return the rkey, or
 *  empty string if malformed. (Activity URIs in this repo are always
 *  well-formed; we still handle the absent case safely.) */
function uriToRkey(uri: string): string {
  const parts = uri.split("/")
  return parts[parts.length - 1] || ""
}

interface EndorsementPreviewRowProps {
  readonly endorsement: ReceivedEndorsement
}

/** Single row inside the Overview "Recent endorsements" preview.
 *  Owns its own useAuthorInfo so the parent can map over multiple
 *  rows without violating the hooks-in-loop rule. */
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
