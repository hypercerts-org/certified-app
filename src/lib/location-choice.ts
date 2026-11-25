// A location chosen for a record (components/location-picker), as a form
// holds it and a publish action receives it: one of the account's published
// places, or a new point with a name. Checked again on the server, as it
// comes from the browser; written as an app.certified.location record in the
// Location Protocol's "coordinate-decimal" format ("lat, lng" in WGS 84,
// EPSG:4326), which pages read back (views.ts, toPlace).

import { isAtUri } from "@/lib/validate";

export type Point = { lat: number; lng: number };

export type LocationChoice =
  | { kind: "saved"; uri: string; name: string; point: Point | null }
  | { kind: "new"; name: string; point: Point };

/** The lexicon's limit on a location's name. */
export const LOCATION_NAME_MAX = 100;

const inRange = (point: Point) =>
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng) &&
  Math.abs(point.lat) <= 90 &&
  Math.abs(point.lng) <= 180;

/**
 * What is wrong with `choice` for a record of account `repo`, or undefined:
 * a published place must be the account's own; a new one needs a name and a
 * point on the globe.
 */
export function locationProblem(choice: unknown, repo: string): string | undefined {
  const c = choice as LocationChoice | null;
  if (c === null) return undefined;
  if (c?.kind === "saved") {
    return typeof c.uri === "string" &&
      isAtUri(c.uri) &&
      c.uri.startsWith(`at://${repo}/app.certified.location/`)
      ? undefined
      : "Choose one of this account's locations.";
  }
  if (c?.kind === "new") {
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (!name) return "Give the location a name.";
    if (name.length > LOCATION_NAME_MAX) {
      return `Keep the name to ${LOCATION_NAME_MAX} characters.`;
    }
    return c.point && inRange(c.point) ? undefined : "Put the pin on the map.";
  }
  return "Choose a location again.";
}

/** A new place's data, as the record holds it. */
export function newLocationRecord(choice: Extract<LocationChoice, { kind: "new" }>) {
  return {
    lpVersion: "1.0",
    // WGS 84 with latitude first, as "lat, lng" is written (and as the
    // network's coordinate-decimal records declare it).
    srs: "http://www.opengis.net/def/crs/EPSG/0/4326",
    locationType: "coordinate-decimal",
    location: { string: `${choice.point.lat}, ${choice.point.lng}` },
    name: choice.name.trim(),
  };
}
