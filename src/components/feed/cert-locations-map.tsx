"use client"

import { useEffect, useMemo, useState } from "react"
import { MapPin, Maximize2 } from "lucide-react"
import Map, {
  type MapPin as MapPinT,
  type MapPolygon as MapPolygonT,
} from "@/components/map/map-dynamic"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import { FactCard } from "@/components/ui/fact-card"
import Tooltip from "@/components/ui/tooltip"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { loadLocation } from "@/hooks/use-location"
import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import {
  parseLocationShape,
  splitLocationName,
  type LocationShape,
} from "@/lib/atproto/location"
import { formatCoordinates, locationLabel } from "@/lib/atproto/location-label"
import { getBlobRefLink } from "@/lib/atproto/types"
import type { StrongRef } from "@/lib/atproto/activity-types"

/** The map's height in every Location card (profile, project, activity). */
export const LOCATION_MAP_HEIGHT = 200

/**
 * When a location record's `location` field is the
 * `org.hypercerts.defs#smallBlob` variant, the actual coordinate
 * payload lives inside a binary blob on the same repo (e.g. a 35-byte
 * `text/plain` blob containing `"12.345, 8.901"` for the
 * `coordinate-decimal` locationType). The inline parsers can't see
 * inside the blob, so without this resolution step the map silently
 * falls back to the text label only. Fetch the blob, return its text
 * content, hand it back to `parseLocationShape` to extract the actual
 * point/polygon geometry.
 */
async function fetchSmallBlobText(
  did: string,
  location: unknown,
  signal: AbortSignal,
): Promise<string | null> {
  if (!location || typeof location !== "object") return null
  const obj = location as Record<string, unknown>
  if (obj.$type !== "org.hypercerts.defs#smallBlob") return null
  const blob = obj.blob as { ref?: unknown } | null | undefined
  const ref = blob?.ref
  if (!ref) return null
  const cid = getBlobRefLink(ref)
  if (!cid || cid === "undefined") return null
  const params = new URLSearchParams({ did, cid })
  try {
    const res = await authFetch(
      `/api/xrpc/com/atproto/sync/getBlob?${params.toString()}`,
      { signal },
    )
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** One place on a map: its pin or region, and what to call it. */
export interface MapPlace {
  key: string
  pin: MapPinT | null
  polygon: MapPolygonT | null
  /** Its name, address or rounded coordinates; null when none. */
  label: string | null
  /** A Plus Code the name carried, offered as a copyable tag. */
  plusCode?: string | null
}

/** A place from a shape the page already has (the profile's location). */
export function placeFromShape(
  key: string,
  shape: LocationShape | null,
  label: string | null,
): MapPlace {
  return {
    key,
    pin:
      shape?.kind === "point"
        ? { lat: shape.point.lat, lng: shape.point.lng, label: label ?? undefined }
        : null,
    polygon:
      shape?.kind === "polygon" ? { rings: shape.rings, label: label ?? undefined } : null,
    label,
    plusCode: label ? splitLocationName(label).plusCode : null,
  }
}

/**
 * Resolve every `app.certified.location` strong-ref of a record into
 * places: each record from the shared location cache (`loadLocation`, so
 * the byline and the map read it once), its point or region (read from a
 * blob when the record keeps it there) and its label.
 */
export function useLocationPlaces(locations: readonly StrongRef[]): {
  places: MapPlace[]
  isLoading: boolean
} {
  const key = locations.map((l) => l.uri).join("|")
  const [state, setState] = useState<{ key: string; places: MapPlace[] }>({
    key: "",
    places: [],
  })

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const signal = controller.signal
    Promise.all(
      key.split("|").map(async (uri): Promise<MapPlace> => {
        const empty: MapPlace = { key: uri, pin: null, polygon: null, label: null }
        const parsed = parseAtUri(uri)
        if (!parsed) return empty
        try {
          const record = await loadLocation(uri)
          if (!record || signal.aborted) return empty
          // Inline values parse without a request; a `smallBlob` is read
          // and parsed with the same logic.
          let shape = parseLocationShape(record.locationType, record.location)
          if (shape === null) {
            const blobText = await fetchSmallBlobText(parsed.did, record.location, signal)
            if (blobText) shape = parseLocationShape(record.locationType, blobText)
          }
          // Its name or address, else (coordinates read from a blob) the
          // point, rounded.
          const label =
            locationLabel(record) ??
            (shape?.kind === "point" ? formatCoordinates(shape.point.lat, shape.point.lng) : null)
          const place = placeFromShape(uri, shape, label)
          return { ...place, plusCode: splitLocationName(record.name?.trim() ?? "").plusCode }
        } catch {
          return empty
        }
      }),
    ).then((places) => {
      if (!signal.aborted) setState({ key, places })
    })
    return () => controller.abort()
  }, [key])

  if (!key) return { places: [], isLoading: false }
  return { places: state.key === key ? state.places : [], isLoading: state.key !== key }
}

