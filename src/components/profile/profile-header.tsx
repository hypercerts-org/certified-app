"use client"

import { useRef, useState, Fragment } from "react"
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Pencil,
  Plus,
  X,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ClampedText from "@/components/ui/clamped-text"
import Input from "@/components/ui/input"
import ShareLinkButton from "@/components/ui/share-link-button"
import Textarea from "@/components/ui/textarea"
import Skeleton from "@/components/ui/skeleton"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Tooltip from "@/components/ui/tooltip"
import { describeLink, type LinkDescription } from "@/components/ui/smart-link"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import BannerUpload from "@/components/profile/banner-upload"
import ProfileTrustLine from "@/components/profile/profile-trust-line"
import ProfileMoreMenu from "@/components/profile/profile-more-menu"
import { FollowEndorseActions } from "@/components/profile/profile-follow-endorse"
import { useRegisterPageHeader } from "@/lib/navbar-context"
import { useProfilePds } from "@/hooks/use-profile-pds"
import { getInitials } from "@/lib/utils/initials"
import { formatMonthYear } from "@/lib/utils/format-date"
import { shortPlaceName } from "@/lib/atproto/location"
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
  /** Whether this is an organization isn't known yet (its marker is
   *  loading): the avatar's shape and the meta line wait for it, so an
   *  organization never first renders as a person. */
  kindPending?: boolean
  /** An `app.certified.actor.profile` with a display name exists. When
   *  false and a Bluesky profile does, the data came from Bluesky and the
   *  header says so (issue #74). */
  hasCertifiedProfile: boolean
  hasBlueskyProfile: boolean
  /** Organization facts for the meta line ("Type · Place · Founded …"). */
  orgTypeTags?: string[]
  orgLocationName?: string | null
  orgFoundedDate?: string | null
  /** The organization's long description. With no bio, it is the lead
   *  under the name (cut short, "Read more" opens it in place). */
  longDescription?: unknown
  /** How many lines of the lead show before "Read more": three on a phone,
   *  four from 800px (the page knows the width before the header mounts). */
  leadLines?: number
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
  /** The other tabs, on phones: no banner, lead, links or trust line, so
   *  the tab's content starts on the first screen. */
  compact?: boolean
}

