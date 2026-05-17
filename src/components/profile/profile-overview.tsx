"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Award, MapPin, X } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import BannerUpload from "@/components/profile/banner-upload"
import Map from "@/components/map/map-dynamic"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import LongDescriptionModal from "@/components/leaflet/long-description-modal"
import type { LinearDocument } from "@/lib/leaflet/types"
import { ORG_TYPE_PRESETS } from "@/lib/groups/org-types"
import { getInitials } from "@/lib/utils/initials"
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
import type { ProfileDrafts } from "@/components/profile/profile-inline-edit-types"

interface ProfileOverviewProps {
  bannerUrl: string | null
  did: string
  profile: CertifiedProfile | null
  basePath: string
  /** True when the page is in inline-edit mode. Only sent by the page
   *  when the viewer can edit their own profile — the overview itself
   *  doesn't gate on viewer identity. */
  isEditing?: boolean
  drafts?: ProfileDrafts
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
  onBannerFile?: (file: File) => Promise<void>
  onBannerRemove?: () => void
  hasPendingBanner?: boolean
  /** True when this profile carries the org marker. Gates the org-only
   *  long-description block (read + edit). */
  isOrg?: boolean
  /** Long-form description value from the org marker. May be a string,
   *  an inline leaflet `linearDocument`, or a strong-ref — the renderer
   *  handles all three. `null` when empty so the section is skipped. */
  orgLongDescription?: unknown
  /** All org-type tags from the marker (presets + free-text "Other"),
   *  in canonical display order. Empty array hides the tag row. */
  orgTypeTags?: string[]
  /** Free-text location label. Renders below the map (or alone, in the
   *  sidebar style, when no coords are set). `null` when empty. */
  orgLocationName?: string | null
  /** Map coords from the org marker, when the editor placed a pin. The
   *  overview renders a side-pane map only when this is non-null. */
  orgLocationCoords?: { lat: number; lng: number } | null
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
  isEditing = false,
  drafts,
  onDraftChange,
  onBannerFile,
  onBannerRemove,
  hasPendingBanner = false,
  isOrg = false,
  orgLongDescription = null,
  orgTypeTags = [],
  orgLocationName = null,
  orgLocationCoords = null,
}: ProfileOverviewProps) {
  const [bannerFailed, setBannerFailed] = useState(false)
  useEffect(() => setBannerFailed(false), [bannerUrl])
  const showBanner = !!bannerUrl && !bannerFailed
  // Modal toggle for the long-form org description. The "more" link
  // after the About paragraph opens this; backdrop / Esc / close
  // button all flip it back off.
  const [longDescOpen, setLongDescOpen] = useState(false)
  const orgLongHasContent = isOrg && !!orgLongDescription
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
      {isEditing ? (
        <div className="profile-overview__banner profile-overview__banner--editing profile-overview__banner-edit-slot">
          <BannerUpload
            currentBannerUrl={bannerUrl}
            onUpload={handleBannerUpload}
            onRemove={onBannerRemove}
            isUploading={bannerUploading}
          />
          {hasPendingBanner ? (
            <p
              className="profile-overview__website-label"
              style={{ marginTop: 6 }}
            >
              New banner staged — will save on Save.
            </p>
          ) : null}
        </div>
      ) : showBanner ? (
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

      {/* About + side map.
          Read mode: the right column renders ONLY when the org marker
          carries coords. In edit mode (orgs only) we always render the
          right column so admins can place a pin without having to first
          fill anything in the left column. */}
      {(() => {
        const showRightColumn =
          (isEditing && isOrg) || (!isEditing && !!orgLocationCoords)
        const aboutCls = showRightColumn
          ? "profile-overview__about-block profile-overview__about-block--with-map"
          : "profile-overview__about-block"

        const aboutSection =
          isEditing ? (
            <section
              className="profile-overview__about profile-overview__about--editing"
              aria-labelledby="profile-overview-about-heading"
            >
              <h2
                id="profile-overview-about-heading"
                className="profile-overview__section-title"
              >
                About
              </h2>
              <AutoGrowTextarea
                className="profile-overview__about-textarea"
                value={drafts?.description ?? ""}
                maxLength={256}
                placeholder="A short description of you and your work."
                aria-label="About"
                onChange={(value) => onDraftChange?.("description", value)}
              />
            </section>
          ) : profile?.description ? (
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
              <p className="profile-overview__about-body">
                {profile.description}
                {orgLongHasContent ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="profile-overview__more-link"
                      onClick={() => setLongDescOpen(true)}
                    >
                      more
                    </button>
                  </>
                ) : null}
              </p>
            </section>
          ) : orgLongHasContent ? (
            /* No short description but a long one exists — promote the
               long description to the About slot. We still expose the
               full render via the modal so the reader gets the same
               typographic treatment when expanded. */
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
              <LeafletDocument
                value={orgLongDescription}
                className="profile-overview__about-body"
              />
            </section>
          ) : null

        const mapColumn = showRightColumn ? (
          isEditing ? (
            <LocationPickerColumn
              name={drafts?.locationName ?? ""}
              lat={drafts?.locationLat ?? null}
              lng={drafts?.locationLng ?? null}
              onDraftChange={onDraftChange}
            />
          ) : orgLocationCoords ? (
            <LocationReadColumn
              name={orgLocationName}
              coords={orgLocationCoords}
            />
          ) : null
        ) : null

        // Nothing to render at all (no About, no right column) — skip
        // the wrapper entirely so we don't leave a blank grid row.
        if (!aboutSection && !mapColumn) return null

        return (
          <div className={aboutCls}>
            <div className="profile-overview__about-main">{aboutSection}</div>
            {mapColumn}
          </div>
        )
      })()}

      {/* Org-only organization-type chips. Renders below the About section
          (in read mode) or as a multi-select editor (edit mode). Hidden
          for non-orgs and for empty arrays in read mode. */}
      {isEditing && isOrg ? (
        <OrgTypePickerSection
          selected={drafts?.organizationTypes ?? []}
          other={drafts?.organizationTypeOther ?? ""}
          onDraftChange={onDraftChange}
        />
      ) : isOrg && orgTypeTags.length > 0 ? (
        <section
          className="profile-overview__types"
          aria-label="Organization type"
        >
          <ul className="profile-overview__type-tags">
            {orgTypeTags.map((tag) => (
              <li key={tag} className="profile-overview__type-tag">
                {tag}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Long-description editor. Read-only viewers see this as a
          "more" link appended to the About paragraph above (or the
          long description gets promoted into the About slot when no
          short description exists) — there's no inline expanded
          read render here. */}
      {isEditing && isOrg ? (
        <section
          className="profile-overview__about profile-overview__about--editing"
          aria-labelledby="profile-overview-long-desc-heading"
        >
          <h2
            id="profile-overview-long-desc-heading"
            className="profile-overview__section-title"
          >
            Description (optional)
          </h2>
          <LeafletEditor
            value={drafts?.longDescription ?? null}
            onChange={(next: LinearDocument) =>
              onDraftChange?.("longDescription", next)
            }
            placeholder="A longer, multi-line description of this organization."
            ariaLabel="Long description"
          />
        </section>
      ) : null}

      <section className="profile-overview__stats" aria-label="Profile stats">
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

      {longDescOpen && orgLongHasContent ? (
        <LongDescriptionModal
          title={profile?.displayName ? `About ${profile.displayName}` : "About"}
          value={orgLongDescription}
          onClose={() => setLongDescOpen(false)}
        />
      ) : null}
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

// ---------- Org type picker (edit mode) -----------------------------

interface OrgTypePickerSectionProps {
  selected: string[]
  other: string
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
}

/**
 * Inline editor for `organizationType`. Renders the canonical presets
 * as toggleable chips and an "Other" chip that, when active, reveals a
 * free-text input. Save-side merges the active presets with the trimmed
 * "Other" value into the persisted `string[]`.
 */
function OrgTypePickerSection({
  selected,
  other,
  onDraftChange,
}: OrgTypePickerSectionProps) {
  const otherActive = other.length > 0
  const toggle = (preset: string) => {
    const next = selected.includes(preset)
      ? selected.filter((p) => p !== preset)
      : [...selected, preset]
    onDraftChange?.("organizationTypes", next)
  }
  const toggleOther = () => {
    // Clearing "Other" zeroes the text input; activating it gives the
    // user a focusable empty input (filled below the chip strip).
    onDraftChange?.("organizationTypeOther", otherActive ? "" : " ")
  }
  return (
    <section
      className="profile-overview__types profile-overview__types--editing"
      aria-labelledby="profile-overview-type-heading"
    >
      <h2
        id="profile-overview-type-heading"
        className="profile-overview__section-title"
      >
        Organization type
      </h2>
      <ul className="profile-overview__type-chip-list" role="group">
        {ORG_TYPE_PRESETS.map((preset) => {
          const active = selected.includes(preset)
          return (
            <li key={preset}>
              <button
                type="button"
                className={
                  "profile-overview__type-chip" +
                  (active ? " profile-overview__type-chip--active" : "")
                }
                aria-pressed={active}
                onClick={() => toggle(preset)}
              >
                {preset}
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            className={
              "profile-overview__type-chip" +
              (otherActive ? " profile-overview__type-chip--active" : "")
            }
            aria-pressed={otherActive}
            onClick={toggleOther}
          >
            Other
          </button>
        </li>
      </ul>
      {otherActive ? (
        <input
          type="text"
          className="profile-overview__type-other-input"
          value={other.trimStart()}
          maxLength={128}
          placeholder="Custom organization type"
          aria-label="Custom organization type"
          onChange={(e) =>
            onDraftChange?.("organizationTypeOther", e.target.value)
          }
        />
      ) : null}
    </section>
  )
}

// ---------- Location read column ------------------------------------

interface LocationReadColumnProps {
  name: string | null
  coords: { lat: number; lng: number }
}

function LocationReadColumn({ name, coords }: LocationReadColumnProps) {
  return (
    <aside className="profile-overview__location" aria-label="Location">
      <div className="profile-overview__location-map">
        <Map
          pins={[{ lat: coords.lat, lng: coords.lng, label: name ?? undefined }]}
          center={coords}
          zoom={6}
          height={220}
          interactive={false}
        />
      </div>
      {name ? (
        <p className="profile-overview__location-name">
          <MapPin size={14} strokeWidth={1.75} aria-hidden />
          <span>{name}</span>
        </p>
      ) : null}
    </aside>
  )
}

// ---------- Location picker (edit mode) -----------------------------

interface LocationPickerColumnProps {
  name: string
  lat: number | null
  lng: number | null
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
}

function LocationPickerColumn({
  name,
  lat,
  lng,
  onDraftChange,
}: LocationPickerColumnProps) {
  const hasPin = lat !== null && lng !== null
  const pins = hasPin ? [{ lat: lat as number, lng: lng as number }] : []
  const center = hasPin
    ? { lat: lat as number, lng: lng as number }
    : { lat: 20, lng: 0 }
  const zoom = hasPin ? 6 : 1
  return (
    <aside
      className="profile-overview__location profile-overview__location--editing"
      aria-labelledby="profile-overview-location-heading"
    >
      <h2
        id="profile-overview-location-heading"
        className="profile-overview__section-title"
      >
        Location
      </h2>
      <input
        type="text"
        className="profile-overview__location-input"
        value={name}
        maxLength={128}
        placeholder="Location name (e.g. Berlin, Germany)"
        aria-label="Location name"
        onChange={(e) => onDraftChange?.("locationName", e.target.value)}
      />
      <div className="profile-overview__location-map">
        <Map
          pins={pins}
          center={center}
          zoom={zoom}
          height={220}
          onMapClick={(latlng) => {
            onDraftChange?.("locationLat", latlng.lat)
            onDraftChange?.("locationLng", latlng.lng)
          }}
        />
      </div>
      <div className="profile-overview__location-picker-row">
        <p className="profile-overview__location-hint">
          {hasPin
            ? "Click anywhere on the map to move the pin."
            : "Click on the map to place a pin."}
        </p>
        {hasPin ? (
          <button
            type="button"
            className="profile-overview__location-clear"
            onClick={() => {
              onDraftChange?.("locationLat", null)
              onDraftChange?.("locationLng", null)
            }}
          >
            <X size={13} strokeWidth={1.75} aria-hidden />
            Clear pin
          </button>
        ) : null}
      </div>
    </aside>
  )
}

interface AutoGrowTextareaProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  maxLength?: number
  ["aria-label"]?: string
}

/**
 * Textarea that grows its height to fit content as the user types.
 * Avoids the situation where a long About entry only shows the first
 * couple of lines because the textarea has a fixed visible height.
 */
function AutoGrowTextarea({
  value,
  onChange,
  className,
  placeholder,
  maxLength,
  "aria-label": ariaLabel,
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  const resize = (el: HTMLTextAreaElement) => {
    // Reset to a small height first so shrinking on delete works,
    // then grow to the content's natural scrollHeight.
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (ref.current) resize(ref.current)
  }, [value])

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        onChange(e.target.value)
        resize(e.currentTarget)
      }}
    />
  )
}
