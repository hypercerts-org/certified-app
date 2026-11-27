// Location record reads (`app.certified.location`).
import "server-only";

import { app } from "@hypercerts-org/api";
import { getBlobText } from "@/lib/blobs";
import { tags } from "../cache";
import { didOf, locationBlobCid, type Place, toPlace } from "../views";
import { type AtUri, api, type Did, notFound, placeOf, publicData, read } from "./client";

/** A location record (app.certified.location) as a place, with a short name from its point. */
export async function getPlace(uri: string): Promise<Place | null> {
  "use cache";
  publicData(tags.context(uri));

  const result = await api.xrpcSafe(app.certified.location.getLocation, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (!result.success) {
    if (notFound(result)) return null;
    throw result;
  }
  return placeOf(result.body.location.record, didOf(uri));
}

/** A location an account published, to pick again: its record, its name, its point. */
export type SavedPlace = { uri: string; name: string; point: { lat: number; lng: number } | null };

/**
 * The places account `did` published (app.certified.location), by name, each
 * name and point once: many accounts wrote the same place more than once.
 */
export async function listSavedPlaces(did: string): Promise<SavedPlace[]> {
  "use cache";
  publicData(tags.locations(did));

  const { locations } = await api.call(
    app.certified.location.listLocations,
    { authors: [did as Did], limit: 100 },
    read(),
  );
  const places = await Promise.all(
    locations.map(async (view): Promise<SavedPlace | null> => {
      const cid = locationBlobCid(view.record);
      const place = toPlace(view.record, cid ? await getBlobText(did, cid) : null);
      return place ? { uri: view.uri, name: place.name, point: place.point } : null;
    }),
  );
  const seen = new Set<string>();
  return places
    .filter((place): place is SavedPlace => {
      if (!place) return false;
      const key = `${place.name.toLowerCase()}|${place.point?.lat ?? ""}|${place.point?.lng ?? ""}`;
      return !seen.has(key) && Boolean(seen.add(key));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
