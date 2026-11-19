import "server-only";

import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { logError } from "@/lib/log";

// A place's short name, "Corvallis, United States", from its coordinates:
// reverse geocoding with Nominatim, OpenStreetMap's geocoder (the same data
// as the map tiles). A record's own name is free text in any format, often a
// street address; parsing addresses worldwide is a hard problem, while a
// point resolves the same way everywhere.
//
// Nominatim's usage policy: an application that identifies itself, at most
// one request per second, and results cached. Each point is asked once and
// cached for good (a town doesn't move), and requests from this server
// instance are spaced a second apart.

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "certified.app (+https://certified.app)";
const TIMEOUT_MS = 4_000;

/** The parts of Nominatim's `address` this reads. */
export type NominatimAddress = Partial<
  Record<
    | "city"
    | "town"
    | "village"
    | "municipality"
    | "hamlet"
    | "suburb"
    | "county"
    | "state"
    | "country",
    string
  >
>;

/**
 * "Locality, Country": the most local named place there is (a city, town or
 * village; in the countryside the county or region), then the country. Null
 * without a country.
 */
export function placeLabel(address: NominatimAddress): string | null {
  const { country } = address;
  if (!country) return null;
  const local =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.hamlet ??
    address.suburb ??
    address.county ??
    address.state;
  return local ? `${local}, ${country}` : country;
}

// Requests from this instance, a second apart (the policy's limit).
let queue: Promise<void> = Promise.resolve();
function nextSlot(): Promise<void> {
  const slot = queue;
  queue = slot.then(() => new Promise((resolve) => setTimeout(resolve, 1_000)));
  return slot;
}

async function reverse(lat: number, lng: number): Promise<string | null> {
  "use cache";
  cacheLife("max");
  await nextSlot();
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    zoom: "10", // city level
    addressdetails: "1",
    "accept-language": "en",
  }).toString();
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  const body = (await response.json()) as { address?: NominatimAddress };
  return body.address ? placeLabel(body.address) : null;
}

/**
 * A point's "Locality, Country", or null when it has none or Nominatim can't
 * answer now (a failure isn't cached, so it's asked again next time).
 */
export async function getPlaceLabel(point: { lat: number; lng: number }): Promise<string | null> {
  try {
    // Rounded to about 100 m: one cache entry (and one request) per spot.
    const round = (value: number) => Math.round(value * 1_000) / 1_000;
    return await reverse(round(point.lat), round(point.lng));
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (prerendering) pass through
    logError("[geocode] reverse lookup failed", err, point);
    return null;
  }
}
