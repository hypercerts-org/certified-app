// Plain, serializable view models for the UI.
//
// The API returns hydrated records whose blob references and union types are
// awkward to pass across the server/client boundary. Pages and tiles only see
// these shapes, so swapping the data source (@hypercerts-org/api today, the
// Hypercerts SDK later) does not touch any component.

import type { app, org } from "@hypercerts-org/api";

type ActivityView = org.hypercerts.claim.getActivity.ActivityView;
type ActorView = org.hypercerts.api.defs.ActorView;
type BadgeAwardView = app.certified.badge.getBadgeAward.BadgeAwardView;
type CollectionActorView = org.hypercerts.collection.getCollection.CollectionActorView;
type CollectionView = org.hypercerts.collection.getCollection.CollectionView;
type OrganizationActorView = app.certified.actor.getOrganization.OrganizationActorView;
type ProfileView = org.hypercerts.api.defs.ProfileView;

/** The profile fields this app edits. */
export type ProfileFields = { displayName: string; description: string };

/** One version of an account's profile record: which version, and its fields. */
export type ProfileVersion = ProfileFields & { uri: string; cid: string };

/** The AT-URI of an account's profile record (app.certified.actor.profile). */
export const profileUri = (did: string) => `at://${did}/app.certified.actor.profile/self`;

export function toProfileVersion(view: ProfileView): ProfileVersion {
  return {
    uri: view.uri,
    cid: view.cid,
    displayName: view.record.displayName ?? "",
    description: view.record.description ?? "",
  };
}

export type Page<T> = {
  items: T[];
  cursor: string | null;
};

export type ActorCard = {
  did: string;
  /** Its handle, verified both ways, for links (queries fill it in); null without one. */
  handle: string | null;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  isOrganization: boolean;
};

export interface ActorDetail extends ActorCard {
  /** The profile record's own fields, without display fallbacks. */
  profile: ProfileFields;
  organizationTypes: string[];
  /** An organization's links, http(s) only (safeUrl). */
  urls: string[];
  /** The profile's website, if it has one: http(s) only (safeUrl). */
  website: string | null;
  longDescription: string | null;
  foundedDate: string | null;
  /** An organization's location record, as shown (toPlace). */
  place: Place | null;
  bannerUrl: string | null;
  pronouns: string | null;
  /** When the profile was created, as "Jun 2026". */
  joined: string | null;
}

export type ActivityCard = {
  uri: string;
  cid: string;
  title: string;
  summary: string | null;
  author: ActorCard;
  createdAt: string | null;
  indexedAt: string | null;
  imageUrl: string | null;
  /** When the work happened: "1 Jun 2026 – 3 Jun 2026", "1 Jun 2026 (ongoing)", "Until …". */
  period: string | null;
};

export type ProjectCard = {
  uri: string;
  rkey: string;
  authorDid: string;
  title: string;
  summary: string | null;
  /** Items that are activities (a project can also hold features and other collections). */
  activityCount: number;
  /** Those activities' addresses. */
  activityUris: string[];
  imageUrl: string | null;
};

export interface ProjectDetail extends ProjectCard {
  description: string | null;
  author: ActorCard;
  createdAt: string | null;
}

/** One of an account's latest records on its workspace overview. */
export type RecentRecord = {
  uri: string;
  kind: "Activity" | "Project";
  title: string;
  imageUrl: string | null;
  /** The record's own createdAt, for ordering. */
  createdAt: string;
  /** Formatted for display. */
  date: string | null;
};

/** A badge award of type "endorsement" that an account received. */
export type EndorsementCard = {
  uri: string;
  issuer: ActorCard;
  note: string | null;
  createdAt: string | null;
};

/** An account in a list of people: who follows, who endorsed, and when. */
export type PersonRow = {
  /** The follow or award record, as a stable key. */
  uri: string;
  actor: ActorCard;
  note: string | null;
  date: string | null;
  /** A received endorsement its subject hid from its profile (a "rejected" response). */
  hidden?: boolean;
};

