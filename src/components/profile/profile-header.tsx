"use client"

import { useRef, useState, Fragment } from "react"
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link as LinkIcon,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  X,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import Skeleton from "@/components/ui/skeleton"
import LoadingSpinner from "@/components/ui/loading-spinner"
import SmartLink from "@/components/ui/smart-link"
import Tooltip from "@/components/ui/tooltip"
import BannerUpload from "@/components/profile/banner-upload"
import ProfileTrustLine from "@/components/profile/profile-trust-line"
import { FollowEndorseActions } from "@/components/profile/profile-follow-endorse"
import AddToListMenu from "@/components/lists/add-to-list-menu"
import { LIST_ACCOUNTS_TYPE } from "@/lib/atproto/typed-lists"
import { useRegisterPageHeader } from "@/lib/navbar-context"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useProfilePds } from "@/hooks/use-profile-pds"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { getInitials } from "@/lib/utils/initials"
import { formatMonthYear } from "@/lib/utils/format-date"
import { profileUrl } from "@/lib/urls"
import type { CertifiedProfile } from "@/lib/atproto/types"
import {
  newDraftUrlRow,
  type DraftUrlRow,
  type ProfileDrafts,
} from "@/components/profile/profile-inline-edit-types"

type DraftChange = <K extends keyof ProfileDrafts>(
  key: K,
  value: ProfileDrafts[K],
) => void

export interface ProfileHeaderProps {
  did: string
  handle: string | null
  profile: CertifiedProfile | null
  avatarUrl: string | null
  bannerUrl: string | null
  /** Path of the profile page, without the query. */
  basePath: string
  /** The profile carries the organization marker. */
  isOrg: boolean
  /** An `app.certified.actor.profile` with a display name exists. When
   *  false and a Bluesky profile does, the data came from Bluesky and the
   *  header says so (issue #74). */
  hasCertifiedProfile: boolean
  hasBlueskyProfile: boolean
  /** Organization facts for the meta line ("Type · Location · Founded …"). */
  orgTypeTags?: string[]
  orgLocationName?: string | null
  orgFoundedDate?: string | null
  /** Extra organization links, shown after the website. */
  additionalUrls?: string[]
  /** The viewer's current identity is this account: Edit profile + Share
   *  replace Follow / Endorse. */
  canEdit: boolean
  /** Group settings, for an admin of this group who isn't acting as it
   *  (while acting as it, the owner bar links there). */
  settingsHref?: string
  onEditClick?: () => void

  // Edit mode (only when `canEdit`).
  isEditing?: boolean
  drafts?: ProfileDrafts
  onDraftChange?: DraftChange
  onAvatarFile?: (file: File) => Promise<void>
  hasPendingAvatar?: boolean
  onBannerFile?: (file: File) => Promise<void>
  onBannerRemove?: () => void
  hasPendingBanner?: boolean
}

/**
 * The public profile's header, the same on phones and desktop: an optional
 * banner, the avatar, the name as the page's `<h1>` (it registers with the
 * chrome like `<PageHeader>`, so the chrome renders no h1 of its own),
 * the handle, bio, links, a meta line, the actions for this viewer, and the
 * trust line (who endorsed the account, follower counts).
 *
 * In edit mode the same slots become fields: banner and avatar uploads,
 * name, bio, website, and for organizations the extra links and the
 * founded date. Save / Cancel live in the page's `<EditBanner>`.
 */
