"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Link as LinkIcon,
  Pencil,
  UserPlus,
  Users,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import SmartLink from "@/components/ui/smart-link"
import AvatarUpload from "@/components/profile/avatar-upload"
import { getInitials } from "@/lib/utils/initials"
import { useProfilePds } from "@/hooks/use-profile-pds"
import { useUserGroups, type UserGroup } from "@/hooks/use-user-groups"
import type { CertifiedProfile } from "@/lib/atproto/types"
import type { ProfileDrafts } from "@/components/profile/profile-inline-edit-types"

interface ProfileSidebarProps {
  profile: CertifiedProfile | null
  avatarUrl: string | null
  handle: string | null
  did: string
  /** Path of the current profile page (without query); used to build
   *  "see all" links into the Groups tab. */
  basePath: string
  /** Edit-profile link, if the viewer can edit (own profile or group admin). */
  editHref?: string
  /** Group-settings cog link, if the viewer is a group admin. */
  settingsHref?: string
  /** True when this profile carries an `app.certified.actor.organization`
   *  marker — controls whether org-only fields (additionalUrls) render. */
  isOrg?: boolean
  /** Extra org-only URLs (only consulted when `isOrg` is true). */
  additionalUrls?: string[]
  /** Pre-resolved groups. When provided, the sidebar uses these directly
   *  (so an own-profile view can pass the same `useOrg().groups` the
   *  account switcher renders). When omitted, falls back to
   *  `useUserGroups(did)` (PDS memberships only). */
  groupsOverride?: UserGroup[]
  groupsLoadingOverride?: boolean

  /** True when the viewer can enter inline edit mode on this profile
   *  (own profile only). Independent of `editHref`, which is used for
   *  the group-admin-edit-elsewhere flow. */
  canInlineEdit?: boolean
  /** True when the page is currently in edit mode. */
  isEditing?: boolean
  drafts?: ProfileDrafts
  onEditClick?: () => void
  onCancelEdit?: () => void
  onSaveEdit?: () => void
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
  onAvatarFile?: (file: File) => Promise<void>
  hasPendingAvatar?: boolean
  isSaving?: boolean
  saveError?: string | null
}

const GROUPS_GRID_LIMIT = 12

