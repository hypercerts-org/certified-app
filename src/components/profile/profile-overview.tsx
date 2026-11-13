"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MapPin, X } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import StatRow from "@/components/ui/stat-row"
import Map from "@/components/map/map-dynamic"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import {
  reverseGeocode,
  suggestForwardGeocode,
  type ForwardGeocodeResult,
} from "@/lib/locations/geocode"
import { ORG_TYPE_PRESETS } from "@/lib/groups/org-types"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import { useUserActivityCount } from "@/hooks/use-user-activity-count"
import { useUserProjects } from "@/hooks/use-user-projects"
import { formatGraphCount } from "@/lib/utils/format-graph-count"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { ProfileDrafts } from "@/components/profile/profile-inline-edit-types"
import { EndorsementPreviewRow } from "@/components/profile/endorsement-preview-row"
import {
  ProfileActivityRow,
  ProfileRowsSkeleton,
} from "@/components/profile/profile-panel"

interface ProfileOverviewProps {
  did: string
  /** Path of the profile page, without the query. */
  basePath: string
  /** The viewer's current identity is this account. Adds "New activity"
   *  to the empty activities state. */
  viewerIsOwner?: boolean
  /** Inline-edit mode (only sent when the viewer can edit). */
  isEditing?: boolean
  drafts?: ProfileDrafts
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
  /** The profile carries the organization marker: adds the About block
   *  (long description, type, location). */
  isOrg?: boolean
  /** Long description from the org marker (string, inline leaflet
   *  document or strong-ref; the renderer handles all three). `null`
   *  when empty. */
  orgLongDescription?: unknown
  /** Org-type tags in display order. */
  orgTypeTags?: string[]
  /** Free-text location label. */
  orgLocationName?: string | null
  /** Map pin from the org marker, when one is set. */
  orgLocationCoords?: { lat: number; lng: number } | null
}

const ACTIVITY_PREVIEW = 3
const ENDORSEMENT_PREVIEW = 3

/**
 * The profile's Overview tab: a quiet row of counts, the organization's
 * About block (organizations only; a person's bio sits in the header),
 * the latest activities as rows and the latest endorsements received as
 * the compact endorsement rows the Workspace Overview uses. From 1100px
 * the activities and endorsements sit side by side.
 */