export default function ProfileHeader({
  did,
  handle,
  profile,
  avatarUrl,
  bannerUrl,
  basePath,
  isOrg,
  hasCertifiedProfile,
  hasBlueskyProfile,
  orgTypeTags = [],
  orgLocationName = null,
  orgFoundedDate = null,
  additionalUrls = [],
  canEdit,
  settingsHref,
  onEditClick,
  isEditing = false,
  drafts,
  onDraftChange,
  onAvatarFile,
  hasPendingAvatar = false,
  onBannerFile,
  onBannerRemove,
  hasPendingBanner = false,
}: ProfileHeaderProps) {
  useRegisterPageHeader()

  const editing = isEditing && canEdit
  const displayName = profile?.displayName || handle || "Anonymous"
  const initials = getInitials(profile?.displayName, handle ?? did)
  const { isBskyHosted } = useProfilePds(did)

  // Banner: hidden entirely when there is none (no empty gradient panel);
  // a failed load falls back to no banner rather than a broken image.
  const [failedBanner, setFailedBanner] = useState<string | null>(null)
  const showBanner = !!bannerUrl && failedBanner !== bannerUrl
  const [bannerUploading, setBannerUploading] = useState(false)
  const handleBannerUpload = async (file: File) => {
    if (!onBannerFile) return
    setBannerUploading(true)
    try {
      await onBannerFile(file)
    } finally {
      setBannerUploading(false)
    }
  }

  // Meta line: organizations name their type, place and founding; people
  // show when they joined. "Joined" is skipped on Bluesky-hosted accounts,
  // whose `createdAt` is the Bluesky signup, not the Certified one.
  const joined =
    !isOrg && !isBskyHosted && profile?.createdAt
      ? formatMonthYear(profile.createdAt)
      : null
  const metaItems: string[] = isOrg
    ? [
        orgTypeTags.join(", "),
        orgLocationName ?? "",
        orgFoundedDate ? `Founded ${orgFoundedDate}` : "",
      ].filter(Boolean)
    : joined
      ? [`Joined ${joined}`]
      : []

  const links = [
    ...(profile?.website ? [profile.website] : []),
    ...(isOrg
      ? additionalUrls.filter(
          (u) => typeof u === "string" && u.length > 0 && u !== profile?.website,
        )
      : []),
  ]
  const fromBluesky = !hasCertifiedProfile && hasBlueskyProfile && !!handle

  const hasBannerSlot = editing || showBanner

  return (
    <header
      className={`profile-header${hasBannerSlot ? " profile-header--banner" : ""}`}
    >
      {editing ? (
        <div className="profile-header__banner profile-header__banner--editing">
          <BannerUpload
            currentBannerUrl={bannerUrl}
            onUpload={handleBannerUpload}
            onRemove={onBannerRemove}
            isUploading={bannerUploading}
          />
          {hasPendingBanner ? (
            <p className="profile-header__staged">
              New banner added. It is saved when you save.
            </p>
          ) : null}
        </div>
      ) : showBanner ? (
        <div className="profile-header__banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl!}
            alt=""
            className="profile-header__banner-img"
            onError={() => setFailedBanner(bannerUrl)}
          />
        </div>
      ) : null}

      <div className="profile-header__top">
        <div
          className={`profile-header__avatar${
            isOrg ? " profile-header__avatar--square" : ""
          }`}
        >
          <Avatar
            size="xl"
            shape={isOrg ? "square" : "circle"}
            src={avatarUrl || undefined}
            fallbackInitials={initials}
            seed={did}
          />
          {editing && onAvatarFile ? (
            <AvatarEditButton
              onFile={onAvatarFile}
              hasPending={hasPendingAvatar}
            />
          ) : null}
        </div>

        {editing ? null : (
          <div className="profile-header__actions">
            {canEdit ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onEditClick}
                  data-tour="profile-edit"
                >
                  <Pencil size={16} strokeWidth={1.75} aria-hidden />
                  Edit profile
                </Button>
                <ShareButton handle={handle} did={did} />
              </>
            ) : (
              <VisitorActions did={did} settingsHref={settingsHref} />
            )}
          </div>
        )}
      </div>

      {editing && drafts && onDraftChange ? (
        <ProfileHeaderFields
          displayName={displayName}
          drafts={drafts}
          onDraftChange={onDraftChange}
          isOrg={isOrg}
        />
      ) : (
        <div className="profile-header__identity">
          <h1 className="profile-header__name font-headline text-h2" dir="auto">
            {displayName}
          </h1>
          {handle || profile?.pronouns || fromBluesky ? (
            <p className="profile-header__handle">
              {handle ? <span className="profile-header__handle-text">@{handle}</span> : null}
              {profile?.pronouns ? (
                <>
                  {handle ? <span aria-hidden>·</span> : null}
                  <span>{profile.pronouns}</span>
                </>
              ) : null}
              {fromBluesky ? (
                <a
                  href={`https://bsky.app/profile/${encodeURIComponent(handle!)}`}
                  className="profile-header__tag"
                  rel="noopener noreferrer"
                  target="_blank"
                  title="This profile is imported from Bluesky"
                >
                  Bluesky profile
                  {" "}<span className="sr-only">(opens in new tab)</span>
                </a>
              ) : null}
            </p>
          ) : null}

          {profile?.description ? (
            <p className="profile-header__bio" dir="auto">
              {profile.description}
            </p>
          ) : null}

          {links.length > 0 ? (
            <ul className="profile-header__links" aria-label="Links">
              {links.map((u) => (
                <li key={u} className="profile-header__link">
                  <SmartLink url={u} className="profile-header__link-anchor" />
                </li>
              ))}
            </ul>
          ) : null}

          <div className="profile-header__meta">
            {metaItems.length > 0 ? (
              <span className="profile-header__meta-text">
                {/* Each item stays whole ("Founded Feb 2023"); the line
                    wraps between items. */}
                {metaItems.map((item, i) => (
                  <Fragment key={item}>
                    {i > 0 ? " · " : null}
                    <span className="whitespace-nowrap">{item}</span>
                  </Fragment>
                ))}
              </span>
            ) : null}
            <CopyIdButton did={did} />
          </div>
        </div>
      )}

      {editing ? null : <ProfileTrustLine did={did} basePath={basePath} />}
    </header>
  )
}

