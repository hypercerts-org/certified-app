"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link as LinkIcon,
  Pencil,
  Plus,
  ThumbsUp,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import SmartLink from "@/components/ui/smart-link"
import { getInitials } from "@/lib/utils/initials"
import { formatMonthYear } from "@/lib/utils/format-date"
import { useProfilePds } from "@/hooks/use-profile-pds"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import { useFollowing } from "@/hooks/use-following"
import { useFollowers } from "@/hooks/use-followers"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import {
  useReceivedEndorsements,
  addOptimisticReceivedEndorsement,
  removeOptimisticReceivedEndorsement,
} from "@/hooks/use-received-endorsements"
import { useEndorsementLists } from "@/hooks/use-endorsement-lists"
import { useAuthorInfo } from "@/hooks/use-author-info"
import EndorseReasonModal, {
  type EndorseReasonActingAs,
} from "@/components/profile/endorse-reason-modal"
import { runEndorseReasonConfirm } from "@/components/profile/endorse-reason-confirm"
import PostingAs, {
  PostingAsConfirm,
} from "@/components/create/posting-as"
import { usePostingIdentity } from "@/hooks/use-posting-identity"
import type { PostingIdentity } from "@/lib/groups/posting-identity"
import { createFollow, deleteFollow, listFollowing } from "@/lib/atproto/follow"
import {
  createEndorsementAward,
  deleteEndorsementAward,
} from "@/lib/atproto/badges"
import { appendItemToList } from "@/lib/atproto/collection"
import AddToListMenu from "@/components/lists/add-to-list-menu"
import { LIST_ACCOUNTS_TYPE } from "@/lib/atproto/typed-lists"
import type { CertifiedProfile } from "@/lib/atproto/types"
import {
  newDraftUrlRow,
  type DraftUrlRow,
  type ProfileDrafts,
} from "@/components/profile/profile-inline-edit-types"

