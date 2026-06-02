"use client"

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Popup,
  useMap,
  useMapEvent,
} from "react-leaflet"
import { getOverlayTileConfig, getTileConfig } from "@/lib/map/tiles"

import "leaflet/dist/leaflet.css"

// Leaflet's default marker icons reference PNGs via relative paths that
// Next.js/webpack hashes can't resolve. Override the default icon URLs
// at module load time so every <Marker /> just works. We point at the
// unpkg copies of the canonical assets (they have long cache headers
// and match whatever leaflet version we're on).
//
// Leaflet's `L.Icon.Default.prototype._getIconUrl` isn't typed on the
// public interface; cast through `unknown` to a minimal shape instead
// of `any` so TS + eslint stay happy.
const iconDefaultProto = L.Icon.Default.prototype as unknown as {
  _getIconUrl?: unknown
}
delete iconDefaultProto._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

export interface MapPin {
  lat: number
  lng: number
  label?: string
}

/** Polygon overlay — rings are GeoJSON-style (outer first, holes
 *  after). Each ring is a list of `[lat, lng]` pairs ready for Leaflet. */
export interface MapPolygon {
  rings: { lat: number; lng: number }[][]
  label?: string
}

export interface MapProps {
  pins: MapPin[]
  /** Polygon overlays drawn on top of the tiles. The map auto-fits
   *  bounds to include both pins and polygon vertices when more than
   *  one shape is present. */
  polygons?: MapPolygon[]
  center?: { lat: number; lng: number }
  zoom?: number
  height?: number | string
  className?: string
  /** Pan / zoom / drag enabled. Defaults to true. */
  interactive?: boolean
  /** Override scroll-wheel zoom independently of `interactive`. The
   *  default mirrors `interactive`. Pass `false` to keep the +/- /
   *  pinch / double-click zoom controls active while letting page
   *  scroll pass through (good for embedded display surfaces). */
  scrollWheelZoom?: boolean
  /** If provided, the map listens for clicks and surfaces the latlng. */
  onMapClick?: (latlng: { lat: number; lng: number }) => void
}

/**
 * Reusable interactive map component. Renders pins on Leaflet
 * tiles (Esri World Imagery + Boundaries reference overlay) and
 * optional click-to-place interaction for pickers.
 *
 * This file is client-only — always import via `./map-dynamic` so
 * Next.js doesn't try to render it on the server. Leaflet touches
 * `window` on import.
 */
export default function Map({
  pins,
  polygons = [],
  center,
  zoom = 13,
  height = 220,
  className = "",
  interactive = true,
  scrollWheelZoom,
  onMapClick,
}: MapProps) {
  const allowScrollWheelZoom =
    scrollWheelZoom !== undefined ? scrollWheelZoom : interactive
  // Derive the camera center. Prefer an explicit `center` prop; else
  // average pin positions; else fall back to the centroid of all
  // polygon vertices so a polygon-only map still opens on the shape.
  const resolvedCenter = useMemo<[number, number]>(() => {
    if (center) return [center.lat, center.lng]
    if (pins.length === 1) return [pins[0].lat, pins[0].lng]
    if (pins.length > 1) {
      const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length
      const avgLng = pins.reduce((s, p) => s + p.lng, 0) / pins.length
      return [avgLat, avgLng]
    }
    const allPolygonPoints = polygons.flatMap((p) => p.rings.flat())
    if (allPolygonPoints.length > 0) {
      const avgLat =
        allPolygonPoints.reduce((s, p) => s + p.lat, 0) /
        allPolygonPoints.length
      const avgLng =
        allPolygonPoints.reduce((s, p) => s + p.lng, 0) /
        allPolygonPoints.length
      return [avgLat, avgLng]
    }
    return [0, 0]
  }, [center, pins, polygons])

  return (
    <div
      className={`certs-map ${className}`}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      <MapContainer
        center={resolvedCenter}
        zoom={zoom}
        scrollWheelZoom={allowScrollWheelZoom}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        zoomControl={interactive}
        keyboard={interactive}
        style={{ width: "100%", height: "100%" }}
      >
        <BaseTiles />
        <FitBoundsOnShapes pins={pins} polygons={polygons} />
        {onMapClick ? <ClickHandler onClick={onMapClick} /> : null}
        {pins.map((p, i) => (
          <Marker key={`${p.lat}-${p.lng}-${i}`} position={[p.lat, p.lng]}>
            {p.label ? <Popup>{p.label}</Popup> : null}
          </Marker>
        ))}
        {polygons.map((poly, i) => {
          // react-leaflet's Polygon accepts a flat ring (LatLng[]) or
          // a list of rings (LatLng[][]). We always pass rings — the
          // first ring is the outer boundary, subsequent rings are
          // holes. Leaflet's `pathOptions` styles the stroke / fill.
          const positions: [number, number][][] = poly.rings.map((ring) =>
            ring.map((p) => [p.lat, p.lng] as [number, number]),
          )
          return (
            <Polygon
              key={`poly-${i}`}
              positions={positions}
              // Documented exception to the "tokens only" rule (CLAUDE.md
              // rule 2): Leaflet styles SVG paths from JS and cannot read
              // CSS custom properties, so these literals can't be tokens.
              // They mirror --color-accent (#5e5e5e) in tokens.css — keep
              // the two in sync by hand if the accent changes.
              pathOptions={{
                color: "#5e5e5e",
                weight: 1.5,
                fillColor: "#5e5e5e",
                fillOpacity: 0.15,
              }}
            >
              {poly.label ? <Popup>{poly.label}</Popup> : null}
            </Polygon>
          )
        })}
      </MapContainer>
    </div>
  )
}