/** Header placeholder while the profile resolves, shaped like the real one. */
export function ProfileHeaderSkeleton() {
  return (
    <div className="profile-header" aria-hidden>
      <div className="profile-header__top">
        <Skeleton circle width={96} />
      </div>
      <div className="profile-header__identity">
        <Skeleton variant="line" width={240} height={32} />
        <Skeleton variant="line" width={160} height={16} />
        <Skeleton variant="text" lines={2} width="min(100%, 480px)" />
        <Skeleton variant="line" width={280} height={16} />
      </div>
    </div>
  )
}

/* ------------------------------ Actions ------------------------------ */

function VisitorActions({
  did,
  settingsHref,
}: {
  did: string
  settingsHref?: string
}) {
  const { did: viewerDid } = useAuth()
  const { activeOrg } = useOrg()
  const isOwnAccount = !!viewerDid && viewerDid === did
  return (
    <>
      <FollowEndorseActions did={did} />
      {settingsHref ? (
        <Button
          href={settingsHref}
          variant="secondary"
          size="icon"
          aria-label="Group settings"
        >
          <SettingsIcon size={16} strokeWidth={1.75} aria-hidden />
        </Button>
      ) : null}
      {/* Lists are personal: no list menu while acting as a group, and none
          on your own account (seen while acting as a group). */}
      {activeOrg || isOwnAccount ? null : (
        <AddToListMenu
          targetUri={`at://${did}/app.certified.actor.profile/self`}
          targetCid=""
          targetType={LIST_ACCOUNTS_TYPE}
        />
      )}
    </>
  )
}

function ShareButton({ handle, did }: { handle: string | null; did: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          void copy(`${window.location.origin}${profileUrl(handle || did)}`)
        }
      >
        {copied ? (
          <Check size={16} strokeWidth={1.75} aria-hidden />
        ) : (
          <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
        )}
        {copied ? "Link copied" : "Share"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Profile link copied" : ""}
      </span>
    </>
  )
}