/** A list an account keeps: a collection with a staging-app list type. */
export type ListCard = {
  uri: string;
  title: string;
  /** "Accounts", "Activities", "Projects" or "Endorsements". */
  kind: string;
  itemCount: number;
  summary: string | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Dates are formatted once, on the server, with a fixed locale and time zone,
// so server-rendered HTML and client hydration always agree.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Jun 2026". */
export function formatMonth(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : monthFormat.format(date);
}

export function formatDate(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

// Descriptions arrive as a plain string, an org.hypercerts.defs#descriptionString,
// or a pub.leaflet.pages.linearDocument. The spike renders plain text only.
export function plainText(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return null;
  if (record.$type === "org.hypercerts.defs#descriptionString") return asString(record.value);
  if (Array.isArray(record.blocks)) {
    const paragraphs = record.blocks
      .map((entry) => asString(asRecord(asRecord(entry)?.block)?.plaintext))
      .filter((text): text is string => text !== null);
    return paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
  }
  return null;
}

function blobCid(image: unknown): string | null {
  const ref = asRecord(image)?.ref;
  if (typeof ref === "string") return ref;
  const link = asRecord(ref)?.$link;
  if (typeof link === "string") return link;
  // Parsed CID instances stringify to their base32 form.
  return ref ? String(ref) : null;
}

// Images are blobs on the author's PDS, up to 5 MB (10 MB for large images),
// and the API returns only their references. They are served through the
// Bluesky CDN, which fetches the blob from the account's PDS (for any record,
// not only Bluesky's), resizes it and caches it. That is Bluesky's
// infrastructure, not a service offered to other apps: a dependency to replace
// once the API returns image URLs of its own.
//
// Each use asks for the size it shows: a 128px square for avatars and row
// thumbnails (about 6 KB; the 1000px `avatar` preset is often larger than the
// original), 1000px wide for card images, and the banner preset for banners.
const IMAGE_PRESET = {
  thumbnail: "avatar_thumbnail",
  card: "feed_thumbnail",
  banner: "banner",
} as const;

export type ImageSize = keyof typeof IMAGE_PRESET;

/**
 * A URL from a record, if it is http(s): anything else (javascript:, data:,
 * ftp:) never reaches an href. `httpsOnly` for what browsers load on their
 * own, such as images: no mixed content.
 */
export function safeUrl(value: unknown, httpsOnly = false): string | null {
  const text = asString(value);
  if (!text) return null;
  try {
    const { protocol } = new URL(text);
    return protocol === "https:" || (!httpsOnly && protocol === "http:") ? text : null;
  } catch {
    return null;
  }
}

export function imageUrl(did: string, image: unknown, size: ImageSize): string | null {
  const record = asRecord(image);
  if (!record) return null;
  // An image given as a URL loads from wherever the author says, so only
  // over https. (Blobs go through the CDN below.)
  if (record.$type === "org.hypercerts.defs#uri") return safeUrl(record.uri, true);
  const cid = blobCid(record.image);
  return cid ? `https://cdn.bsky.app/img/${IMAGE_PRESET[size]}/plain/${did}/${cid}@jpeg` : null;
}

/** An avatar or row thumbnail: the 128px square. */
export function avatarUrl(did: string, avatar: unknown): string | null {
  return imageUrl(did, avatar, "thumbnail");
}

// A badge award's subject is an account (`{ did }`) or a record
// (`{ uri, cid }`). Returns the DID or AT-URI, or null for anything else.
export function awardSubject(subject: unknown): string | null {
  const record = asRecord(subject);
  return asString(record?.did) ?? asString(record?.uri);
}

export function didOf(uri: string): string {
  return uri.split("/")[2] ?? uri;
}

export function collectionOf(uri: string): string | null {
  return uri.split("/")[3] ?? null;
}

export function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

// The mappers take the typed API views. Where indexed data is known to diverge
// from the lexicons (descriptions, blob references), they read defensively.
type AnyActorView = ActorView | OrganizationActorView | CollectionActorView;

export function toActorCard(actor: AnyActorView): ActorCard {
  const profile = actor.profile?.record;
  return {
    did: actor.did,
    handle: null,
    displayName: profile?.displayName || actor.did,
    description: profile?.description || null,
    avatarUrl: avatarUrl(actor.did, profile?.avatar),
    isOrganization: Boolean(actor.organization),
  };
}

export function toActorDetail(actor: AnyActorView): ActorDetail {
  const organization = actor.organization?.record;
  const profile = actor.profile?.record;
  return {
    ...toActorCard(actor),
    profile: {
      displayName: profile?.displayName ?? "",
      description: profile?.description ?? "",
    },
    organizationTypes: organization?.organizationType ?? [],
    urls: (organization?.urls ?? []).flatMap((entry) => safeUrl(entry.url) ?? []),
    website: safeUrl(profile?.website),
    bannerUrl: imageUrl(actor.did, profile?.banner, "banner"),
    pronouns: asString(profile?.pronouns),
    joined: formatMonth(profile?.createdAt),
    longDescription: plainText(organization?.longDescription),
    // "Feb 2023", as the staging redesign shows it.
    foundedDate: formatMonth(organization?.foundedDate),
    place: null,
  };
}

/** Where an account is: from its app.certified.location record. */
export type Place = {
  /** The record's name in full: "Wilmington, New Castle County, Delaware, United States". */
  name: string;
  /**
   * For a meta line: its last two parts ("Delaware, United States"), which
   * the profile query replaces with the point's locality and country
   * (geocode.ts) when it has a point.
   */
  short: string;
  /** For a map, when the record holds a point in a format read here. */
  point: { lat: number; lng: number } | null;
};

type LocationRecord = { name?: unknown; locationType?: unknown; location?: unknown };

/**
 * The CID of the blob a location record keeps its value in
 * ("org.hypercerts.defs#smallBlob"), or null when the value is inline.
 */
export function locationBlobCid(record: LocationRecord): string | null {
  const location = asRecord(record.location);
  return location?.$type === "org.hypercerts.defs#smallBlob" ? blobCid(location.blob) : null;
}

/**
 * A location record as a Place, or null without a name. The value is the
 * record's inline string, or `blobText` when the record keeps it in a blob
 * (locationBlobCid; the caller reads it). The point is read from the two
 * formats that hold one (Location Protocol types): "coordinate-decimal",
 * "lat, lng" in WGS 84, and "geojson-point", a GeoJSON Point ([lng, lat]).
 * Anything else, or out of range, has no point: the name still shows.
 */
export function toPlace(record: LocationRecord, blobText: string | null = null): Place | null {
  const name = asString(record.name)?.trim();
  if (!name) return null;
  const short = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(-2)
    .join(", ");
  const value = asString(asRecord(record.location)?.string) ?? blobText?.trim() ?? null;
  return { name, short, point: value ? readPoint(record.locationType, value) : null };
}

function readPoint(type: unknown, value: string): Place["point"] {
  let lat: number;
  let lng: number;
  if (type === "coordinate-decimal") {
    const parts = value.split(",").map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => part === "")) return null;
    [lat, lng] = parts.map(Number);
  } else if (type === "geojson-point") {
    try {
      const geometry = JSON.parse(value) as { type?: unknown; coordinates?: unknown };
      if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) return null;
      [lng, lat] = geometry.coordinates as number[];
    } catch {
      return null;
    }
  } else {
    return null;
  }
  const valid =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return valid ? { lat, lng } : null;
}