function formatJoined(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `Joined ${date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
}

/**
 * Identity sidebar — GitHub profile-style left pane.
 *
 * Rendered on every profile tab so the avatar, name, DID, bio, edit
 * button, link list and groups grid persist as the viewer switches
 * between Overview / Certs / Projects / Endorsements.
 *
 * Hidden below 800px via CSS — the mobile <ProfileHeader> at the top of
 * the page already carries identity on small viewports.
 */
export default function ProfileSidebar({
  profile,
  avatarUrl,
  handle,
  did,
  basePath,
  editHref,
  settingsHref,
  isOrg = false,
  additionalUrls,
  groupsOverride,
  groupsLoadingOverride,
  canInlineEdit = false,
  isEditing = false,
  drafts,
  onEditClick,
  onCancelEdit,
  onSaveEdit,
  onDraftChange,
  onAvatarFile,
  hasPendingAvatar = false,
  isSaving = false,
  saveError = null,
}: ProfileSidebarProps) {
  const displayName = profile?.displayName || (handle ? `@${handle}` : "Anonymous")
  const initials = getInitials(profile?.displayName, did)
  const { isBskyHosted } = useProfilePds(did)
  // Fall back to the PDS-only path when no override is provided
  // (foreign profiles where the viewer can't fetch CGS memberships).
  const fallback = useUserGroups(groupsOverride ? null : did)
  const groups = groupsOverride ?? fallback.groups
  const groupsLoading = groupsOverride ? !!groupsLoadingOverride : fallback.isLoading

  const joinedText = formatJoined(profile?.createdAt)
  // Inline edit takes precedence: when the viewer can inline-edit we
  // show the "Edit profile" trigger (or Save/Cancel in edit mode) and
  // ignore the legacy editHref. The href fallback still handles the
  // group-admin-editing-someone-else case.
  const hasInline = canInlineEdit
  const hasEditLink = !hasInline && !!editHref
  const previewGroups = groups.slice(0, GROUPS_GRID_LIMIT)

  // Local avatar uploading flag — toggled around the parent's upload
  // call so the AvatarUpload overlay can show its spinner.
  const [avatarUploading, setAvatarUploading] = useState(false)
  const handleAvatarUpload = async (file: File) => {
    if (!onAvatarFile) return
    setAvatarUploading(true)
    try {
      await onAvatarFile(file)
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <aside className="profile-sidebar" aria-label="Profile identity">
      <div
        className={
          isEditing && hasInline
            ? "profile-sidebar__avatar profile-sidebar__avatar--editing"
            : "profile-sidebar__avatar"
        }
      >
        {isEditing && hasInline ? (
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            fallbackInitials={initials}
            onUpload={handleAvatarUpload}
            isUploading={avatarUploading}
          />
        ) : (
          <Avatar
            size="xl"
            src={avatarUrl || undefined}
            fallbackInitials={initials}
            className="!h-[240px] !w-[240px] !text-5xl"
          />
        )}
      </div>

      <div className="profile-sidebar__name-block">
        {isEditing && hasInline ? (
          <input
            type="text"
            className="profile-sidebar__name-input"
            value={drafts?.displayName ?? ""}
            maxLength={64}
            placeholder="Display name"
            aria-label="Display name"
            onChange={(e) => onDraftChange?.("displayName", e.target.value)}
          />
        ) : (
          <h1 className="profile-sidebar__name">{displayName}</h1>
        )}
        {handle ? (
          <p className="profile-sidebar__handle">@{handle}</p>
        ) : null}
        <p className="profile-sidebar__did" title={did}>
          <span className="profile-sidebar__did-value">{did}</span>
          <CopyButton value={did} label="Copy DID" />
        </p>
      </div>

      {profile?.pronouns ? (
        <p className="profile-sidebar__pronouns">{profile.pronouns}</p>
      ) : null}

      {/* Action row: hidden in edit mode — the page-level banner above
          the avatar/banner image owns Save / Cancel now. */}
      {!isEditing ? (
        <div className="profile-sidebar__actions">
          {hasInline ? (
            <button
              type="button"
              className="profile-sidebar__action-primary"
              onClick={onEditClick}
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden />
              Edit profile
            </button>
          ) : hasEditLink ? (
            <Link href={editHref!} className="profile-sidebar__action-primary">
              <Pencil size={14} strokeWidth={1.75} aria-hidden />
              Edit profile
            </Link>
          ) : (
            <Button variant="primary" size="sm">
              <UserPlus size={14} strokeWidth={1.75} aria-hidden />
              Follow
            </Button>
          )}
        </div>
      ) : null}

      <p className="profile-sidebar__followers" aria-label="Followers and following">
        <Users size={16} strokeWidth={1.75} aria-hidden />
        <span>
          <span className="profile-sidebar__followers-count">—</span> followers
        </span>
        <span aria-hidden className="profile-sidebar__followers-sep">·</span>
        <span>
          <span className="profile-sidebar__followers-count">—</span> following
        </span>
      </p>

      <ul className="profile-sidebar__details">
        {profile?.website ? (
          <li>
            <SmartLink url={profile.website} />
          </li>
        ) : null}
        {isOrg && additionalUrls
          ? additionalUrls
              .filter((u) => typeof u === "string" && u.length > 0)
              .map((u) => (
                <li key={u}>
                  <SmartLink url={u} />
                </li>
              ))
          : null}
        {isBskyHosted && handle ? (
          <li>
            <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
            <a
              href={`https://bsky.app/profile/${encodeURIComponent(handle)}`}
              className="profile-sidebar__detail-link"
              rel="noopener noreferrer"
              target="_blank"
            >
              Bluesky profile
            </a>
          </li>
        ) : null}
        {joinedText ? (
          <li>
            <Calendar size={16} strokeWidth={1.75} aria-hidden />
            <span>{joinedText}</span>
          </li>
        ) : null}
      </ul>

      <section
        className="profile-sidebar__groups"
        aria-labelledby="profile-sidebar-groups-heading"
      >
        <div className="profile-sidebar__section-head">
          <Link
            id="profile-sidebar-groups-heading"
            href={`${basePath}?tab=groups`}
            scroll={false}
            className="profile-sidebar__section-title profile-sidebar__section-title--link"
          >
            Groups
          </Link>
          {groups.length > GROUPS_GRID_LIMIT ? (
            <Link
              href={`${basePath}?tab=groups`}
              scroll={false}
              className="profile-sidebar__see-all"
            >
              See all <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </div>

        {groupsLoading ? (
          <div className="profile-sidebar__loading"><LoadingSpinner size="sm" /></div>
        ) : previewGroups.length === 0 ? (
          <p className="profile-sidebar__empty">No groups yet.</p>
        ) : (
          <ul className="profile-sidebar__groups-list">
            {previewGroups.map((g) => {
              const name = g.displayName || g.handle
              return (
                <li key={g.groupDid}>
                  <Link
                    href={`/profile/${encodeURIComponent(g.handle)}`}
                    className="profile-sidebar__group-row"
                  >
                    <Avatar
                      size="sm"
                      src={g.avatarUrl || undefined}
                      fallbackInitials={getInitials(name)}
                    />
                    <span className="profile-sidebar__group-meta">
                      <span className="profile-sidebar__group-name">{name}</span>
                      <span className="profile-sidebar__group-handle">@{g.handle}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}

interface CopyButtonProps {
  value: string
  label: string
}

function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — silent */
    }
  }
  return (
    <button
      type="button"
      className="profile-sidebar__copy-btn"
      onClick={onClick}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      {copied ? (
        <Check size={13} strokeWidth={2} aria-hidden />
      ) : (
        <Copy size={13} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  )
}