/** The account's Permanent ID (its DID), click to copy. */
function CopyIdButton({ did }: { did: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <Tooltip label={copied ? "Copied" : "Copy Permanent ID"}>
      <button
        type="button"
        className="profile-header__id"
        onClick={() => void copy(did)}
        aria-label={copied ? "Permanent ID copied" : `Copy Permanent ID ${did}`}
      >
        <span className="profile-header__id-label">Permanent ID</span>
        <span className="profile-header__id-value">{did}</span>
        {copied ? (
          <Check size={16} strokeWidth={1.75} aria-hidden />
        ) : (
          <Copy size={16} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </Tooltip>
  )
}

/* ----------------------------- Edit mode ----------------------------- */

function AvatarEditButton({
  onFile,
  hasPending,
}: {
  onFile: (file: File) => Promise<void>
  hasPending: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const label = uploading
    ? "Uploading photo"
    : hasPending
      ? "Replace photo"
      : "Change photo"
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so the same file can be picked again.
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return
    setUploading(true)
    try {
      await onFile(file)
    } finally {
      setUploading(false)
    }
  }
  return (
    <>
      <Tooltip label={label}>
        <button
          type="button"
          className="profile-header__avatar-edit"
          onClick={() => inputRef.current?.click()}
          aria-label={label}
          disabled={uploading}
        >
          {uploading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <Camera size={16} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        // Matches the banner and the shared ALLOWED_IMAGE_TYPES, so
        // unsupported formats (e.g. SVG) can't be picked at all.
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleChange}
      />
    </>
  )
}

function ProfileHeaderFields({
  displayName,
  drafts,
  onDraftChange,
  isOrg,
}: {
  displayName: string
  drafts: ProfileDrafts
  onDraftChange: DraftChange
  isOrg: boolean
}) {
  return (
    <div className="profile-header__fields">
      {/* The page keeps its one h1 while the name is a field. */}
      <h1 className="sr-only">{displayName}</h1>
      <Input
        label="Name"
        value={drafts.displayName}
        maxLength={64}
        placeholder="Display name"
        autoComplete="name"
        onChange={(e) => onDraftChange("displayName", e.target.value)}
      />
      <Textarea
        label="Bio"
        rows={3}
        value={drafts.description}
        maxLength={256}
        showCount
        placeholder={
          isOrg
            ? "A short description of this organization."
            : "A short description of you and your work."
        }
        onChange={(e) => onDraftChange("description", e.target.value)}
      />
      <Input
        label="Website"
        type="url"
        inputMode="url"
        value={drafts.website}
        maxLength={256}
        placeholder="https://example.com"
        leadingIcon={<LinkIcon size={16} strokeWidth={1.75} aria-hidden />}
        onChange={(e) => onDraftChange("website", e.target.value)}
      />
      {isOrg ? (
        <>
          <OrgUrlListEditor
            rows={drafts.additionalUrls}
            onChange={(rows) => onDraftChange("additionalUrls", rows)}
          />
          <Input
            label="Founded"
            type="date"
            value={drafts.foundedDate}
            onChange={(e) => onDraftChange("foundedDate", e.target.value)}
          />
        </>
      ) : null}
    </div>
  )
}

/**
 * Editor for an organization's extra links. Each row is a URL field with
 * move up / move down / remove; "Add link" appends an empty row. Save
 * persists the order as shown. Validation happens on save in the parent.
 */
function OrgUrlListEditor({
  rows,
  onChange,
}: {
  rows: DraftUrlRow[]
  onChange: (rows: DraftUrlRow[]) => void
}) {
  const update = (id: string, url: string) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, url } : r)))
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id))
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const next = rows.slice()
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }
  return (
    <fieldset className="profile-header__url-editor">
      <legend className="profile-header__field-label">More links</legend>
      {rows.length > 0 ? (
        <ul className="profile-header__url-rows">
          {rows.map((row, i) => (
            <li key={row.id} className="profile-header__url-row">
              <Input
                flush
                type="url"
                inputMode="url"
                className="min-w-0 flex-1"
                value={row.url}
                placeholder="https://example.com"
                aria-label={`Link ${i + 1}`}
                onChange={(e) => update(row.id, e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move link ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ChevronUp size={16} strokeWidth={1.75} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move link ${i + 1} down`}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => remove(row.id)}
              >
                <X size={16} strokeWidth={1.75} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...rows, newDraftUrlRow()])}
      >
        <Plus size={16} strokeWidth={1.75} aria-hidden />
        Add link
      </Button>
    </fieldset>
  )
}