export default function ProfileOverview({
  did,
  basePath,
  viewerIsOwner = false,
  isEditing = false,
  drafts,
  onDraftChange,
  isOrg = false,
  orgLongDescription = null,
  orgTypeTags = [],
  orgLocationName = null,
  orgLocationCoords = null,
}: ProfileOverviewProps) {
  const received = useReceivedEndorsements(did)
  const given = useGivenEndorsements(did)
  const { projects, isLoading: projectsLoading } = useUserProjects(did)
  // The account's own activities (the indexer's totalCount), the same
  // number the Workspace Overview and Records show and the Activities
  // tab opens on (Created). Activities it only contributed to stay in the
  // list below and under Activities → Contributed. Falls back to the first
  // page's count (with "+") if the count query comes back empty.
  const activityCount = useUserActivityCount(did)
  const {
    created,
    contributed,
    dids: activityDids,
    isLoading: activitiesLoading,
    hasMore: activitiesHasMore,
  } = useUserIndexerActivities(did)

  // Recent activities: merge both buckets (an activity can be in both),
  // newest first.
  const mergedActivities = useMemo(() => {
    const seen = new Set<string>()
    const merged: ActivityRecord[] = []
    for (const r of [...created, ...contributed]) {
      if (seen.has(r.uri)) continue
      seen.add(r.uri)
      merged.push(r)
    }
    merged.sort((a, b) =>
      (a.value.createdAt ?? "") < (b.value.createdAt ?? "") ? 1 : -1,
    )
    return merged
  }, [created, contributed])
  const previewActivities = mergedActivities.slice(0, ACTIVITY_PREVIEW)

  const previewEndorsements = useMemo(
    () =>
      [...received.endorsements]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, ENDORSEMENT_PREVIEW),
    [received.endorsements],
  )

  const activityValue =
    activityCount ??
    `${created.length}${activitiesHasMore ? "+" : ""}`

  return (
    <div className="profile-overview">
      {/* Phones: a tidy 2×2 grid instead of wrapping 3 + 1. */}
      <StatRow
        aria-label="Counts"
        className="max-md:grid max-md:grid-cols-2"
        items={[
          {
            label: activityCount === 1 ? "Activity" : "Activities",
            value:
              typeof activityValue === "number"
                ? formatGraphCount(activityValue)
                : activityValue,
            loading: activityCount === null && activitiesLoading,
            href: `${basePath}?tab=activities`,
          },
          {
            label: projects.length === 1 ? "Project" : "Projects",
            value: projects.length,
            loading: projectsLoading,
            href: `${basePath}?tab=projects`,
          },
          {
            label: "Endorsements received",
            value: received.endorsements.length,
            loading: received.isLoading && received.endorsements.length === 0,
            href: `${basePath}?tab=endorsements`,
          },
          {
            label: "Endorsements given",
            value: given.endorsements.length,
            loading: given.isLoading && given.endorsements.length === 0,
            href: `${basePath}?tab=endorsements&sub=given`,
          },
        ]}
      />

      {isOrg ? (
        <OrgAbout
          did={did}
          basePath={basePath}
          isEditing={isEditing}
          drafts={drafts}
          onDraftChange={onDraftChange}
          longDescription={orgLongDescription}
          typeTags={orgTypeTags}
          locationName={orgLocationName}
          locationCoords={orgLocationCoords}
        />
      ) : null}

      <div className="profile-overview__columns">
        <section
          className="profile-overview__section"
          aria-labelledby="profile-overview-activities"
        >
          <SectionHeader
            id="profile-overview-activities"
            title="Recent activities"
            action={
              mergedActivities.length > ACTIVITY_PREVIEW ? (
                <SeeAllLink
                  href={`${basePath}?tab=activities`}
                  label="All activities"
                />
              ) : null
            }
          />
          {activitiesLoading && previewActivities.length === 0 ? (
            <ProfileRowsSkeleton />
          ) : previewActivities.length === 0 ? (
            <div className="profile-overview__empty">
              <EmptyState
                variant="inline"
                title={
                  viewerIsOwner
                    ? "No activities yet. Activities you publish or contribute to show here."
                    : "No activities yet."
                }
              />
              {viewerIsOwner ? (
                <Button href="/create" variant="secondary" size="sm">
                  New activity
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="profile-rows">
              {previewActivities.map((a) => {
                // Contributions live in another account's repo.
                const author = activityDids.get(a.uri) ?? did
                return (
                  <ProfileActivityRow
                    key={a.uri}
                    activity={a}
                    authorDid={author}
                    showAuthor={author !== did}
                  />
                )
              })}
            </ul>
          )}
        </section>

        <section
          className="profile-overview__section"
          aria-labelledby="profile-overview-endorsements"
        >
          {/* "All endorsements" whenever there is one: the tab holds more
              than this preview (the endorsements given, too), and the
              activities column beside it has its "All activities". */}
          <SectionHeader
            id="profile-overview-endorsements"
            title="Endorsements received"
            action={
              received.endorsements.length > 0 ? (
                <SeeAllLink
                  href={`${basePath}?tab=endorsements`}
                  label="All endorsements"
                />
              ) : null
            }
          />
          {received.isLoading && previewEndorsements.length === 0 ? (
            <ProfileRowsSkeleton shape="circle" />
          ) : previewEndorsements.length === 0 ? (
            <EmptyState
              variant="inline"
              title="No endorsements yet. When another account endorses this one, it shows here."
            />
          ) : (
            // The one endorsement row, shared with the Workspace Overview.
            <ul className="profile-overview__endorse-list">
              {previewEndorsements.map((e) => (
                <EndorsementPreviewRow key={e.uri} endorsement={e} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/* ---------------------------- Org About ------------------------------ */

function OrgAbout({
  did,
  basePath,
  isEditing,
  drafts,
  onDraftChange,
  longDescription,
  typeTags,
  locationName,
  locationCoords,
}: {
  did: string
  basePath: string
  isEditing: boolean
  drafts?: ProfileDrafts
  onDraftChange?: ProfileOverviewProps["onDraftChange"]
  longDescription: unknown
  typeTags: string[]
  locationName: string | null
  locationCoords: { lat: number; lng: number } | null
}) {
  if (isEditing) {
    return (
      <div className="profile-overview__about profile-overview__about--with-map">
        <div className="profile-overview__about-main">
          <OrgTypePickerSection
            selected={drafts?.organizationTypes ?? []}
            other={drafts?.organizationTypeOther ?? ""}
            onDraftChange={onDraftChange}
          />
          <p className="profile-overview__hint">
            Write the long description in the About tab.
          </p>
        </div>
        <LocationPickerColumn
          name={drafts?.locationName ?? ""}
          lat={drafts?.locationLat ?? null}
          lng={drafts?.locationLng ?? null}
          onDraftChange={onDraftChange}
        />
      </div>
    )
  }

  // The type and place already read in the header's meta line; here the
  // organization gets its own words and, when it set a pin, the map.
  if (!longDescription && !locationCoords) return null

  return (
    <section
      className={`profile-overview__about${
        locationCoords ? " profile-overview__about--with-map" : ""
      }`}
      aria-labelledby="profile-overview-about"
    >
      <div className="profile-overview__about-main">
        <SectionHeader id="profile-overview-about" title="About" />
        {longDescription ? (
          <AboutExcerpt
            did={did}
            value={longDescription}
            href={`${basePath}?tab=about`}
          />
        ) : typeTags.length > 0 ? (
          <p className="profile-overview__hint">{typeTags.join(", ")}</p>
        ) : null}
      </div>
      {locationCoords ? (
        <LocationReadColumn name={locationName} coords={locationCoords} />
      ) : null}
    </section>
  )
}

/**
 * The first lines of the long description. When it runs longer than the
 * excerpt, the last line fades out and "Read more" opens the About tab.
 */
function AboutExcerpt({
  did,
  value,
  href,
}: {
  did: string
  value: unknown
  href: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [clamped, setClamped] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    // Fires once on observe, then on every resize (fonts, images, width).
    const ro = new ResizeObserver(() => {
      setClamped(el.scrollHeight > el.clientHeight + 1)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [value])
  return (
    <>
      <div
        ref={ref}
        className={`profile-overview__about-excerpt${
          clamped ? " profile-overview__about-excerpt--clamped" : ""
        }`}
      >
        <LeafletDocument value={value} did={did} />
      </div>
      {clamped ? (
        <SeeAllLink href={href} label="Read more" className="self-start" />
      ) : null}
    </>
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
          interactive
          // Disable wheel-zoom so scrolling the page doesn't get
          // hijacked when the cursor passes over the map. +/- and
          // pinch / double-click zoom are still available.
          scrollWheelZoom={false}
          compactAttribution
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

