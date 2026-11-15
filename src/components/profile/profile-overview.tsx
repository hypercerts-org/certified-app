"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, MapPin, X } from "lucide-react"
import Button from "@/components/ui/button"
import ClampedText from "@/components/ui/clamped-text"
import EmptyState from "@/components/ui/empty-state"
import ErrorMessage from "@/components/ui/error-message"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import { FactCard, FactList, type Fact } from "@/components/ui/fact-card"
import Map from "@/components/map/map-dynamic"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import ActivityCard from "@/components/feed/activity-card"
import ExploreProjectCard from "@/components/explore-page/explore-project-card"
import {
  reverseGeocode,
  suggestForwardGeocode,
  type ForwardGeocodeResult,
} from "@/lib/locations/geocode"
import { splitLocationName, type LocationShape } from "@/lib/atproto/location"
import { ORG_TYPE_PRESETS } from "@/lib/groups/org-types"
import { formatGraphCount } from "@/lib/utils/format-graph-count"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import type { ProfileDrafts } from "@/components/profile/profile-inline-edit-types"
import { EndorsementPreviewRow } from "@/components/profile/endorsement-preview-row"
import {
  isKnownEmpty,
  type ProfileSummary,
} from "@/components/profile/use-profile-summary"

/** The account's place, as the Overview shows it. */
export interface OverviewLocation {
  name: string | null
  /** Point or region, when the location record has one. */
  shape: LocationShape | null
  /** The location record is still being read. */
  resolving?: boolean
}

interface ProfileOverviewProps {
  did: string
  /** The account's handle (a fact in the Account card). */
  handle: string | null
  /** Path of the profile page, without the query. */
  basePath: string
  /** What the page loaded about the account (activities, projects,
   *  endorsements), shared with the tab strip. */
  summary: ProfileSummary
  /** The viewer's current identity is this account: empty sections stay,
   *  with the action that fills them. A visitor sees only what there is. */
  viewerIsOwner?: boolean
  /** Inline-edit mode (only sent when the viewer can edit). */
  isEditing?: boolean
  drafts?: ProfileDrafts
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
  /** The profile carries the organization marker. */
  isOrg?: boolean
  /** Whether it is an organization isn't known yet. */
  kindPending?: boolean
  /** The long description, shown here as "About" only when the header's
   *  lead is the bio (otherwise the header already holds it). */
  about?: unknown
  /** Org-type labels in display order. */
  orgTypeTags?: string[]
  orgFoundedDate?: string | null
  location?: OverviewLocation | null
  /** "Jun 2026", or null when not known (or a Bluesky signup date). */
  joined?: string | null
}

const PREVIEW = 3

/**
 * The profile's Overview tab. A reading column with the account's work —
 * About (when the header's lead is the bio), the latest activities as image
 * cards, projects, and the endorsements it received with their notes —
 * and, from 1100px, a 320px rail beside it: a small map of the account's
 * place, then the Account facts (type, place, founded, joined, handle,
 * Permanent ID). On phones the rail follows the content.
 *
 * A visitor sees only sections with something in them; the account itself
 * sees every section, with the action that fills an empty one. A section
 * that failed to load says so, with "Try again".
 */
