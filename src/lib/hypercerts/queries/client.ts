// Shared XRPC client, caching helpers, and internal utilities for Hypercerts
// read queries. Nothing outside `src/lib/hypercerts/queries/` talks to the API.
import "server-only";

import { Client, type l } from "@atproto/lex";
import type { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getBlobText } from "@/lib/blobs";
import { getPlaceLabel } from "@/lib/geocode";
import { getHandle, getPdsUrl } from "@/lib/identity";
import {
  type ActorCard,
  didOf,
  locationBlobCid,
  type Place,
  type ProjectCard,
  toPlace,
} from "../views";

// Response validation is off for reads. Indexed records come from many authors,
// and some older ones do not match their lexicon (for example a description
// missing its $type). With validation on, one such record fails the whole
// response. Responses are still typed from the lexicons; the view mappers in
// ../views stay defensive only where the data is known to diverge. Writes
// should keep strict validation.
export type BadgeAwardView = app.certified.badge.getBadgeAward.BadgeAwardView;
export type ActivityView = org.hypercerts.claim.getActivity.ActivityView;
export type Did = l.DidString;
export type AtUri = l.AtUriString;

export const api = new Client(process.env.HYPERCERTS_API_URL ?? "https://api.hypercerts.dev", {
  validateResponse: false,
  // Nor reject a whole response over one record's malformed blob reference
  // (a banner whose $link is "[object Object]" failed every page holding it).
  strictResponseProcessing: false,
});

export const read = () => ({ signal: AbortSignal.timeout(8_000) });

export const LIST_TYPES = ["list:endorsements", "list:certs", "list:projects", "list:accounts"];
export const PEOPLE_PAGE = 100;
export type CollectionViewLike = Record<string, unknown>;

export const projectHrefOf = (project: ProjectCard) =>
  `/${project.authorDid}/project/${project.rkey}`;
export const activityHrefOf = (uri: string) => `/${didOf(uri)}/activity/${uri.split("/").pop()}`;
export const collectionOf = (uri: string) => uri.split("/")[3] ?? "";

/**
 * Whether a failed read means the record doesn't exist. Any other failure is
 * thrown, so an outage reaches an error boundary instead of being cached as a
 * 404. The API currently reports a missing record as an HTTP 500 script_error
 * naming RecordNotFound in its message (TECH-858); the check covers both forms.
 */
export function notFound(failure: { error: string; message: string }): boolean {
  return (
    failure.error === "RecordNotFound" ||
    failure.message.includes("RecordNotFound:") ||
    // A handle that resolves to no account (same TECH-858 error shape).
    failure.message.includes("HandleResolutionFailed:")
  );
}

// Public, indexed data: shared by every visitor, refreshed within about a minute.
// Next.js uses the same profile for the prerendered page and its ISR upgrade.
export function publicData(tag: string) {
  cacheLife("public");
  cacheTag(tag);
}

/** Splits `items` into slices of at most `size` for batched XRPC calls. */
export function chunks<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The cards with their verified handles (each cached for hours), so profile
 * links go straight to the handle's address instead of through a redirect
 * from the DID. The API's views don't carry handles yet (TECH-896).
 */
export async function withHandles<T extends ActorCard>(cards: T[]): Promise<T[]> {
  const dids = [...new Set(cards.map((card) => card.did))];
  const handles = new Map(
    await Promise.all(dids.map(async (did) => [did, await getHandle(did)] as const)),
  );
  return cards.map((card) => ({ ...card, handle: handles.get(card.did) ?? null }));
}

/** The same for the cards inside other views (an activity's author, an award's issuer). */
export async function withHandlesIn<T, K extends keyof T>(items: T[], key: K): Promise<T[]> {
  const cards = await withHandles(items.map((item) => item[key] as ActorCard));
  return items.map((item, i) => ({ ...item, [key]: cards[i] }));
}

/**
 * A location record of account `did` as a place. Some records keep their
 * coordinates in a blob on the account's server. The short name comes from
 * the point ("Corvallis, United States"), as the record's own name is free
 * text; without one, its last two parts.
 */
export async function placeOf(
  record: Parameters<typeof toPlace>[0],
  did: string,
): Promise<Place | null> {
  const cid = locationBlobCid(record);
  const place = toPlace(record, cid ? await getBlobText(did, cid) : null);
  const label = place?.point ? await getPlaceLabel(place.point) : null;
  return place && label ? { ...place, short: label } : place;
}

/** The address files are served from on an account's server, or null if it can't be found. */
async function blobBase(did: string): Promise<string | null> {
  try {
    const url = new URL("/xrpc/com.atproto.sync.getBlob", await getPdsUrl(did));
    return url.protocol === "https:" ? url.href : null;
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

/** Each DID's blob address, looked up once per account. */
export async function blobBases(dids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(dids)];
  return new Map(await Promise.all(unique.map(async (did) => [did, await blobBase(did)] as const)));
}