/**
 * The public profile's header (DESIGN.md §9.12, the public pages): the
 * banner when the account has one; the avatar beside the name (the page's
 * `<h1>`; it registers with the chrome like `<PageHeader>`, so the chrome
 * renders no h1 of its own) and one meta line of facts; the lead (the bio,
 * or else the organization's description, cut to three lines); the website
 * as text and social accounts as icon buttons; the trust line (who
 * endorsed the account, its followers). The viewer's actions sit top
 * right from 1300px (a row under the details from 800px, so they don't
 * squeeze the name): Follow, Endorse, Share, More (Edit profile and
 * Share for the account itself). On phones the same pieces stack: a 64px avatar beside the
 * name, then the lead, the links, a full-width row of actions, and the
 * trust line on one line.
 *
 * The handle and the Permanent ID are facts, in the Overview's Account
 * card (and the More menu copies the Permanent ID).
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
  kindPending = false,
  hasCertifiedProfile,
  hasBlueskyProfile,
  orgTypeTags = [],
  orgLocationName = null,
  orgFoundedDate = null,
  longDescription = null,
  leadLines = 3,
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
  compact = false,
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
  // their pronouns and when they joined. "Joined" is skipped on
  // Bluesky-hosted accounts, whose `createdAt` is the Bluesky signup, not
  // the Certified one.
  const joined =
    !isBskyHosted && profile?.createdAt ? formatMonthYear(profile.createdAt) : null
  const place = shortPlaceName(orgLocationName)
  const metaItems: string[] = isOrg
    ? [
        orgTypeTags.join(", "),
        place ?? "",
        orgFoundedDate ? `Founded ${orgFoundedDate}` : "",
      ].filter(Boolean)
    : [profile?.pronouns ?? "", joined ? `Joined ${joined}` : ""].filter(Boolean)

  // Links: websites read as text, social accounts as labelled icons.
  const links = collectLinks(profile?.website, isOrg ? additionalUrls : [])
  const websites = links.filter((l) => l.service === null)
  const socials = links.filter((l) => l.service !== null)

  const fromBluesky = !hasCertifiedProfile && hasBlueskyProfile && !!handle
  const bio = profile?.description?.trim() || null
  const lead = bio ?? (isOrg ? longDescription : null)
  const hasBannerSlot = editing || showBanner

  return (
    <header
      className={`profile-header${hasBannerSlot ? " profile-header--banner" : ""}${
        editing ? " profile-header--editing" : ""
      }${compact && !editing ? " profile-header--compact" : ""}`}
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

      <div
        className={`profile-header__avatar${
          isOrg && !kindPending ? " profile-header__avatar--square" : ""
        }`}
      >
        {kindPending ? (
          // A neutral block until we know whether it's a person (circle)
          // or an organization (square).
          <Skeleton
            variant="box"
            width="var(--profile-avatar-size)"
            height="var(--profile-avatar-size)"
            aria-hidden
          />
        ) : (
          <Avatar
            size="xl"
            shape={isOrg ? "square" : "circle"}
            src={avatarUrl || undefined}
            fallbackInitials={initials}
            seed={did}
            className="max-md:h-16 max-md:w-16 max-md:text-h4"
          />
        )}
        {editing && onAvatarFile ? (
          <AvatarEditButton onFile={onAvatarFile} hasPending={hasPendingAvatar} />
        ) : null}
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
          <div className="profile-header__title">
            <h1
              className="profile-header__name font-headline text-h2 max-md:text-h3"
              dir="auto"
            >
              {displayName}
            </h1>
            {kindPending ? (
              <Skeleton variant="line" width={200} height={14} aria-hidden />
            ) : metaItems.length > 0 || fromBluesky ? (
              <p className="profile-header__meta">
                {/* Each item stays whole ("Founded Feb 2023"); the line
                    wraps between items. */}
                {metaItems.map((item, i) => (
                  <Fragment key={item}>
                    {i > 0 ? (
                      <span aria-hidden className="profile-header__dot">
                        ·
                      </span>
                    ) : null}
                    <span className="profile-header__meta-item">{item}</span>
                  </Fragment>
                ))}
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
          </div>

          {lead ? (
            <ClampedText lines={leadLines} className="profile-header__lead">
              {bio ? (
                <p className="profile-header__bio" dir="auto">
                  {bio}
                </p>
              ) : (
                <LeafletDocument
                  value={lead}
                  did={did}
                  className="profile-header__lead-doc"
                />
              )}
            </ClampedText>
          ) : kindPending ? (
            // An organization's description may be the lead: hold its
            // place until we know.
            <div className="profile-header__lead" aria-hidden>
              <Skeleton variant="text" lines={3} width="min(100%, 560px)" height={14} />
            </div>
          ) : null}

          {links.length > 0 ? (
            <ul className="profile-header__links" aria-label="Links">
              {websites.map((l) => (
                <li key={l.href} className="profile-header__website">
                  <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="profile-header__website-link"
                  >
                    {l.display}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                </li>
              ))}
              {socials.map((l) => (
                <li key={l.href}>
                  <Button
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${l.display} on ${l.service}`}
                    className="profile-header__social"
                  >
                    <l.Icon width={16} height={16} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <ProfileTrustLine did={did} basePath={basePath} isOwner={canEdit} />
        </div>
      )}

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
              <ShareLinkButton
                path={profileUrl(handle || did)}
                what="Profile link"
                title={displayName}
              />
            </>
          ) : (
            <>
              <FollowEndorseActions did={did} />
              <ShareLinkButton
                path={profileUrl(handle || did)}
                what="Profile link"
                title={displayName}
              />
              <ProfileMoreMenu
                did={did}
                name={displayName}
                handle={handle}
                onBluesky={hasBlueskyProfile}
                settingsHref={settingsHref}
              />
            </>
          )}
        </div>
      )}
    </header>
  )
}

/**
 * The account's links, once each: the profile's website first, then the
 * organization's other links. Anything that isn't an http(s) URL is left
 * out.
 */
function collectLinks(website: string | undefined, extra: string[]): LinkDescription[] {
  const out: LinkDescription[] = []
  const seen = new Set<string>()
  for (const raw of [website, ...extra]) {
    if (typeof raw !== "string" || raw.trim().length === 0) continue
    const link = describeLink(raw)
    if (!link) continue
    const key = link.href.replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "").toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(link)
  }
  return out
}

/** Header placeholder while the profile resolves, shaped like the real one. */
export function ProfileHeaderSkeleton() {
  return (
    <div className="profile-header profile-header--skeleton" aria-hidden>
      <div className="profile-header__avatar">
        <Skeleton
          variant="box"
          width="var(--profile-avatar-size)"
          height="var(--profile-avatar-size)"
        />
      </div>
      <div className="profile-header__identity">
        <div className="profile-header__title">
          <Skeleton variant="line" width="min(100%, 320px)" height={28} />
          <Skeleton variant="line" width={200} height={14} />
        </div>
        <div className="profile-header__lead">
          <Skeleton variant="text" lines={3} width="min(100%, 560px)" height={14} />
        </div>
        <div className="profile-header__links">
          <Skeleton variant="line" width={180} height={16} />
        </div>
      </div>
      <div className="profile-header__actions">
        <Skeleton variant="box" width={88} height={32} />
        <Skeleton variant="box" width={80} height={32} />
      </div>
    </div>
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
        label="Bio (optional)"
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
        label="Website (optional)"
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
            label="Founded (optional)"
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