export default function ProfileOverview({
  did,
  handle,
  basePath,
  summary,
  viewerIsOwner = false,
  isEditing = false,
  drafts,
  onDraftChange,
  isOrg = false,
  kindPending = false,
  about = null,
  orgTypeTags = [],
  orgFoundedDate = null,
  location = null,
  joined = null,
}: ProfileOverviewProps) {
  const { activities, recentActivities, projects, received, counts } = summary

  const previewActivities = recentActivities.slice(0, PREVIEW)
  const previewProjects = [...projects.projects]
    .sort((a, b) => (String(a.value.createdAt ?? "") < String(b.value.createdAt ?? "") ? 1 : -1))
    .slice(0, PREVIEW)
  const previewEndorsements = [...received.endorsements]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, PREVIEW)

  const activitiesEmpty = isKnownEmpty(counts.activities)
  const projectsEmpty = isKnownEmpty(counts.projects)
  const endorsementsEmpty =
    isKnownEmpty(counts.endorsements) && counts.endorsementsGiven === 0
  const showActivities = viewerIsOwner || !activitiesEmpty
  const showProjects = viewerIsOwner || !projectsEmpty
  const showEndorsements = viewerIsOwner || !endorsementsEmpty
  const nothingToShow =
    !viewerIsOwner && !about && activitiesEmpty && projectsEmpty && endorsementsEmpty
  // Everything failed at once (the indexer is down): one block, not three.
  const allFailed =
    !!activities.error &&
    recentActivities.length === 0 &&
    !!projects.error &&
    !!received.error &&
    received.endorsements.length === 0
  const retryAll = () => {
    void activities.refetch()
    projects.retry()
    received.refetch()
  }

  return (
    <div className="profile-overview">
      <div className="profile-overview__main">
        {isEditing && isOrg ? (
          <div className="profile-overview__section">
            <OrgTypePickerSection
              selected={drafts?.organizationTypes ?? []}
              other={drafts?.organizationTypeOther ?? ""}
              onDraftChange={onDraftChange}
            />
            <p className="profile-overview__hint">
              Write the long description in the About tab.
            </p>
          </div>
        ) : null}

        {about && !isEditing ? (
          <section className="profile-overview__section" aria-labelledby="profile-overview-about">
            <SectionHeader id="profile-overview-about" title="About" />
            <ClampedText lines={8} className="profile-overview__about">
              <LeafletDocument value={about} did={did} />
            </ClampedText>
          </section>
        ) : null}

        {allFailed ? (
          <ErrorMessage
            title="Couldn't load this account's records"
            message="Something went wrong on our side. Try again in a moment."
            onRetry={retryAll}
          />
        ) : null}

        {showActivities && !allFailed ? (
          <section
            className="profile-overview__section"
            aria-labelledby="profile-overview-activities"
          >
            <SectionHeader
              id="profile-overview-activities"
              title="Activities"
              action={
                recentActivities.length > PREVIEW || activities.hasMore ? (
                  <SeeAllLink href={`${basePath}?tab=activities`} label="All activities" />
                ) : null
              }
            />
            {activities.error && recentActivities.length === 0 ? (
              <ErrorMessage
                title="Couldn't load activities"
                message="Something went wrong on our side. Try again in a moment."
                onRetry={() => void activities.refetch()}
              />
            ) : counts.activities.isLoading ? (
              <CardsSkeleton />
            ) : previewActivities.length === 0 ? (
              <div className="profile-overview__empty">
                <EmptyState
                  variant="inline"
                  title="No activities yet. Activities you publish or contribute to show here."
                />
                <Button href="/create" variant="secondary" size="sm">
                  New activity
                </Button>
              </div>
            ) : (
              <ul className="profile-overview__cards">
                {previewActivities.map((a) => {
                  // Contributions live in another account's repo.
                  const author = activities.dids.get(a.uri) ?? did
                  return (
                    <li key={a.uri}>
                      <ActivityCard
                        record={a}
                        did={author}
                        showAuthor={author !== did}
                        titleAs="h3"
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : null}

        {showProjects && !allFailed ? (
          <section
            className="profile-overview__section"
            aria-labelledby="profile-overview-projects"
          >
            <SectionHeader
              id="profile-overview-projects"
              title="Projects"
              action={
                projects.projects.length > PREVIEW ? (
                  <SeeAllLink href={`${basePath}?tab=projects`} label="All projects" />
                ) : null
              }
            />
            {projects.error ? (
              <ErrorMessage
                title="Couldn't load projects"
                message="Something went wrong on our side. Try again in a moment."
                onRetry={projects.retry}
              />
            ) : counts.projects.isLoading ? (
              <CardsSkeleton wide />
            ) : previewProjects.length === 0 ? (
              <div className="profile-overview__empty">
                <EmptyState
                  variant="inline"
                  title="No projects yet. A project groups related activities."
                />
                <Button href="/project/new" variant="secondary" size="sm">
                  New project
                </Button>
              </div>
            ) : (
              <ul className="profile-overview__cards profile-overview__cards--projects">
                {previewProjects.map((p) => (
                  <li key={p.uri}>
                    <ExploreProjectCard project={p} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {showEndorsements && !allFailed ? (
          <section
            className="profile-overview__section"
            aria-labelledby="profile-overview-endorsements"
          >
            {/* "All endorsements" whenever there is one: the tab holds more
                than this preview (the endorsements given, too). */}
            <SectionHeader
              id="profile-overview-endorsements"
              title="Endorsements"
              action={
                received.endorsements.length > 0 ? (
                  <SeeAllLink href={`${basePath}?tab=endorsements`} label="All endorsements" />
                ) : null
              }
            />
            {received.error && received.endorsements.length === 0 ? (
              <ErrorMessage
                title="Couldn't load endorsements"
                message="Something went wrong on our side. Try again in a moment."
                onRetry={received.refetch}
              />
            ) : counts.endorsements.isLoading ? (
              <EndorsementsSkeleton />
            ) : (
              <>
                {previewEndorsements.length > 0 ? (
                  // The one endorsement row, shared with the Workspace
                  // Overview: the endorser, the date, their note.
                  <ul className="profile-overview__endorse-list">
                    {previewEndorsements.map((e) => (
                      <EndorsementPreviewRow key={e.uri} endorsement={e} />
                    ))}
                  </ul>
                ) : viewerIsOwner ? (
                  <EmptyState
                    variant="inline"
                    title="No endorsements yet. When another account endorses this one, it shows here."
                  />
                ) : null}
                {counts.endorsementsGiven > 0 ? (
                  <SeeAllLink
                    href={`${basePath}?tab=endorsements&sub=given`}
                    label={`Endorses ${formatGraphCount(counts.endorsementsGiven)} ${
                      counts.endorsementsGiven === 1 ? "account" : "accounts"
                    }`}
                    className="self-start"
                  />
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {nothingToShow ? (
          <EmptyState
            variant="inline"
            title="No activities, projects or endorsements yet."
          />
        ) : null}
      </div>

      <aside className="profile-overview__rail" aria-label="Facts about this account">
        {isEditing && isOrg ? (
          <LocationPickerColumn
            name={drafts?.locationName ?? ""}
            lat={drafts?.locationLat ?? null}
            lng={drafts?.locationLng ?? null}
            onDraftChange={onDraftChange}
          />
        ) : kindPending ? (
          <RailSkeleton />
        ) : (
          <AccountFacts
            did={did}
            handle={handle}
            isOrg={isOrg}
            typeTags={orgTypeTags}
            foundedDate={orgFoundedDate}
            location={location}
            joined={joined}
          />
        )}
      </aside>
    </div>
  )
}

/* ------------------------------ Rail ------------------------------ */

function AccountFacts({
  did,
  handle,
  isOrg,
  typeTags,
  foundedDate,
  location,
  joined,
}: {
  did: string
  handle: string | null
  isOrg: boolean
  typeTags: string[]
  foundedDate: string | null
  location: OverviewLocation | null
  joined: string | null
}) {
  // The place without a leading Plus Code ("W8VJ+RPH, Nosara" → "Nosara").
  const rawName = location?.name?.trim() || null
  const placeName = rawName ? splitLocationName(rawName).name || rawName : null
  const shape = location?.shape ?? null
  const realHandle = handle && !handle.startsWith("did:") ? handle : null

  const facts: Fact[] = []
  if (isOrg && typeTags.length > 0) {
    facts.push({ label: typeTags.length === 1 ? "Type" : "Types", value: typeTags.join(", ") })
  }
  // With a map, the place is named under it instead.
  if (placeName && !shape) facts.push({ label: "Location", value: placeName })
  if (isOrg && foundedDate) facts.push({ label: "Founded", value: foundedDate })
  if (joined) facts.push({ label: "Joined", value: joined })
  if (realHandle) {
    facts.push({
      label: "Handle",
      value: <span className="profile-facts__handle">@{realHandle}</span>,
    })
  }
  facts.push({ label: "Permanent ID", value: <PermanentId did={did} /> })

  return (
    <>
      {shape ? (
        <FactCard className="profile-facts__place">
          <PlaceMap shape={shape} name={placeName} />
          {placeName ? (
            <p className="profile-facts__place-name">
              <MapPin size={16} strokeWidth={1.75} aria-hidden />
              <span>{placeName}</span>
            </p>
          ) : null}
        </FactCard>
      ) : location?.resolving ? (
        <Skeleton variant="box" height={208} />
      ) : null}
      <FactCard title="Account" labelledBy="profile-facts-account">
        <FactList facts={facts} />
      </FactCard>
    </>
  )
}

/** A small map of the account's place: its pin, or its region. */
function PlaceMap({ shape, name }: { shape: LocationShape; name: string | null }) {
  const label = name ?? undefined
  return (
    <div className="profile-facts__map">
      {shape.kind === "point" ? (
        <Map
          pins={[{ lat: shape.point.lat, lng: shape.point.lng, label }]}
          center={shape.point}
          zoom={9}
          height={160}
          interactive
          // Scrolling the page past the map must not zoom it; the +/-
          // buttons, pinch and double-click still do.
          scrollWheelZoom={false}
          compactAttribution
        />
      ) : (
        <Map
          pins={[]}
          polygons={[{ rings: shape.rings, label }]}
          zoom={6}
          height={160}
          interactive
          scrollWheelZoom={false}
          compactAttribution
        />
      )}
    </div>
  )
}

/** The account's DID, whole, with a button that copies it. */
function PermanentId({ did }: { did: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <span className="profile-facts__id">
      <span className="profile-facts__id-value">{did}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Permanent ID copied" : "Copy Permanent ID"}
        onClick={() => void copy(did)}
      >
        {copied ? (
          <Check size={16} strokeWidth={1.75} aria-hidden />
        ) : (
          <Copy size={16} strokeWidth={1.75} aria-hidden />
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Permanent ID copied" : ""}
      </span>
    </span>
  )
}

/* ---------------------------- Skeletons ---------------------------- */

/** Loading cards shaped like the cards they stand in for. */
function CardsSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`profile-overview__cards${wide ? " profile-overview__cards--projects" : ""}`}
      aria-hidden
    >
      {Array.from({ length: wide ? 2 : 3 }, (_, i) => (
        <div key={i} className="profile-overview__card-skeleton">
          <div
            className={`profile-overview__card-skeleton-image${
              wide ? " profile-overview__card-skeleton-image--wide" : ""
            }`}
          >
            <Skeleton variant="box" width="100%" height="100%" />
          </div>
          <Skeleton variant="line" width="80%" height={16} />
          <Skeleton variant="line" width="50%" height={12} />
        </div>
      ))}
    </div>
  )
}

function EndorsementsSkeleton() {
  return (
    <div className="profile-overview__endorse-list" aria-hidden>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="profile-overview__endorse-skeleton">
          <Skeleton circle width={32} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton variant="line" width={140} height={14} />
            <Skeleton variant="line" width={80} height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RailSkeleton() {
  return (
    <div className="profile-overview__rail-skeleton" aria-hidden>
      <Skeleton variant="box" height={208} />
      <Skeleton variant="box" height={220} />
    </div>
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
      <SectionHeader id="profile-overview-type-heading" title="Organization type" />
      <ul className="profile-overview__type-chip-list">
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

  // ----- Two-way geocoding bind with autocomplete -----
  // Forward (text → coords): debounce typing, fetch up to 6
  // suggestions from Nominatim, and show them in a dropdown
  // beneath the input. Picking a suggestion sets the name + coords
  // together; just typing without picking only changes the name.
  // Reverse (coords → text): map clicks reverse-geocode and
  // overwrite the name; we mark the change as map-originated so the
  // suggestions effect ignores it.
  const lastSourceRef = useRef<"user" | "map" | null>(null)
  const [busy, setBusy] = useState<"idle" | "forward" | "reverse">("idle")
  const [suggestions, setSuggestions] = useState<ForwardGeocodeResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const blurTimerRef = useRef<number | null>(null)

  // Debounced suggestion fetch on name change. Only fires when the
  // user typed (skips map-originated reverse-geocode results).
  useEffect(() => {
    if (lastSourceRef.current === "map") {
      lastSourceRef.current = null
      // Intentional setState in effect (TECH-814): debounced geocode keyed on the typed name: the map-originated skip branch and the below-2-chars branch clear now-stale suggestions; both bail out when suggestions are already empty
      setSuggestions([])
      return
    }
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      return
    }
    const ctrl = new AbortController()
    setBusy("forward")
    const t = window.setTimeout(async () => {
      const hits = await suggestForwardGeocode(trimmed, 6, ctrl.signal)
      setBusy("idle")
      setSuggestions(hits)
      setHighlightIndex(hits.length > 0 ? 0 : -1)
    }, 350)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
      setBusy("idle")
    }
  }, [name])

  const pickSuggestion = (hit: ForwardGeocodeResult) => {
    lastSourceRef.current = "map" // the next name change came from us
    onDraftChange?.("locationName", hit.displayName)
    onDraftChange?.("locationLat", hit.lat)
    onDraftChange?.("locationLng", hit.lng)
    setDropdownOpen(false)
    setSuggestions([])
    setHighlightIndex(-1)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        setDropdownOpen(true)
        setHighlightIndex(0)
        e.preventDefault()
      }
      return
    }
    if (e.key === "ArrowDown") {
      setHighlightIndex((i) => Math.min(suggestions.length - 1, i + 1))
      e.preventDefault()
    } else if (e.key === "ArrowUp") {
      setHighlightIndex((i) => Math.max(0, i - 1))
      e.preventDefault()
    } else if (e.key === "Enter") {
      const pick = suggestions[highlightIndex] ?? suggestions[0]
      if (pick) {
        e.preventDefault()
        pickSuggestion(pick)
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false)
      e.preventDefault()
    }
  }

  const handleMapClick = async (latlng: { lat: number; lng: number }) => {
    onDraftChange?.("locationLat", latlng.lat)
    onDraftChange?.("locationLng", latlng.lng)
    lastSourceRef.current = "map"
    setBusy("reverse")
    setDropdownOpen(false)
    const hit = await reverseGeocode(latlng.lat, latlng.lng)
    setBusy("idle")
    if (hit?.displayName) {
      onDraftChange?.("locationName", hit.displayName)
    }
  }

  return (
    <aside
      className="profile-overview__location profile-overview__location--editing"
      aria-labelledby="profile-overview-location-heading"
    >
      <SectionHeader id="profile-overview-location-heading" title="Location" />
      <div className="profile-overview__location-combobox">
        <input
          type="text"
          className="profile-overview__location-input"
          value={name}
          maxLength={128}
          placeholder="Type a city or address…"
          aria-label="Location name"
          role="combobox"
          aria-expanded={dropdownOpen && suggestions.length > 0}
          aria-autocomplete="list"
          aria-controls="profile-overview-location-suggestions"
          aria-activedescendant={
            highlightIndex >= 0
              ? `profile-overview-location-suggestion-${highlightIndex}`
              : undefined
          }
          onChange={(e) => {
            lastSourceRef.current = "user"
            setDropdownOpen(true)
            onDraftChange?.("locationName", e.target.value)
          }}
          onFocus={() => {
            if (blurTimerRef.current) {
              window.clearTimeout(blurTimerRef.current)
              blurTimerRef.current = null
            }
            if (suggestions.length > 0) setDropdownOpen(true)
          }}
          onBlur={() => {
            // Defer close so a mousedown on a suggestion can still
            // register before the dropdown unmounts.
            blurTimerRef.current = window.setTimeout(() => {
              setDropdownOpen(false)
            }, 150)
          }}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
        />
        {dropdownOpen && suggestions.length > 0 ? (
          <ul
            id="profile-overview-location-suggestions"
            role="listbox"
            className="profile-overview__location-suggestions"
          >
            {suggestions.map((hit, i) => {
              const isActive = i === highlightIndex
              const [primary, ...rest] = hit.displayName.split(", ")
              const secondary = rest.join(", ")
              return (
                <li
                  key={`${hit.lat}-${hit.lng}-${i}`}
                  id={`profile-overview-location-suggestion-${i}`}
                  role="option"
                  aria-selected={isActive}
                  className={
                    isActive
                      ? "profile-overview__location-suggestion profile-overview__location-suggestion--active"
                      : "profile-overview__location-suggestion"
                  }
                  onMouseEnter={() => setHighlightIndex(i)}
                  // mousedown (not click) fires before the input's
                  // blur; otherwise the dropdown would already be
                  // closed by the time the click event arrived.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickSuggestion(hit)
                  }}
                >
                  <span className="profile-overview__location-suggestion-primary">
                    {primary}
                  </span>
                  {secondary ? (
                    <span className="profile-overview__location-suggestion-secondary">
                      {secondary}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      <div className="profile-overview__location-map">
        <Map
          pins={pins}
          center={center}
          zoom={zoom}
          height={220}
          onMapClick={handleMapClick}
          compactAttribution
        />
      </div>
      <div className="profile-overview__location-picker-row">
        <p className="profile-overview__location-hint">
          {busy === "forward"
            ? "Searching…"
            : busy === "reverse"
              ? "Resolving address…"
              : hasPin
                ? "Click the map to move the pin, or pick a different result above."
                : "Pick a suggestion or click the map to place a pin."}
        </p>
        {hasPin ? (
          <button
            type="button"
            className="profile-overview__location-clear"
            onClick={() => {
              lastSourceRef.current = "user"
              onDraftChange?.("locationLat", null)
              onDraftChange?.("locationLng", null)
            }}
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
            Clear pin
          </button>
        ) : null}
      </div>
      <p className="profile-overview__location-attribution">
        © <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        contributors
      </p>
    </aside>
  )
}