export function toActivityCard(activity: ActivityView): ActivityCard {
  const { record } = activity;
  return {
    uri: activity.uri,
    cid: activity.cid,
    title: record.title || "Untitled activity",
    summary: record.shortDescription || plainText(record.description),
    author: toActorCard(activity.author),
    createdAt: formatDate(record.createdAt),
    indexedAt: activity.indexedAt,
    imageUrl: imageUrl(activity.did, record.image, "card"),
    period: formatPeriod(record.startDate, record.endDate),
  };
}

/** The work's dates, as the staging redesign words them. */
function formatPeriod(start: unknown, end: unknown): string | null {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  if (from) return `${from} (ongoing)`;
  if (to) return `Until ${to}`;
  return null;
}

export function toProjectCard(collection: CollectionView): ProjectCard {
  const { record } = collection;
  const activityUris = (record.items ?? [])
    .map((item) => item.itemIdentifier.uri)
    .filter((uri) => collectionOf(uri) === "org.hypercerts.claim.activity");
  return {
    uri: collection.uri,
    rkey: rkeyOf(collection.uri),
    authorDid: collection.did,
    title: record.title || "Untitled project",
    summary: record.shortDescription || null,
    activityCount: activityUris.length,
    activityUris,
    imageUrl: imageUrl(collection.did, record.avatar ?? record.banner, "card"),
  };
}

export function toProjectDetail(collection: CollectionView): ProjectDetail {
  return {
    ...toProjectCard(collection),
    description: plainText(collection.record.description),
    author: toActorCard(collection.author),
    createdAt: formatDate(collection.record.createdAt),
  };
}

export function activityRecord(activity: ActivityView): RecentRecord {
  const { record } = activity;
  return {
    uri: activity.uri,
    kind: "Activity",
    title: record.title || "Untitled activity",
    imageUrl: avatarUrl(activity.did, record.image),
    createdAt: record.createdAt,
    date: formatDate(record.createdAt),
  };
}

export function projectRecord(collection: CollectionView): RecentRecord {
  const { record } = collection;
  return {
    uri: collection.uri,
    kind: "Project",
    title: record.title || "Untitled project",
    imageUrl: avatarUrl(collection.did, record.avatar),
    createdAt: record.createdAt,
    date: formatDate(record.createdAt),
  };
}

export function toEndorsementCard(award: BadgeAwardView): EndorsementCard {
  return {
    uri: award.uri,
    issuer: toActorCard(award.author),
    note: asString(award.record.note),
    createdAt: formatDate(award.record.createdAt),
  };
}
