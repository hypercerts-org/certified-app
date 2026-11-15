"use client"

import { useEffect, useMemo, useState } from "react"
import { MapPin, Maximize2 } from "lucide-react"
import Map, {
  type MapPin as MapPinT,
  type MapPolygon as MapPolygonT,
} from "@/components/map/map-dynamic"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import Tooltip from "@/components/ui/tooltip"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { loadLocation } from "@/hooks/use-location"
import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import {
  parseLocationShape,
  splitLocationName,
  type LocationRecord,
} from "@/lib/atproto/location"
import { formatCoordinates, locationLabel } from "@/lib/atproto/location-label"
import { getBlobRefLink } from "@/lib/atproto/types"
import type { StrongRef } from "@/lib/atproto/activity-types"

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

interface CertLocationsMapProps {
  locations: StrongRef[]
  /** The map's height in px (the larger-map dialog has its own). */
  height?: number
  /** Show the place names under the map (default). The project's rail
   *  names the place in its own card heading, so it can turn them off. */
  showNames?: boolean
}

interface ResolvedLocation {
  uri: string
  record: LocationRecord | null
  pin: MapPinT | null
  polygon: MapPolygonT | null
  /** What to call it (name, address or rounded coordinates), or null. */
  label: string | null
}

/**
 * Resolve every `app.certified.location` strong-ref attached to a record
 * and render the geocoded ones as pins on one shared Leaflet map, with
 * the places named under it and a button that opens a larger map.
 * Locations without coordinates are only named; a location that can't be
 * named or mapped is left out rather than shown as "Unnamed location".
 *
 * The records come from the shared location cache (`loadLocation`), so
 * the page's byline and this map read each one once.
 */
export default function CertLocationsMap({
  locations,
  height = 240,
  showNames = true,
}: CertLocationsMapProps) {
  const [resolved, setResolved] = useState<ResolvedLocation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const key = locations.map((l) => l.uri).join("|")

  useEffect(() => {
    if (locations.length === 0) {
      setResolved([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const signal = controller.signal
    setIsLoading(true)

    Promise.all(
      locations.map(async (loc): Promise<ResolvedLocation> => {
        const empty: ResolvedLocation = {
          uri: loc.uri,
          record: null,
          pin: null,
          polygon: null,
          label: null,
        }
        const parsed = parseAtUri(loc.uri)
        if (!parsed) return empty
        try {
          const record = await loadLocation(loc.uri)
          if (!record || signal.aborted) return empty
          // First try the sync path: inline-string + URI variants parse
          // without a network call. When that returns null AND the
          // location field is the `smallBlob` variant, fetch the blob's
          // text content and re-parse with the same logic.
          let shape = parseLocationShape(record.locationType, record.location)
          if (shape === null) {
            const blobText = await fetchSmallBlobText(
              parsed.did,
              record.location,
              signal,
            )
            if (blobText) {
              shape = parseLocationShape(record.locationType, blobText)
            }
          }
          // Its name or address, else (coordinates read from a blob) the
          // point, rounded.
          const label =
            locationLabel(record) ??
            (shape?.kind === "point"
              ? formatCoordinates(shape.point.lat, shape.point.lng)
              : null)
          let pin: MapPinT | null = null
          let polygon: MapPolygonT | null = null
          if (shape?.kind === "point") {
            pin = { lat: shape.point.lat, lng: shape.point.lng, label: label ?? undefined }
          } else if (shape?.kind === "polygon") {
            polygon = { rings: shape.rings, label: label ?? undefined }
          }
          return { uri: loc.uri, record, pin, polygon, label }
        } catch {
          return empty
        }
      }),
    )
      .then((out) => {
        if (signal.aborted) return
        setResolved(out)
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const pins = useMemo(
    () => resolved.flatMap((r) => (r.pin ? [r.pin] : [])),
    [resolved],
  )
  const polygons = useMemo(
    () => resolved.flatMap((r) => (r.polygon ? [r.polygon] : [])),
    [resolved],
  )

  const hasShapes = pins.length > 0 || polygons.length > 0
  const named = resolved.filter((r) => r.label)

  const [expanded, setExpanded] = useState(false)

  if (locations.length === 0) return null

  if (isLoading && resolved.length === 0) {
    return (
      <div
        className="cert-detail__map cert-detail__map--skeleton"
        style={{ height }}
        aria-hidden="true"
      />
    )
  }

  // Each place gets a row under the map, its Plus Code (when the name
  // carries one) as a click-to-copy tag.
  const namesList =
    named.length > 0 ? (
      <ul className="cert-detail__map-locations">
        {named.map((r) => {
          const split = splitLocationName(r.record?.name?.trim() ?? "")
          return (
            <li key={r.uri} className="cert-detail__map-locations-item">
              <MapPin size={14} strokeWidth={1.75} aria-hidden />
              <span className="cert-detail__map-locations-name" dir="auto">
                {r.label}
              </span>
              {split.plusCode && split.name ? <PlusCodeTag code={split.plusCode} /> : null}
            </li>
          )
        })}
      </ul>
    ) : null

  if (!hasShapes && !namesList) return null

  return (
    <div className="cert-detail__map-wrap">
      {hasShapes ? (
        <div className="cert-detail__map">
          <Map
            pins={pins}
            polygons={polygons}
            zoom={pins.length + polygons.length === 1 ? 8 : 4}
            height={height}
            scrollWheelZoom={false}
            compactAttribution
          />
          {/* The larger map, top right over the map. The wrapper is the
              positioned box: the button's tooltip wraps it in an inline
              span, which left in the flow drew an empty line under the
              map. */}
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

      {showNames || !hasShapes ? namesList : null}

      {expanded ? (
        <AppDialog
          ariaLabel="Larger map of the locations"
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
                pins={pins}
                polygons={polygons}
                zoom={pins.length + polygons.length === 1 ? 10 : 4}
                height="100%"
                compactAttribution
              />
            </div>
            {named.length > 1 ? namesList : null}
          </div>
        </AppDialog>
      ) : null}
    </div>
  )
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
