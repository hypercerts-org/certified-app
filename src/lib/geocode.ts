import "server-only";

import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { logError } from "@/lib/log";

// Places with Nominatim, OpenStreetMap's geocoder (the same data as the map
// tiles): a point's short name, "Corvallis, United States", for a profile or
// project; and, for the location picker, places by name (searchPlaces) and a
// pin's name (nameOfPoint).
//
// The short name comes from the coordinates rather than the record's name: A record's own name is free text in any format, often a
// street address; parsing addresses worldwide is a hard problem, while a
// point resolves the same way everywhere.
//
// Nominatim's usage policy: an application that identifies itself, at most
// one request per second, and results cached. Each point is asked once and
// cached for good (a town doesn't move), each search for days, and requests
// from this server instance are spaced a second apart. The picker searches
// only once typing pauses, from three characters, as v1's did.

const NOMINATIM = "https://nominatim.openstreetmap.org";
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
  "use cache: remote";
  cacheLife("max");
  await nextSlot();
  const url = new URL(`${NOMINATIM}/reverse`);
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

/** A place found by name: what Nominatim calls it, and its point. */
export type PlaceHit = { name: string; lat: number; lng: number };

/** Nominatim's answer to fetch `url`, as JSON; throws when it can't answer. */
async function ask<T>(url: URL): Promise<T> {
  await nextSlot();
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  return (await response.json()) as T;
}

async function search(query: string): Promise<PlaceHit[]> {
  "use cache: remote";
  cacheLife("days");
  const url = new URL(`${NOMINATIM}/search`);
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "6",
    "accept-language": "en",
  }).toString();
  const hits = await ask<{ display_name?: string; lat?: string; lon?: string }[]>(url);
  return hits.flatMap((hit) => {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return hit.display_name && Number.isFinite(lat) && Number.isFinite(lng)
      ? [{ name: hit.display_name, lat, lng }]
      : [];
  });
}

/** Places whose name matches `query`, best first; none when Nominatim can't answer now. */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (q.length < 3) return [];
  try {
    return await search(q);
  } catch (err) {
    unstable_rethrow(err);
    logError("[geocode] search failed", err, { query: q });
    return [];
  }
}

async function nameAt(lat: number, lng: number): Promise<string | null> {
  "use cache: remote";
  cacheLife("max");
  const url = new URL(`${NOMINATIM}/reverse`);
  url.search = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    zoom: "14", // a neighbourhood or village: specific, not a street address
    "accept-language": "en",
  }).toString();
  const body = await ask<{ display_name?: string }>(url);
  return body.display_name ?? null;
}

/** What is at a dropped pin, for its name ("Kitale, Trans-Nzoia, Kenya"); null when unknown. */
export async function nameOfPoint(point: { lat: number; lng: number }): Promise<string | null> {
  try {
    const round = (value: number) => Math.round(value * 10_000) / 10_000;
    return await nameAt(round(point.lat), round(point.lng));
  } catch (err) {
    unstable_rethrow(err);
    logError("[geocode] naming a point failed", err, point);
    return null;
  }
}
