"use client"

import { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Map from "@/components/map/map-dynamic"
import { authFetch } from "@/lib/auth/fetch"
import {
  parseLocationShape,
  putLocationRecord,
  splitLocationName,
  type LatLng,
  type StrongRef,
} from "@/lib/atproto/location"
import {
  reverseGeocode,
  suggestForwardGeocode,
  type ForwardGeocodeResult,
} from "@/lib/locations/geocode"

/**
 * Shared location picker dialog. Used by /create (cert form, where
 * the caller manages an array of locations) and /project/new
 * (project form, where the caller stores a single picked location).
 * The dialog itself is mode-agnostic — it returns ONE picked
 * location each time via `onPick`; how the host page collects them
 * is the host's concern.
 *
 * Modes inside the dialog (independent of caller usage):
 *   - "My locations" tab — lists the user's own previously published
 *     `app.certified.location` records via listRecords on `ownDid`.
 *     Selecting a row + Add returns the existing strongRef.
 *   - "New" tab — Nominatim address search + click-to-pin map.
 *     On Add, writes a fresh location record under `targetDid` via
 *     `putLocationRecord` and returns the new strongRef. If the
 *     picked coordinates already match a My-locations record
 *     within ~11m the dialog short-circuits to the existing
 *     strongRef instead of minting a duplicate.
 */

export interface AddedLocation {
  /** strongRef to the freshly-written or resolved location record. */
  ref: StrongRef
  /** Display name pulled out of the record for the host page's
   *  list. Falls back to the URI if no name was set. */
  name: string
}

interface LocationPickerDialogProps {
  /** The signed-in user's own DID — used as the My-locations source
   *  (we list the *user*'s previously-published locations, not the
   *  active group's). */
  ownDid: string
  /** The repo a new location record will be written to. Equals
   *  `ownDid` for personal certs; the active group's DID when the
   *  user has switched into a group identity. */
  targetDid: string
  onClose: () => void
  onPick: (added: AddedLocation) => void
}

export default function LocationPickerDialog({
  ownDid,
  targetDid,
  onClose,
  onPick,
}: LocationPickerDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">("existing")

  const [name, setName] = useState("")
  const [fieldMode, setFieldMode] = useState<"search" | "edit">("search")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [suggestions, setSuggestions] = useState<ForwardGeocodeResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [busy, setBusy] = useState<"idle" | "forward" | "reverse">("idle")
  const blurTimerRef = useRef<number | null>(null)

  interface MyLocation {
    ref: StrongRef
    name: string
    coords: LatLng | null
  }
  const [myLocations, setMyLocations] = useState<MyLocation[]>([])
  const [myLocationsLoading, setMyLocationsLoading] = useState(true)
  const [myLocationsError, setMyLocationsError] = useState<string | null>(null)
  const [selectedExistingUri, setSelectedExistingUri] = useState<string>("")

  useEffect(() => {
    const controller = new AbortController()
    setMyLocationsLoading(true)
    setMyLocationsError(null)
    const params = new URLSearchParams({
      repo: ownDid,
      collection: "app.certified.location",
      limit: "100",
    })
    authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`listRecords failed: ${res.status}`)
        const body = (await res.json()) as {
          records?: Array<{
            uri: string
            cid: string
            value?: {
              name?: unknown
              locationType?: unknown
              location?: unknown
            }
          }>
        }
        const opts: MyLocation[] = (body.records ?? []).map((rec) => {
          const rawName =
            typeof rec.value?.name === "string" ? rec.value.name.trim() : ""
          const split = rawName ? splitLocationName(rawName) : null
          const display =
            split?.name ||
            rawName ||
            rec.uri.split("/").pop() ||
            "(unnamed location)"
          const lt =
            typeof rec.value?.locationType === "string"
              ? rec.value.locationType
              : undefined
          const shape = parseLocationShape(lt, rec.value?.location)
          const coords = shape?.kind === "point" ? shape.point : null
          return {
            ref: { uri: rec.uri, cid: rec.cid },
            name: display,
            coords,
          }
        })
        opts.sort((a, b) => a.name.localeCompare(b.name))
        setMyLocations(opts)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setMyLocationsError(
          err instanceof Error ? err.message : "Failed to load locations",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setMyLocationsLoading(false)
      })
    return () => controller.abort()
  }, [ownDid])

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reusedExistingName, setReusedExistingName] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (mode !== "new" || fieldMode !== "search") return
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
  }, [name, mode, fieldMode])

  const pickSuggestion = (hit: ForwardGeocodeResult) => {
    setCoords({ lat: hit.lat, lng: hit.lng })
    setName(hit.displayName)
    setFieldMode("edit")
    setDropdownOpen(false)
    setSuggestions([])
    setHighlightIndex(-1)
  }

  const handleMapClick = async (latlng: { lat: number; lng: number }) => {
    setCoords(latlng)
    setBusy("reverse")
    setDropdownOpen(false)
    const hit = await reverseGeocode(latlng.lat, latlng.lng)
    setBusy("idle")
    if (hit?.displayName) setName(hit.displayName)
    setFieldMode("edit")
  }

  const triggerSearchAgain = () => {
    setFieldMode("search")
    setDropdownOpen(true)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (
        fieldMode === "search" &&
        dropdownOpen &&
        suggestions.length > 0
      ) {
        const pick = suggestions[highlightIndex] ?? suggestions[0]
        if (pick) pickSuggestion(pick)
        return
      }
      triggerSearchAgain()
      return
    }
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
    } else if (e.key === "Escape") {
      setDropdownOpen(false)
      e.preventDefault()
    }
  }

  const canSubmitNew = !!coords && !isSaving
  const canSubmitExisting = !!selectedExistingUri && !isSaving

  const handleSubmitNew = async () => {
    if (!coords) return
    const round4 = (n: number) => Math.round(n * 10000) / 10000
    const targetLat = round4(coords.lat)
    const targetLng = round4(coords.lng)
    const existing = myLocations.find((loc) => {
      if (!loc.coords) return false
      return (
        round4(loc.coords.lat) === targetLat &&
        round4(loc.coords.lng) === targetLng
      )
    })
    if (existing) {
      setReusedExistingName(existing.name)
      setIsSaving(true)
      setSaveError(null)
      window.setTimeout(() => onPick(existing), 1400)
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      const ref = await putLocationRecord(
        ownDid,
        targetDid,
        coords,
        name.trim() || null,
      )
      onPick({ ref, name: name.trim() || `${coords.lat}, ${coords.lng}` })
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save location",
      )
      setIsSaving(false)
    }
  }

  const handleSubmitExisting = () => {
    const chosen = myLocations.find(
      (loc) => loc.ref.uri === selectedExistingUri,
    )
    if (!chosen) return
    onPick(chosen)
  }

  const selectedExistingLoc = myLocations.find(
    (l) => l.ref.uri === selectedExistingUri,
  )
  const activeCoords: LatLng | null =
    mode === "new" ? coords : (selectedExistingLoc?.coords ?? null)
  const hasPin = !!activeCoords
  const pins = hasPin ? [activeCoords as LatLng] : []
  const center: LatLng = hasPin
    ? (activeCoords as LatLng)
    : { lat: 20, lng: 0 }
  const zoom = hasPin ? (mode === "existing" ? 13 : 6) : 2

  const mapKey =
    mode === "existing" ? `existing-${selectedExistingUri || "empty"}` : "new"

  const NON_MAP_CHROME = 280
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : 800
  const modalMaxWidth = Math.max(320, Math.min(1100, viewportWidth - 40))
  const mapHeight = Math.max(
    220,
    Math.min(720, viewportHeight - 40 - NON_MAP_CHROME),
  )

  return (
    <AppDialog
      ariaLabel="Add location"
      className="create-cert__loc-dialog"
      maxWidth={modalMaxWidth}
      onClose={onClose}
    >
      <AppDialogHeader title="Add location" onClose={onClose} />
      <div className="create-cert__loc-dialog-body">
        <div
          role="tablist"
          aria-label="Location source"
          className="create-cert__loc-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "existing"}
            className={
              mode === "existing"
                ? "create-cert__loc-tab create-cert__loc-tab--active"
                : "create-cert__loc-tab"
            }
            onClick={() => setMode("existing")}
          >
            My locations
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "new"}
            className={
              mode === "new"
                ? "create-cert__loc-tab create-cert__loc-tab--active"
                : "create-cert__loc-tab"
            }
            onClick={() => setMode("new")}
          >
            New
          </button>
        </div>

        {mode === "new" ? (
          <>
            <p className="create-cert__loc-hint">
              Type a place to search, or click anywhere on the map to
              drop a pin. After picking, you can rename the field to
              something more specific.
            </p>
            <div className="create-cert__loc-combobox">
              <input
                type="text"
                className="cert-detail__meta-input create-cert__field--full"
                value={name}
                maxLength={256}
                placeholder={
                  fieldMode === "edit"
                    ? "Rename to something more specific"
                    : "Search a city or address…"
                }
                aria-label={
                  fieldMode === "edit"
                    ? "Location name"
                    : "Search a location"
                }
                role="combobox"
                aria-expanded={
                  fieldMode === "search" &&
                  dropdownOpen &&
                  suggestions.length > 0
                }
                aria-autocomplete="list"
                aria-controls="create-cert-loc-suggestions"
                aria-activedescendant={
                  highlightIndex >= 0
                    ? `create-cert-loc-suggestion-${highlightIndex}`
                    : undefined
                }
                onChange={(e) => {
                  const next = e.target.value
                  setName(next)
                  if (next.trim().length === 0) {
                    setFieldMode("search")
                  }
                  if (fieldMode === "search") {
                    setDropdownOpen(true)
                  }
                }}
                onFocus={() => {
                  if (blurTimerRef.current) {
                    window.clearTimeout(blurTimerRef.current)
                    blurTimerRef.current = null
                  }
                  if (fieldMode === "search" && suggestions.length > 0) {
                    setDropdownOpen(true)
                  }
                }}
                onBlur={() => {
                  blurTimerRef.current = window.setTimeout(() => {
                    setDropdownOpen(false)
                  }, 150)
                }}
                onKeyDown={onInputKeyDown}
                autoComplete="off"
              />
              {fieldMode === "edit" ? (
                <button
                  type="button"
                  className="create-cert__loc-search-again"
                  aria-label="Search for a different place"
                  title="Search again"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    triggerSearchAgain()
                  }}
                >
                  <Search size={14} strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
              {fieldMode === "search" &&
              dropdownOpen &&
              suggestions.length > 0 ? (
                <ul
                  id="create-cert-loc-suggestions"
                  role="listbox"
                  className="create-cert__loc-suggestions"
                >
                  {suggestions.map((hit, i) => {
                    const isActive = i === highlightIndex
                    const [primary, ...rest] = hit.displayName.split(", ")
                    const secondary = rest.join(", ")
                    return (
                      <li
                        key={`${hit.lat}-${hit.lng}-${i}`}
                        id={`create-cert-loc-suggestion-${i}`}
                        role="option"
                        aria-selected={isActive}
                        className={
                          isActive
                            ? "create-cert__loc-suggestion create-cert__loc-suggestion--active"
                            : "create-cert__loc-suggestion"
                        }
                        onMouseEnter={() => setHighlightIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickSuggestion(hit)
                        }}
                      >
                        <span className="create-cert__loc-suggestion-primary">
                          {primary}
                        </span>
                        {secondary ? (
                          <span className="create-cert__loc-suggestion-secondary">
                            {secondary}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
            <div className="create-cert__loc-map">
              <Map
                key={mapKey}
                pins={pins}
                center={center}
                zoom={zoom}
                height={mapHeight}
                onMapClick={handleMapClick}
              />
            </div>
            <p className="create-cert__loc-hint">
              {busy === "forward"
                ? "Searching…"
                : busy === "reverse"
                  ? "Resolving pin…"
                  : coords
                    ? `Pinned at ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                    : "Search above or click the map to drop a pin"}
            </p>
          </>
        ) : (
          <>
            <label
              htmlFor="create-cert-loc-existing"
              className="create-cert__loc-uri-label"
            >
              Pick one of the locations you&apos;ve already published:
            </label>
            {myLocationsLoading ? (
              <p className="create-cert__loc-hint">Loading…</p>
            ) : myLocationsError ? (
              <p className="cert-detail__error-desc" role="alert">
                {myLocationsError}
              </p>
            ) : myLocations.length === 0 ? (
              <p className="create-cert__loc-hint">
                You haven&apos;t published any locations yet. Add one
                via the New tab and it will appear here on the next cert.
              </p>
            ) : (
              <>
                <select
                  id="create-cert-loc-existing"
                  className="cert-detail__meta-input create-cert__field--full"
                  value={selectedExistingUri}
                  onChange={(e) => setSelectedExistingUri(e.target.value)}
                >
                  <option value="">Select a location…</option>
                  {myLocations.map((loc) => (
                    <option key={loc.ref.uri} value={loc.ref.uri}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <div className="create-cert__loc-map">
                  <Map
                    key={mapKey}
                    pins={pins}
                    center={center}
                    zoom={zoom}
                    height={mapHeight}
                  />
                </div>
                <p className="create-cert__loc-hint">
                  {selectedExistingLoc
                    ? selectedExistingLoc.coords
                      ? `${selectedExistingLoc.name} — ${selectedExistingLoc.coords.lat.toFixed(4)}, ${selectedExistingLoc.coords.lng.toFixed(4)}`
                      : `${selectedExistingLoc.name} — no pinnable coordinates`
                    : "Pick a location above to see it on the map"}
                </p>
              </>
            )}
          </>
        )}

        {reusedExistingName ? (
          <p className="create-cert__loc-reused" role="status">
            Already in My locations — using your existing record:{" "}
            <strong>{reusedExistingName}</strong>.
          </p>
        ) : null}
        {saveError ? (
          <p className="cert-detail__error-desc" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="create-cert__loc-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          {mode === "new" ? (
            <Button
              type="button"
              variant="primary"
              disabled={!canSubmitNew}
              loading={isSaving}
              onClick={handleSubmitNew}
            >
              {isSaving ? "Saving…" : "Add"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={!canSubmitExisting}
              loading={isSaving}
              onClick={handleSubmitExisting}
            >
              {isSaving ? "Resolving…" : "Add"}
            </Button>
          )}
        </div>
        {isSaving ? <LoadingSpinner size="sm" /> : null}
      </div>
    </AppDialog>
  )
}
