"use client"

import { useEffect, useMemo, useState } from "react"
import { MapPin } from "lucide-react"
import Map, {
  type MapPin as MapPinT,
  type MapPolygon as MapPolygonT,
} from "@/components/map/map-dynamic"
import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import {
  parseLocationShape,
  locationFallbackText,
  type LocationRecord,
} from "@/lib/atproto/location"
import type { StrongRef } from "@/lib/atproto/activity-types"

interface CertLocationsMapProps {
  locations: StrongRef[]
}

interface ResolvedLocation {
  uri: string
  record: LocationRecord | null
  pin: MapPinT | null
  polygon: MapPolygonT | null
  /** Plain-text fallback for non-coordinate locations (address / H3 etc.). */
  fallback: string | null
}

/**
 * Resolve every `app.certified.location` strong-ref attached to a cert
 * and render the geocoded ones as pins on a single shared Leaflet map.
 * Any locations the lexicon supports but we can't pin (address /
 * h3 / geohash / opaque GeoJSON polygons) are listed in a small
 * "Other locations" footer beneath the map so they don't disappear
 * silently.
 *
 * We reuse the existing Leaflet-based map at `@/components/map/map`
 * (already pulled in by the activity-creation flow + LocationCard) so
 * this doesn't add a new dependency.
 */
export default function CertLocationsMap({ locations }: CertLocationsMapProps) {
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
          fallback: null,
        }
        const parsed = parseAtUri(loc.uri)
        if (!parsed) return empty
        const params = new URLSearchParams({
          repo: parsed.did,
          collection: parsed.collection,
          rkey: parsed.rkey,
        })
        try {
          const res = await authFetch(
            `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
            { signal },
          )
          if (!res.ok) return empty
          const data = (await res.json()) as { value?: LocationRecord }
          const record = data.value ?? null
          if (!record) return empty
          const shape = parseLocationShape(record.locationType, record.location)
          const name =
            record.name?.trim() || (shape ? "Location" : "Unnamed location")
          let pin: MapPinT | null = null
          let polygon: MapPolygonT | null = null
          if (shape?.kind === "point") {
            pin = { lat: shape.point.lat, lng: shape.point.lng, label: name }
          } else if (shape?.kind === "polygon") {
            polygon = { rings: shape.rings, label: name }
          }
          const fallback =
            shape === null
              ? locationFallbackText(record.locationType, record.location)
              : null
          return { uri: loc.uri, record, pin, polygon, fallback }
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

  const unmappable = resolved.filter(
    (r) => !r.pin && !r.polygon && r.record,
  )
  const hasShapes = pins.length > 0 || polygons.length > 0

  if (locations.length === 0) return null

  if (isLoading && resolved.length === 0) {
    return (
      <div
        className="cert-detail__map cert-detail__map--skeleton"
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="cert-detail__map-wrap">
      {hasShapes ? (
        <div className="cert-detail__map">
          <Map
            pins={pins}
            polygons={polygons}
            zoom={pins.length + polygons.length === 1 ? 8 : 4}
            height={320}
          />
        </div>
      ) : (
        <div className="cert-detail__map cert-detail__map--empty">
          <MapPin size={20} strokeWidth={1.5} aria-hidden />
          <p>No mappable coordinates</p>
        </div>
      )}

      {unmappable.length > 0 ? (
        <ul className="cert-detail__map-other">
          {unmappable.map((r) => {
            const name =
              r.record?.name?.trim() || r.fallback || "Unnamed location"
            return (
              <li key={r.uri} className="cert-detail__map-other-item">
                <MapPin size={14} strokeWidth={1.75} aria-hidden />
                <span className="cert-detail__map-other-name">{name}</span>
                {r.fallback && r.record?.name ? (
                  <span className="cert-detail__map-other-detail">
                    {r.fallback}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
