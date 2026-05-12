"use client"

import { useEffect, useMemo, useRef } from "react"
import { useTheme } from "next-themes"
import L from "leaflet"
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvent,
} from "react-leaflet"
import { getTileConfig } from "@/lib/map/tiles"

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

export interface MapProps {
  pins: MapPin[]
  center?: { lat: number; lng: number }
  zoom?: number
  height?: number | string
  className?: string
  /** Pan / zoom / drag enabled. Defaults to true. */
  interactive?: boolean
  /** If provided, the map listens for clicks and surfaces the latlng. */
  onMapClick?: (latlng: { lat: number; lng: number }) => void
}

/**
 * Reusable interactive map component. Renders pins on Leaflet tiles,
 * with theme-reactive tile layer (Stadia Alidade Smooth / Alidade
 * Smooth Dark) and optional click-to-place interaction for pickers.
 *
 * This file is client-only — always import via `./map-dynamic` so
 * Next.js doesn't try to render it on the server. Leaflet touches
 * `window` on import.
 */
export default function Map({
  pins,
  center,
  zoom = 13,
  height = 220,
  className = "",
  interactive = true,
  onMapClick,
}: MapProps) {
  // Derive the camera center from pins if none supplied.
  const resolvedCenter = useMemo<[number, number]>(() => {
    if (center) return [center.lat, center.lng]
    if (pins.length === 1) return [pins[0].lat, pins[0].lng]
    if (pins.length > 1) {
      const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length
      const avgLng = pins.reduce((s, p) => s + p.lng, 0) / pins.length
      return [avgLat, avgLng]
    }
    return [0, 0]
  }, [center, pins])

  return (
    <div
      className={`certs-map ${className}`}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      <MapContainer
        center={resolvedCenter}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        zoomControl={interactive}
        keyboard={interactive}
        style={{ width: "100%", height: "100%" }}
      >
        <ThemeReactiveTiles />
        <FitBoundsOnPins pins={pins} />
        {onMapClick ? <ClickHandler onClick={onMapClick} /> : null}
        {pins.map((p, i) => (
          <Marker key={`${p.lat}-${p.lng}-${i}`} position={[p.lat, p.lng]}>
            {p.label ? <Popup>{p.label}</Popup> : null}
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

/**
 * Tile layer that swaps its URL when the theme changes. Uses
 * `useTheme()` from next-themes, which returns `resolvedTheme` —
 * the actual applied mode after resolving "system".
 */
function ThemeReactiveTiles() {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  const config = getTileConfig(theme)

  // `key` forces React Leaflet to recreate the layer when the URL
  // changes. Simpler than imperatively calling tileLayer.setUrl().
  return (
    <TileLayer
      key={config.url}
      url={config.url}
      attribution={config.attribution}
      detectRetina
    />
  )
}

/** Fit the map viewport to contain all pins when pins change. */
function FitBoundsOnPins({ pins }: { pins: MapPin[] }) {
  const map = useMap()
  const firstRunRef = useRef(true)

  useEffect(() => {
    if (pins.length === 0) return
    if (pins.length === 1) {
      // Single pin: center on it without changing zoom (the default
      // zoom from MapContainer already looks good for a single point).
      if (firstRunRef.current) {
        map.setView([pins[0].lat, pins[0].lng], map.getZoom())
        firstRunRef.current = false
      }
      return
    }

    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
  }, [pins, map])

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