/** Corners of a region, to tell a small one from a large one. */
function regionSpan(polygons: readonly MapPolygonT[]): number {
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  for (const p of polygons) {
    for (const ring of p.rings) {
      for (const v of ring) {
        minLat = Math.min(minLat, v.lat)
        maxLat = Math.max(maxLat, v.lat)
        minLng = Math.min(minLng, v.lng)
        maxLng = Math.max(maxLng, v.lng)
      }
    }
  }
  return Math.max(maxLat - minLat, maxLng - minLng)
}

/** The middle of a region's outer ring. */
function regionCentre(polygon: MapPolygonT): { lat: number; lng: number } | null {
  const ring = polygon.rings[0] ?? []
  if (ring.length === 0) return null
  return {
    lat: ring.reduce((s, v) => s + v.lat, 0) / ring.length,
    lng: ring.reduce((s, v) => s + v.lng, 0) / ring.length,
  }
}

/**
 * How the map frames its places. Points zoom to the town (one) or fit
 * (several). A region shown on its own is fitted, but not so close that
 * the map shows only its inside: a region named in one word, like a
 * country ("Indonesia"), shows the country around it; any other, the area
 * around it. A small region also gets a pin at its middle, so it can be
 * found at that zoom.
 */
function frame(places: readonly MapPlace[]) {
  const pins = places.flatMap((p) => (p.pin ? [p.pin] : []))
  const polygons = places.flatMap((p) => (p.polygon ? [p.polygon] : []))
  if (pins.length > 0 || polygons.length === 0) {
    return { pins, polygons, zoom: pins.length === 1 ? 9 : 4, fitMaxZoom: 12 }
  }
  const countryLike = places.every((p) => !p.polygon || (!!p.label && /^\p{L}+$/u.test(p.label.trim())))
  const small = regionSpan(polygons) < 0.5
  const centres = small
    ? polygons.flatMap((p) => {
        const c = regionCentre(p)
        return c ? [{ ...c, label: p.label ?? undefined }] : []
      })
    : []
  return {
    pins: centres,
    polygons,
    zoom: countryLike ? 5 : 8,
    fitMaxZoom: countryLike ? 5 : 9,
  }
}

/**
 * The Location card in the rail of every public page (profile, project,
 * activity), one treatment for all three (DESIGN.md §9.14): the map
 * ({@link LOCATION_MAP_HEIGHT}px), a button that opens a larger map in a
 * dialog, and the places named under it. A name that the page's header
 * already says (`headerPlace`) isn't repeated under the map. Renders
 * nothing when no place can be mapped or named.
 */