interface ProfileSidebarProps {
  profile: CertifiedProfile | null
  avatarUrl: string | null
  handle: string | null
  did: string
  /** Path of the current profile page (without query); reserved for
   *  future intra-profile links. Currently unused but kept on the
   *  prop surface so the page-level call site stays stable. */
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
  /** True when an `app.certified.actor.profile` record with a
   *  populated displayName exists for this profile. When false,
   *  the data we're rendering came from `app.bsky.actor.profile`
   *  (bsky fallback) and we surface a "Bluesky profile" tag so
   *  the viewer knows. Issue #74. */
  hasCertifiedProfile?: boolean
  /** Pre-formatted founded-date string. `null` when the field is empty
   *  so the sidebar can skip the row entirely. When present this row
   *  replaces the generic "Joined ..." line below. */
  orgFoundedDate?: string | null

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

function formatJoined(iso?: string): string | null {
  if (!iso) return null
  const monthYear = formatMonthYear(iso)
  return monthYear ? `Joined ${monthYear}` : null
}

/**
 * Identity sidebar — GitHub profile-style left pane.
 *
 * Rendered on every profile tab so the avatar, name, DID, bio, edit
 * button, and link list persist as the viewer switches between
 * Overview / Certs / Projects / Endorsements.
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
  hasCertifiedProfile = false,
  orgFoundedDate = null,
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
  const displayName = profile?.displayName || handle || "Anonymous"
  const initials = getInitials(profile?.displayName, did)
  const { isBskyHosted } = useProfilePds(did)

  const joinedText = formatJoined(profile?.createdAt)
  // Inline edit takes precedence: when the viewer can inline-edit we
  // show the "Edit profile" trigger (or Save/Cancel in edit mode) and
  // ignore the legacy editHref. The href fallback still handles the
  // group-admin-editing-someone-else case.
  const hasInline = canInlineEdit
  const hasEditLink = !hasInline && !!editHref

  // Follower / following counts for THIS profile (shown under the
  // action row). The Following count comes straight from the viewed
  // user's PDS; the Followers count comes from the indexer via the
  // `appCertifiedGraphFollow` connection with `subject.eq`.
  const viewedFollowing = useFollowing(did)
  const viewedFollowers = useFollowers(did)
  // Received-endorsements count for THIS profile — drives the
  // "Endorsed by N" row below the followers strip. Default
  // (non-owner) call: rejected awards are filtered out for us by
  // the hook so the count matches what foreign viewers see in the
  // Endorsements tab's Received sub-tab.
  const viewedReceived = useReceivedEndorsements(did)

  // Viewer's own following set — used to decide whether the Follow
  // button reads "Follow" or "Following" for foreign profiles. Skip
  // when the viewer is signed out or when they're looking at their
  // own profile (no Follow button to render in either case).
  const { did: viewerDid, isAuthenticated } = useAuth()
  const { handle: operatorHandle } = useSession()
  // Acting-as-group context is READ-SCOPE ONLY here. `activeOrg` decides
  // whose follow / given-endorsement set the button READS to render its
  // Follow/Following + Endorse/Endorsed state, so the strip reflects the
  // group's relationships while you're operating it. It does NOT decide
  // who the Follow / Endorse write is authored AS — that comes from a
  // per-action posting identity (default You), threaded into the write
  // helpers' `targetDid` seam separately. Splitting the two means a
  // viewer operating a group sees the group's state but still writes as
  // themselves unless they explicitly pick the group in the action.
  const { activeOrg } = useOrg()
  const isOwnProfile = !!viewerDid && viewerDid === did
  // READ-STATE repo — the active group (when operating one), else the
  // viewer. Drives the displayed Follow / Endorse button state below.
  // NOT a write target.
  const actingDid = activeOrg?.groupDid ?? viewerDid
  // Per-action WRITE identity for the social actions on this profile.
  // Defaults to You; the Follow control offers an inline "Follow as
  // <group>" switch and Endorse routes a group choice through a
  // high-stakes confirm. Never seeded from `activeOrg`.
  const posting = usePostingIdentity()
  // The acting repo's "following" set. Keyed to `actingDid` (the group
  // when operating one) — NOT the foreign profile — so the Follow button
  // reflects whether the READ-SCOPE repo already follows the subject.
  const viewerFollowing = useFollowing(
    isAuthenticated && !isOwnProfile ? actingDid : null,
  )

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
        <Avatar
          size="2xl"
          src={avatarUrl || undefined}
          fallbackInitials={initials}
        />
        {isEditing && hasInline ? (
          <AvatarEditOverlay
            onFile={handleAvatarUpload}
            isUploading={avatarUploading}
            hasPending={hasPendingAvatar}
          />
        ) : null}
      </div>

      <div className="profile-sidebar__name-block">
        {isEditing && hasInline ? (
          // Bare Input inside the H1 context so it inherits the serif H1
          // scale (font/size/weight/leading cascade from
          // `.profile-sidebar__name`). `borderWeight="hover"` reproduces the
          // 1.5px --border-hover resting / --fg-primary + --overlay-weak focus
          // chrome the legacy `.profile-sidebar__name-input` used.
          <h1 className="profile-sidebar__name">
            <Input
              size="bare"
              flush
              borderWeight="hover"
              type="text"
              className="py-1.5 px-2.5"
              value={drafts?.displayName ?? ""}
              maxLength={64}
              placeholder="Display name"
              aria-label="Display name"
              onChange={(e) => onDraftChange?.("displayName", e.target.value)}
            />
          </h1>
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

      {/* Action row: always rendered so the layout doesn't jump between
          read-only and edit modes. In edit mode the slot is intentionally
          empty (Save/Cancel live in the page-level banner above). */}
      <div className="profile-sidebar__actions">
        {isEditing ? null : hasInline ? (
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
        ) : isAuthenticated && viewerDid && actingDid ? (
          <>
            <FollowButton
              viewerDid={viewerDid}
              subjectDid={did}
              postingOptions={posting.options}
              isFollowing={viewerFollowing.subjects.has(did)}
              isLoading={viewerFollowing.isLoading}
              onFollowed={(uri, cid, writerDid) => {
                // Optimistic update reflects the WRITE identity (the
                // per-action posting choice), not the read-scope repo:
                // the read-state set still keys on `actingDid`, while the
                // foreign profile's follower list gains whoever actually
                // authored the follow. Real server data refreshes on the
                // next tab-mount / focus-revalidate.
                viewerFollowing.addFollow(did, uri, cid)
                viewedFollowers.addFollower(writerDid, uri, cid)
              }}
              onUnfollowed={(writerDid) => {
                viewerFollowing.removeFollow(did)
                viewedFollowers.removeFollower(writerDid)
              }}
            />
            <EndorseButton
              viewerDid={viewerDid}
              subjectDid={did}
              actingDid={actingDid}
              postingOptions={posting.options}
              operatorHandle={operatorHandle}
            />
            {/* Endorsement lists are personal-only — the Add-to-list
                affordance is hidden while acting as a group. */}
            {activeOrg ? null : (
              <AddToListMenu
                targetUri={`at://${did}/app.certified.actor.profile/self`}
                targetCid=""
                targetType={LIST_ACCOUNTS_TYPE}
              />
            )}
          </>
        ) : (
          <Button variant="primary" size="sm" disabled>
            <UserPlus size={14} strokeWidth={1.75} aria-hidden />
            Follow
          </Button>
        )}
      </div>

      <div className="profile-sidebar__stats">
      <p className="profile-sidebar__followers" aria-label="Followers and following">
        <Users size={16} strokeWidth={1.75} aria-hidden />
        <span>
          <span className="profile-sidebar__followers-count">
            {formatGraphCount(viewedFollowers.count ?? viewedFollowers.entries.length)}
          </span>{" "}
          <Link
            href={`${basePath}?tab=followers`}
            scroll={false}
            className="profile-sidebar__followers-link"
          >
            followers
          </Link>
        </span>
        <span aria-hidden className="profile-sidebar__followers-sep">·</span>
        <span>
          <span
            className="profile-sidebar__followers-count"
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
            className="profile-sidebar__followers-link"
          >
            following
          </Link>
        </span>
      </p>

      <p
        className="profile-sidebar__followers profile-sidebar__endorsed-by"
        aria-label="Endorsed by"
      >
        <ThumbsUp size={16} strokeWidth={1.75} aria-hidden />
        <Link
          href={`${basePath}?tab=endorsements&sub=received`}
          scroll={false}
          className="profile-sidebar__followers-link"
        >
          Endorsed by{" "}
          <span className="profile-sidebar__followers-count">
            {formatGraphCount(viewedReceived.endorsements.length)}
          </span>
        </Link>
      </p>
      </div>

      <ul className="profile-sidebar__details">
        {/* Main website field. In edit mode we add an uppercase
            sub-header so the input has the same labelled shape as the
            "Additional links" block below. Read mode shows just the
            SmartLink row (no header). */}
        {isEditing && hasInline ? (
          <>
            <li className="profile-sidebar__details-header">Main website</li>
            <li className="profile-sidebar__website-edit">
              <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
              {/* flex:1 bare Input beside the icon. `borderWeight="hover"`
                  matches the legacy `.profile-sidebar__website-input`
                  1.5px --border-hover resting / --fg-primary focus chrome;
                  font-size cascades from `.profile-sidebar__details li`
                  (0.875rem). */}
              <Input
                size="bare"
                flush
                borderWeight="hover"
                type="url"
                inputMode="url"
                className="flex-1 min-w-0 py-1.5 px-2.5"
                value={drafts?.website ?? ""}
                maxLength={256}
                placeholder="https://example.com"
                aria-label="Website"
                onChange={(e) => onDraftChange?.("website", e.target.value)}
              />
            </li>
          </>
        ) : profile?.website ? (
          <li>
            <SmartLink url={profile.website} />
          </li>
        ) : null}
        {/* Additional URL list. In edit mode (org admin) we render the
            inline editor with delete + add affordances; in read-only
            we render one row per saved URL. Empty arrays render
            nothing (no "URLs" header). */}
        {isEditing && hasInline && isOrg ? (
          <>
            <li className="profile-sidebar__details-header">Additional links</li>
            <OrgUrlListEditor
              rows={drafts?.additionalUrls ?? []}
              onChange={(rows) => onDraftChange?.("additionalUrls", rows)}
            />
          </>
        ) : isOrg && additionalUrls
          ? additionalUrls
              .filter((u) => typeof u === "string" && u.length > 0)
              .map((u) => (
                <li key={u}>
                  <SmartLink url={u} />
                </li>
              ))
          : null}
        {/* Org-only founded date editor. Location and org type now live
            in the overview pane (alongside the map and the about
            section). In read mode the founded-date row replaces the
            generic "Joined ..." row below when present. */}
        {isEditing && hasInline && isOrg ? (
          <li className="profile-sidebar__org-field-edit">
            <Calendar size={16} strokeWidth={1.75} aria-hidden />
            <span className="profile-sidebar__org-field-label">Founded</span>
            {/* flex:1 bare Input. `borderWeight="default"` matches the legacy
                `.profile-sidebar__org-input` 1px --border-default resting
                border; font-size cascades from the details-list row. */}
            <Input
              size="bare"
              flush
              borderWeight="default"
              type="date"
              className="flex-1 min-w-0 py-1.5 px-2.5"
              value={drafts?.foundedDate ?? ""}
              aria-label="Founded date"
              onChange={(e) => onDraftChange?.("foundedDate", e.target.value)}
            />
          </li>
        ) : null}
        {!hasCertifiedProfile && handle ? (
          <li className="profile-sidebar__bsky-row">
            {/* Tag-style chip (not a regular link) so the viewer can
                tell at a glance that this profile's metadata is
                imported from Bluesky rather than authored on
                Certified. Shown when the user has NO populated
                `app.certified.actor.profile` displayName — every
                field rendered above (displayName / description /
                avatar / banner) came from `app.bsky.actor.profile`
                via the resolve-did merge. Issue #74. */}
            <a
              href={`https://bsky.app/profile/${encodeURIComponent(handle)}`}
              className="profile-sidebar__bsky-tag"
              rel="noopener noreferrer"
              target="_blank"
              title="The profile information is imported from Bluesky"
            >
              Bluesky profile
            </a>
          </li>
        ) : null}
        {/* Founded date for organizations; Joined date for everyone
            else. We never surface "Joined ..." on an org profile —
            "joined Certified at <some date>" is admin noise the
            org's audience doesn't care about. An org with no founded
            date just hides this row entirely.
            In edit mode the read-only row is suppressed for orgs
            since the editable Founded input above already shows the
            same value (and lets the admin change it). */}
        {isEditing && hasInline && isOrg ? null : isOrg ? (
          orgFoundedDate ? (
            <li className="profile-sidebar__details-date">
              <Calendar size={16} strokeWidth={1.75} aria-hidden />
              <span>Founded {orgFoundedDate}</span>
            </li>
          ) : null
        ) : joinedText && !isBskyHosted ? (
          // Skip "Joined …" on bluesky-hosted profiles — `createdAt`
          // there reflects when the bsky.app account was created, not
          // when the user joined Certified, so the line would mislead
          // viewers. The Bluesky-profile chip above already signals
          // the data source.
          <li className="profile-sidebar__details-date">
            <Calendar size={16} strokeWidth={1.75} aria-hidden />
            <span>{joinedText}</span>
          </li>
        ) : null}
      </ul>

    </aside>
  )
}

