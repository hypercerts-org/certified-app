"use client"

import { MapPin } from "lucide-react"
import Map from "@/components/map/map-dynamic"
import { useLocation } from "@/hooks/use-location"
import {
  parseLocationCoords,
  formatCoords,
  osmUrl,
  locationFallbackText,
} from "@/lib/atproto/location"

interface LocationCardProps {
  uri: string
}

/**
 * Render a single location referenced from an activity claim.
 *
 * Fetches the `app.certified.location` record, then:
 *   - If the location has parseable lat/lng (coordinate-decimal,
 *     geojson-point, wkt), show the formatted coordinates + a "View
 *     on map" link to openstreetmap.org.
 *   - Else display `name` + `description` + any fallback text we can
 *     pull out of the polymorphic location union (address / H3 cell /
 *     geohash / truncated GeoJSON).
 *   - If the record fails to load, render the raw at:// URI so the
 *     user at least has a pointer.
 */
export default function LocationCard({ uri }: LocationCardProps) {
  const { location, isLoading } = useLocation(uri)

  if (isLoading) {
    return (
      <li className="location-card location-card--skeleton" aria-hidden="true">
        <div className="location-card__icon-skel" />
        <div className="location-card__body">
          <div className="location-card__name-skel" />
          <div className="location-card__detail-skel" />
        </div>
      </li>
    )
  }

  if (!location) {
    return (
      <li className="location-card location-card--fallback">
        <span className="location-card__icon" aria-hidden="true">
          <MapPin size={16} />
        </span>
        <div className="location-card__body">
          <p className="location-card__name">Unknown location</p>
          <p className="location-card__uri">{uri}</p>
        </div>
      </li>
    )
  }

  const coords = parseLocationCoords(location.locationType, location.location)
  const fallback = coords
    ? null
    : locationFallbackText(location.locationType, location.location)
  const name = location.name?.trim() || (coords ? "Location" : "Unnamed location")

  return (
    <li className="location-card">
      <span className="location-card__icon" aria-hidden="true">
        <MapPin size={16} />
      </span>
      <div className="location-card__body">
        <p className="location-card__name">{name}</p>

        {location.description ? (
          <p className="location-card__desc">{location.description}</p>
        ) : null}

        {coords ? (
          <>
            <div className="location-card__map">
              <Map
                pins={[{ lat: coords.lat, lng: coords.lng, label: name }]}
                zoom={13}
                height={200}
              />
            </div>
            <p className="location-card__detail">
              <span className="location-card__coords">{formatCoords(coords)}</span>
              <a
                href={osmUrl(coords)}
                target="_blank"
                rel="noopener noreferrer"
                className="location-card__map-link"
              >
                View on OpenStreetMap ↗
              </a>
            </p>
          </>
        ) : fallback ? (
          <p className="location-card__detail">
            {location.locationType ? (
              <span className="location-card__type">
                {location.locationType}
              </span>
            ) : null}
            <span className="location-card__fallback">{fallback}</span>
          </p>
        ) : null}
      </div>
    </li>
  )
}