export function LocationFactCard({
  places,
  isLoading = false,
  headerPlace = null,
}: {
  places: readonly MapPlace[]
  isLoading?: boolean
  /** The place as the page's header or byline names it. */
  headerPlace?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const view = useMemo(() => frame(places), [places])
  const named = places.filter((p) => p.label)
  const hasShapes = view.pins.length > 0 || view.polygons.length > 0

  if (isLoading && places.length === 0) {
    return (
      <FactCard title="Location">
        <div
          className="cert-detail__map cert-detail__map--skeleton"
          style={{ height: LOCATION_MAP_HEIGHT }}
          aria-hidden="true"
        />
      </FactCard>
    )
  }
  if (!hasShapes && named.length === 0) return null

  // The caption names each place, unless it is the one the header names.
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()
  const captioned =
    named.length === 1 && headerPlace && norm(named[0].label!) === norm(headerPlace)
      ? []
      : named
  const namesList = (list: readonly MapPlace[]) =>
    list.length > 0 ? (
      <ul className="cert-detail__map-locations">
        {list.map((p) => (
          <li key={p.key} className="cert-detail__map-locations-item">
            <MapPin size={14} strokeWidth={1.75} aria-hidden />
            <span className="cert-detail__map-locations-name" dir="auto">
              {p.label}
            </span>
            {p.plusCode && splitLocationName(p.label ?? "").name ? (
              <PlusCodeTag code={p.plusCode} />
            ) : null}
          </li>
        ))}
      </ul>
    ) : null

  return (
    <FactCard title="Location">
      {hasShapes ? (
        <div className="cert-detail__map">
          <Map
            pins={view.pins}
            polygons={view.polygons}
            zoom={view.zoom}
            fitMaxZoom={view.fitMaxZoom}
            height={LOCATION_MAP_HEIGHT}
            // Scrolling the page past the map must not zoom it; the +/-
            // buttons, pinch and double-click still do.
            scrollWheelZoom={false}
            compactAttribution
          />
          {/* The wrapper is the positioned box: the button's tooltip
              wraps it in an inline span, which left in the flow drew an
              empty line under the map. */}
          <div className="cert-detail__map-expand">
            <Button
              size="icon"
              variant="secondary"
              className="!bg-[var(--bg-elevated)]"
              onClick={() => setExpanded(true)}
              aria-label="Open larger map"
              tooltip="Larger map"
            >
              <Maximize2 size={14} strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {hasShapes ? namesList(captioned) : namesList(named)}

      {expanded ? (
        <AppDialog
          ariaLabel="Larger map"
          className="cert-detail__map-modal"
          maxWidth={1100}
          onClose={() => setExpanded(false)}
        >
          <AppDialogHeader
            title={named.length === 1 ? (named[0].label ?? "Location") : "Locations"}
            onClose={() => setExpanded(false)}
          />
          <div className="cert-detail__map-modal-body">
            <div className="cert-detail__map cert-detail__map--modal">
              {/* Height comes from `.cert-detail__map--modal`
                  (min(720px, 70vh)), so it tracks resize and rotation
                  while the dialog is open. */}
              <Map
                pins={view.pins}
                polygons={view.polygons}
                zoom={Math.min(view.zoom + 1, 10)}
                fitMaxZoom={Math.min(view.fitMaxZoom + 1, 14)}
                height="100%"
                compactAttribution
              />
            </div>
            {named.length > 1 ? namesList(named) : null}
          </div>
        </AppDialog>
      ) : null}
    </FactCard>
  )
}

/**
 * A record's Location card: resolves its location strong-refs, then
 * draws {@link LocationFactCard}.
 */
export default function RecordLocationCard({
  locations,
  headerPlace = null,
}: {
  locations: readonly StrongRef[]
  headerPlace?: string | null
}) {
  const { places, isLoading } = useLocationPlaces(locations)
  if (locations.length === 0) return null
  return <LocationFactCard places={places} isLoading={isLoading} headerPlace={headerPlace} />
}

/**
 * Inline copy-paste tag for the Open Location Code prefix of a
 * location name. Renders as a small monospace pill next to the
 * human-readable place; clicking copies the code to the clipboard
 * and the label flips to "Copied" for a moment so the action is
 * confirmed.
 */
function PlusCodeTag({ code }: { code: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <>
      <Tooltip label={copied ? "Copied" : "Copy Plus Code"}>
        <button
          type="button"
          className="cert-detail__map-locations-plus"
          onClick={() => copy(code)}
          aria-label={`Copy Plus Code ${code}`}
        >
          {copied ? "Copied" : code}
        </button>
      </Tooltip>
      {/* The static aria-label masks the visible "Copied" flip, so
          announce the confirmation through a live region instead. */}
      <span role="status" className="sr-only">
        {copied ? "Plus Code copied" : ""}
      </span>
    </>
  )
}