interface OrgUrlListEditorProps {
  rows: DraftUrlRow[]
  onChange: (rows: DraftUrlRow[]) => void
}

/**
 * Inline editor for the org-only `additionalUrls` list. Each row is a
 * `<li>` so it slots into the existing `.profile-sidebar__details` list
 * without changing the surrounding layout. The trailing "+ Add URL"
 * button appends an empty row; the per-row remove button deletes it.
 *
 * Validation is intentionally light here — full URL checks happen on
 * save in the parent (matching the profile-edit-form behaviour). We
 * just make sure the inputs are typed correctly and that the "+ Add"
 * always renders so the list is reachable from an empty state.
 */
function OrgUrlListEditor({ rows, onChange }: OrgUrlListEditorProps) {
  const update = (id: string, patch: Partial<DraftUrlRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  const remove = (id: string) => {
    onChange(rows.filter((r) => r.id !== id))
  }
  const add = () => {
    onChange([...rows, newDraftUrlRow()])
  }
  // Reorder helpers — swap with the neighbour in the requested
  // direction. Save persists the new array order verbatim, so the
  // read-side render renders URLs in this same sequence.
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const next = rows.slice()
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }
  return (
    <>
      {rows.map((row, i) => {
        const isFirst = i === 0
        const isLast = i === rows.length - 1
        return (
          <li key={row.id} className="profile-sidebar__org-url-edit">
            <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
            {/* flex:1 bare Input beside the icon. `borderWeight="default"`
                matches the legacy `.profile-sidebar__org-input` 1px
                --border-default resting border. */}
            <Input
              size="bare"
              flush
              borderWeight="default"
              type="url"
              inputMode="url"
              className="flex-1 min-w-0 py-1.5 px-2.5"
              value={row.url}
              placeholder="https://example.com"
              aria-label="URL"
              onChange={(e) => update(row.id, { url: e.target.value })}
            />
            <div className="profile-sidebar__org-url-actions">
              <button
                type="button"
                className="profile-sidebar__org-url-move"
                onClick={() => move(i, -1)}
                disabled={isFirst}
                aria-label="Move URL up"
                title="Move up"
              >
                <ChevronUp size={14} strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                className="profile-sidebar__org-url-move"
                onClick={() => move(i, 1)}
                disabled={isLast}
                aria-label="Move URL down"
                title="Move down"
              >
                <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                className="profile-sidebar__org-url-remove"
                onClick={() => remove(row.id)}
                aria-label="Remove URL"
                title="Remove URL"
              >
                <X size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </li>
        )
      })}
      <li className="profile-sidebar__org-url-add-row">
        <button
          type="button"
          className="profile-sidebar__org-url-add"
          onClick={add}
        >
          <Plus size={14} strokeWidth={2} aria-hidden />
          Add URL
        </button>
      </li>
    </>
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

interface AvatarEditOverlayProps {
  onFile: (file: File) => Promise<void>
  isUploading: boolean
  hasPending: boolean
}

/**
 * Click-to-upload overlay rendered on top of the existing 240×240
 * <Avatar>. Keeps the avatar at the same position and size as
 * read-only mode — only adds an affordance on top.
 */
function AvatarEditOverlay({ onFile, isUploading, hasPending }: AvatarEditOverlayProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onClick = () => inputRef.current?.click()
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    // Reset so the same file can be picked again.
    if (inputRef.current) inputRef.current.value = ""
  }
  return (
    <>
      <button
        type="button"
        className="profile-sidebar__avatar-edit-btn"
        onClick={onClick}
        aria-label={isUploading ? "Uploading avatar" : "Change avatar"}
        title="Change avatar"
      >
        {isUploading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <>
            <Camera size={16} strokeWidth={1.75} aria-hidden />
            <span className="profile-sidebar__avatar-edit-label">
              {hasPending ? "Replace avatar" : "Change avatar"}
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="profile-sidebar__avatar-edit-input"
        onChange={handleChange}
      />
    </>
  )
}

/* ------------------------------ Follow ------------------------------
 *
 * Sidebar Follow / Following toggle, shown to signed-in viewers who
 * are looking at someone else's profile. Hidden for own-profile views
 * and for viewers who can edit (the Edit button takes the slot).
 *
 * Optimistically flips its own label between "Follow" and "Following"
 * while the write is in flight; the parent's `onAfterWrite` re-pages
 * the viewer's follow list so the true state catches up.
 */

interface FollowButtonProps {
  viewerDid: string
  subjectDid: string
  /** Per-action posting options (You first, then writable groups). The
   *  Follow write target is chosen here, defaulting to You — never
   *  inherited from the active read-scope org. A single option (You)
   *  renders no picker. */
  postingOptions: PostingIdentity[]
  isFollowing: boolean
  isLoading: boolean
  /** Fired after a successful createFollow with the new record's strong
   *  ref and the DID it was authored as (the chosen write identity). */
  onFollowed: (uri: string, cid: string, writerDid: string) => void
  /** Fired after a successful deleteFollow with the DID the record was
   *  authored as. */
  onUnfollowed: (writerDid: string) => void
}

function FollowButton({
  viewerDid,
  subjectDid,
  postingOptions,
  isFollowing,
  isLoading,
  onFollowed,
  onUnfollowed,
}: FollowButtonProps) {
  const [isWriting, setIsWriting] = useState(false)
  // Per-action write identity for THIS Follow. Default You; the picker
  // below lets the operator opt into "Follow as <group>". Follow is
  // low-stakes, so there's no confirm gate — just the inline choice.
  const [posting, setPosting] = useState<PostingIdentity>(
    () => postingOptions[0] ?? { did: viewerDid, kind: "personal", label: "You" },
  )
  const disabled = isLoading || isWriting
  // Group writes route to the group's repo via the BFF (`targetDid`);
  // personal writes leave `targetDid` undefined → the viewer's own PDS.
  const targetDid = posting.kind === "group" ? posting.did : undefined
  // The repo the follow record lives in — the chosen write identity's
  // repo. Drives the rkey lookup + which repo's follows we delete from.
  const actingRepo = targetDid ?? viewerDid
  // Only surface the "Follow as" picker when there's more than one
  // option (i.e. the viewer admins at least one group).
  const showPicker = postingOptions.length > 1

  const handleClick = async () => {
    if (disabled) return
    const next = !isFollowing
    const writerDid = actingRepo
    setIsWriting(true)
    try {
      if (next) {
        const result = await createFollow(viewerDid, subjectDid, { targetDid })
        // Hand the new ref + the write identity to the parent so the
        // following set and the subject's follower list update instantly.
        onFollowed(result.uri, result.cid, writerDid)
      } else {
        // Unfollow path: walk the chosen write repo's follows to find the
        // rkey targeting this subject. Fetched fresh here to handle the
        // duplicate-follow edge case (delete the most recent record).
        const { records } = await listFollowing(actingRepo, undefined, {
          noCache: true,
        })
        const match = records
          .filter((r) => r.value.subject === subjectDid)
          .sort((a, b) =>
            a.value.createdAt < b.value.createdAt ? 1 : -1,
          )[0]
        if (match) {
          await deleteFollow(viewerDid, match.rkey, { targetDid })
        }
        onUnfollowed(writerDid)
      }
    } catch (err) {
      console.error("Follow toggle failed:", err)
    } finally {
      setIsWriting(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      <Button
        variant={isFollowing ? "secondary" : "primary"}
        size="sm"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={isFollowing}
      >
        {isFollowing ? (
          <Check size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <UserPlus size={14} strokeWidth={1.75} aria-hidden />
        )}
        {isFollowing ? "Following" : "Follow"}
      </Button>
      {showPicker && !isFollowing ? (
        <PostingAs
          value={posting}
          onChange={setPosting}
          options={postingOptions}
          size="sm"
          aria-label="Follow as"
        />
      ) : null}
    </div>
  )
}

/**
 * Sidebar count formatter. `null` (not yet loaded) renders as an em
 * dash so the layout doesn't jump; `0` renders as `0` because that's
 * a real, meaningful value to viewers ("nobody follows this account
 * yet").
 */
function formatGraphCount(
  n: number | null | undefined,
  truncated = false,
): string {
  if (n === null || n === undefined) return "—"
  const formatted = new Intl.NumberFormat().format(n)
  return truncated ? `${formatted}+` : formatted
}

/* ----------------------------- Endorse ------------------------------
 *
 * Endorse / Endorsed toggle. Lives next to FollowButton on foreign
 * profiles. Writes against the viewer's default endorsement
 * definition (`ensureEndorsementDefinition` runs implicitly inside
 * `createEndorsementAward`). Revoking gates on a Confirm dialog
 * because endorsement deletion is silent on the recipient's side.
 *
 * Used to live as `EndorseShortcut` at the top of the Received
 * sub-tab — moved into the sidebar so the action sits with Follow,
 * and discovery doesn't depend on the viewer landing on the
 * Endorsements tab first.
 */

interface EndorseButtonProps {
  viewerDid: string
  subjectDid: string
  /** READ-STATE repo — the active group (when operating one) or the
   *  viewer. Drives the given-endorsements set that decides the
   *  displayed Endorse / Endorsed state and the revoke rkey lookup. NOT
   *  the write target — that comes from the per-action posting picker. */
  actingDid: string
  /** Per-action posting options (You first, then writable groups). The
   *  endorsement write target is chosen here, defaulting to You. Endorse
   *  is HIGH-STAKES, so a group choice routes through a
   *  `<PostingAsConfirm>` gate naming endorser / operator / subject. */
  postingOptions: PostingIdentity[]
  /** The signed-in operator's handle, surfaced in the delegation header
   *  of the reason modal + the high-stakes confirm. */
  operatorHandle: string | null
}

function EndorseButton({
  viewerDid,
  subjectDid,
  actingDid,
  postingOptions,
  operatorHandle,
}: EndorseButtonProps) {
  // Per-action WRITE identity for this endorsement. Default You; the
  // picker lets the operator opt into a group, which then routes through
  // the high-stakes confirm before committing. Never seeded from the
  // active read-scope org.
  const [posting, setPosting] = useState<PostingIdentity>(
    () => postingOptions[0] ?? { did: viewerDid, kind: "personal", label: "You" },
  )
  const postingIsGroup = posting.kind === "group"
  // The group DID the write routes to (undefined when posting as You →
  // the viewer's own repo via the personal path).
  const targetDid = postingIsGroup ? posting.did : undefined
  // READ-STATE set — the active group's given-endorsements when
  // operating one, the viewer's otherwise. Decides Endorse/Endorsed.
  const ownGiven = useGivenEndorsements(actingDid)
  // Endorsement lists are personal-only — never load or surface them
  // when the WRITE identity is a group (the reason modal hides the
  // picker too).
  const ownLists = useEndorsementLists(postingIsGroup ? null : viewerDid)
  const { info: subjectInfo } = useAuthorInfo(subjectDid)
  const subjectLabel =
    subjectInfo?.displayName || subjectInfo?.handle || subjectDid
  const [isWriting, setIsWriting] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  // Pending {note, listRkey} captured by the reason modal, held while the
  // high-stakes <PostingAsConfirm> is shown for a group-authored award.
  const [pendingAward, setPendingAward] = useState<{
    note: string
    listRkey: string | null
  } | null>(null)
  // Only show the "Endorse as" picker when there's more than one option.
  const showPicker = postingOptions.length > 1
  // Optimistic flip — mirrors FollowButton. The hook's `endorsements`
  // refetch may lag the PDS write by a beat, so we override locally
  // until the parent value catches up.
  const [optimistic, setOptimistic] = useState<boolean | null>(null)

  const existing = ownGiven.endorsements.find((e) => e.subjectDid === subjectDid)
  const isEndorsedFromState = !!existing
  const isEndorsed = optimistic ?? isEndorsedFromState

  // Once the parent confirms the same state, drop the override so
  // the hook value becomes authoritative again.
  useEffect(() => {
    if (optimistic !== null && isEndorsedFromState === optimistic) {
      setOptimistic(null)
    }
  }, [isEndorsedFromState, optimistic])

  const disabled = isWriting || ownGiven.isLoading

  /**
   * Click on the unfilled button → open the reason modal. The actual
   * write happens inside the modal's confirm so the note travels
   * with the award. If the user cancels the modal we never touch
   * the optimistic state — the button stays on "Endorse".
   */
  const handleEndorseClick = () => {
    if (disabled) return
    setReasonOpen(true)
  }

  // The actual award write — issued AS the chosen posting identity. The
  // issuer recorded in the optimistic received-overlay is the WRITE
  // identity (`posting.did`), so the subject's "Endorsed by N" reflects
  // who actually authored the award.
  const runAwardWrite = async (note: string, listRkey: string | null) => {
    setOptimistic(true)
    setIsWriting(true)
    try {
      // quality-048: orchestration (create → refetch-given → optional
      // list-append) lives in `runEndorseReasonConfirm` so the ordering
      // and its error handling are unit-testable. It refetches the
      // given set BEFORE the list-append and, on append failure, keeps
      // optimistic=true while rethrowing the attribution error.
      await runEndorseReasonConfirm({
        note,
        listRkey,
        createAward: (n) =>
          createEndorsementAward(viewerDid, subjectDid, n, { targetDid }),
        // PR #110: as soon as the award lands, push it into the shared
        // received-endorsements overlay so the subject's "Endorsed by N"
        // counter and the Endorsements tab reflect it immediately, ahead
        // of the 5-min scan cache / indexer catching up. The issuer is
        // the chosen WRITE identity (the group when posting as one).
        onAwardCreated: (award) =>
          addOptimisticReceivedEndorsement(subjectDid, {
            uri: award.uri,
            cid: award.cid,
            issuerDid: posting.did,
            createdAt: new Date().toISOString(),
            note: note || undefined,
            responseState: null,
          }),
        appendToList: (rkey, award) => appendItemToList(viewerDid, rkey, award),
        refetchGiven: () => ownGiven.refetch(),
        refetchLists: () => ownLists.refetch(),
        setOptimistic,
      })
    } finally {
      setIsWriting(false)
    }
  }

  // Reason-modal confirm. For a personal (You) endorse this writes
  // immediately; for a GROUP-authored endorse (high-stakes) it stashes
  // the note and hands off to the <PostingAsConfirm> gate, which spells
  // out endorser / operator / subject before the irreversible-feeling,
  // reputation-bearing record lands under the group's identity.
  const handleReasonConfirm = async (note: string, listRkey: string | null) => {
    if (postingIsGroup) {
      setPendingAward({ note, listRkey })
      setReasonOpen(false)
      return
    }
    try {
      await runAwardWrite(note, listRkey)
      setReasonOpen(false)
    } catch (err) {
      // Optimistic flag managed inside the orchestrator. Rethrow so the
      // modal surfaces the error and stays open.
      throw err
    }
  }

  // High-stakes confirm → commit the stashed group-authored award.
  const handlePostingConfirm = async () => {
    if (!pendingAward) return
    try {
      await runAwardWrite(pendingAward.note, pendingAward.listRkey)
      setPendingAward(null)
    } catch (err) {
      console.error("Endorse-as-group failed:", err)
      // Keep the confirm open so the operator can retry / cancel.
    }
  }

  const handleConfirmRevoke = async () => {
    if (!existing || disabled) return
    setOptimistic(false)
    setIsWriting(true)
    try {
      await deleteEndorsementAward(viewerDid, existing.rkey, { targetDid })
      removeOptimisticReceivedEndorsement(subjectDid, existing.uri)
      await ownGiven.refetch()
      setConfirmRevoke(false)
    } catch (err) {
      console.error("Revoke endorsement failed:", err)
      setOptimistic(null)
    } finally {
      setIsWriting(false)
    }
  }

  // Delegation naming for the reason modal — names the chosen group, the
  // operator, and the subject when the WRITE identity is a group.
  // `undefined` on the personal (You) path leaves the modal in its
  // default single-party shape. Derived from the per-action posting
  // choice, NOT the active read-scope org.
  const actingAs: EndorseReasonActingAs | undefined = postingIsGroup
    ? {
        orgName: posting.label,
        orgHandle: posting.handle ?? "",
        operatorHandle: operatorHandle ?? "you",
        // Group posting options always carry the viewer's role; fall back
        // defensively so the type stays total.
        operatorRole: posting.role ?? "admin",
      }
    : undefined

  return (
    <>
      <div className="flex flex-col gap-1.5 items-start">
        <Button
          variant={isEndorsed ? "secondary" : "primary"}
          size="sm"
          onClick={isEndorsed ? () => setConfirmRevoke(true) : handleEndorseClick}
          disabled={disabled}
          aria-pressed={isEndorsed}
        >
          {isEndorsed ? (
            <Check size={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <ThumbsUp size={14} strokeWidth={1.75} aria-hidden />
          )}
          {isEndorsed ? "Endorsed" : "Endorse"}
        </Button>
        {showPicker && !isEndorsed ? (
          <PostingAs
            value={posting}
            onChange={setPosting}
            options={postingOptions}
            size="sm"
            aria-label="Endorse as"
          />
        ) : null}
      </div>
      {reasonOpen ? (
        <EndorseReasonModal
          subjectLabel={subjectLabel}
          actingAs={actingAs}
          lists={ownLists.lists.map((l) => ({ rkey: l.rkey, title: l.title }))}
          onConfirm={handleReasonConfirm}
          onClose={() => setReasonOpen(false)}
        />
      ) : null}
      {pendingAward ? (
        <PostingAsConfirm
          endorser={posting}
          operator={{
            label: operatorHandle ?? "you",
            handle: operatorHandle ?? undefined,
            role: posting.role,
          }}
          subject={subjectLabel}
          actionLabel="endorse"
          confirmLabel="Endorse"
          isConfirming={isWriting}
          onConfirm={handlePostingConfirm}
          onCancel={() => {
            if (!isWriting) {
              // Bail out of the group-authored endorse without writing.
              setPendingAward(null)
              setOptimistic(null)
            }
          }}
        />
      ) : null}
      {confirmRevoke ? (
        <ConfirmDialog
          title="Revoke endorsement?"
          message="Your endorsement will be removed from this profile. You can endorse them again later."
          confirmLabel="Revoke"
          cancelLabel="Keep endorsement"
          confirmVariant="destructive"
          isConfirming={isWriting}
          onConfirm={handleConfirmRevoke}
          onCancel={() => !isWriting && setConfirmRevoke(false)}
        />
      ) : null}
    </>
  )
}