/**
 * Base tile layers. Esri World Imagery is a satellite raster that
 * looks identical in light and dark mode, so the tiles don't react
 * to the theme.
 *
 * Two layers stacked: the Imagery raster underneath, the
 * Boundaries-and-Places reference overlay (transparent PNG tiles)
 * on top so political borders + place names render legibly against
 * the satellite background. Leaflet z-orders by mount order: the
 * second `<TileLayer>` paints over the first.
 */
function BaseTiles() {
  const config = getTileConfig(undefined)
  const overlay = getOverlayTileConfig()

  return (
    <>
      <TileLayer
        url={config.url}
        attribution={config.attribution}
        detectRetina
      />
      <TileLayer
        url={overlay.url}
        attribution={overlay.attribution}
        detectRetina
        // Reference overlay z-order — sits above the basemap but
        // below any pins / polygons drawn by the renderer below.
        zIndex={2}
      />
    </>
  )
}

/** Fit the map viewport to contain all pins AND polygon vertices
 *  when shapes change. Single-pin / single-polygon-vertex
 *  shortcuts the bounds fit so we don't over-zoom on a single point. */
function FitBoundsOnShapes({
  pins,
  polygons,
}: {
  pins: MapPin[]
  polygons: MapPolygon[]
}) {
  const map = useMap()
  const firstRunRef = useRef(true)
  // Stringify so the effect re-runs only when the shapes actually
  // change (parents often pass fresh-but-equal arrays each render).
  const pinsKey = pins.map((p) => `${p.lat},${p.lng}`).join("|")
  const polyKey = polygons
    .map((p) => p.rings.flat().map((v) => `${v.lat},${v.lng}`).join("|"))
    .join("||")

  useEffect(() => {
    const allPoints: [number, number][] = []
    for (const p of pins) allPoints.push([p.lat, p.lng])
    for (const poly of polygons) {
      for (const ring of poly.rings) {
        for (const v of ring) allPoints.push([v.lat, v.lng])
      }
    }
    if (allPoints.length === 0) return
    if (allPoints.length === 1) {
      if (firstRunRef.current) {
        map.setView(allPoints[0], map.getZoom())
        firstRunRef.current = false
      }
      return
    }
    const bounds = L.latLngBounds(allPoints)
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey, polyKey, map])

  return null
}

/** Subscribe to map clicks and surface lat/lng to the parent. */
function ClickHandler({
  onClick,
}: {
  onClick: (latlng: { lat: number; lng: number }) => void
}) {
  useMapEvent("click", (e) => {
    onClick({ lat: e.latlng.lat, lng: e.latlng.lng })
  })
  return null
}
