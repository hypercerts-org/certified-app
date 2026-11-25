// Plain, serializable view models for the UI.
//
// The API returns hydrated records whose blob references and union types are
// awkward to pass across the server/client boundary. Pages and tiles only see
// these shapes, so swapping the data source (@hypercerts-org/api today, the
// Hypercerts SDK later) does not touch any component.

import type { app, org } from "@hypercerts-org/api";
import { type RichText, richTextOf } from "@/lib/rich-text";
import { safeUrl } from "@/lib/safe-url";

export { safeUrl };

/** A follow record: what unfollowing deletes. */
export type FollowRef = { uri: string; cid: string };

/** An endorsement award record: what revoking deletes. */
export type EndorsementRef = { uri: string; cid: string };

type ActivityView = org.hypercerts.claim.getActivity.ActivityView;
type ActorView = org.hypercerts.api.defs.ActorView;
type BadgeAwardView = app.certified.badge.getBadgeAward.BadgeAwardView;
type BadgeDefinitionView = app.certified.badge.getBadgeDefinition.BadgeDefinitionView;
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
  /** An organization's links, http(s) only (safeUrl), with their labels ("Donation page"). */
  urls: { url: string; label: string | null }[];
  /** An organization's registered name. */
  legalName: string | null;
  /** The contact address an organization chose to show, when it looks like one. */
  publicEmail: string | null;
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
  /** The kinds of work, as words (workScopeWords). */
  scope: string | null;
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

/** One of an account's latest records (its workspace's Latest), with when it was created, for ordering. */
export type LatestRecord =
  | { kind: "activity"; activity: ActivityCard; createdAt: string }
  | { kind: "project"; project: ProjectCard; createdAt: string };

export interface ProjectDetail extends ProjectCard {
  /** Its long description, as rich text (rich-text). */
  description: RichText | null;
  /** Its location record (app.certified.location), to look up; null without one. */
  locationUri: string | null;
  /** The project's banner, at the banner size; null without one. */
  bannerUrl: string | null;
  author: ActorCard;
  createdAt: string | null;
}

/** A badge award of type "endorsement" that an account received. */
export type EndorsementCard = {
  uri: string;
  issuer: ActorCard;
  /** Its badge's title, what kind of endorsement it is: "Highly recommended". */
  badge: string | null;
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
  /** For an endorsement: its badge's title, what kind it is ("Trusted Evaluator"). */
  badge?: string | null;
  /** A received endorsement its subject hid from its profile (a "rejected" response). */
  hidden?: boolean;
  /** For a follow: the follow record itself, which unfollowing deletes. */
  follow?: FollowRef;
};

/** A list an account keeps: a collection with a staging-app list type. */
export type ListCard = {
  uri: string;
  /** Its record key: its page under the account (/{account}/lists/{rkey}). */
  rkey: string;
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
  const link = asRecord(ref)?.$link;
  // A string, a { $link }, or a parsed CID (which stringifies to its base32
  // form). Some records hold junk ("[object Object]"): only a CID's shape passes.
  const cid =
    typeof ref === "string" ? ref : typeof link === "string" ? link : ref ? String(ref) : "";
  return /^(?:b[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/.test(cid) ? cid : null;
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
/** A contributor's account: its profile, but not whether it is an organization. */
type ContributorActorView = org.hypercerts.claim.getActivity.ContributorActorView;
type AnyActorView = ActorView | OrganizationActorView | CollectionActorView;

/**
 * An account's name, as every page shows it. One without a Certified profile
 * has only its DID for a name: its handle reads better.
 */
export function nameOf(
  actor: Pick<ActorCard, "handle" | "displayName"> & { did?: string },
): string {
  return actor.displayName === actor.did && actor.handle ? `@${actor.handle}` : actor.displayName;
}

export function toActorCard(actor: AnyActorView | ContributorActorView): ActorCard {
  const profile = actor.profile?.record;
  return {
    did: actor.did,
    handle: null,
    displayName: profile?.displayName || actor.did,
    description: profile?.description || null,
    avatarUrl: avatarUrl(actor.did, profile?.avatar),
    isOrganization: "organization" in actor && Boolean(actor.organization),
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
    urls: (organization?.urls ?? []).flatMap((entry) => {
      const url = safeUrl(entry.url);
      return url ? [{ url, label: asString(entry.label)?.trim() || null }] : [];
    }),
    legalName: asString(organization?.legalName)?.trim() || null,
    publicEmail: emailAddress(organization?.publicEmail),
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

/**
 * An email address to show and link (mailto:), or null unless it is one
 * plain address. Records are written by anyone; this keeps the link from
 * carrying anything else.
 */
export function emailAddress(value: unknown): string | null {
  const text = asString(value)?.trim();
  if (!text || text.length > 254) return null;
  // The part before @ without spaces, separators or a query; the domain
  // letters, digits, hyphens and dots, so the link can't carry a subject or body.
  return /^[^\s@<>()",;:?&=/%]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(text) ? text : null;
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
    scope: workScopeWords(record.workScope),
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

/** Someone who did an activity's work, as its page lists them. */
export type Contributor = {
  key: string;
  /** The account, when the contributor is one the index knows: its row links to it. */
  actor: ActorCard | null;
  /** Without an account: the name and picture the record gives. */
  name: string;
  avatarUrl: string | null;
  role: string | null;
  /** Its part of the work, from the weights: "67%". Null unless every contributor has one. */
  share: string | null;
};

type ContributorView = org.hypercerts.claim.getActivity.ActivityContributorView;

const shareFormat = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 });
const smallShareFormat = new Intl.NumberFormat("en", {
  style: "percent",
  maximumSignificantDigits: 1,
});

/**
 * An activity's contributors, as the API hydrates them: an account (its
 * profile), a contributor-information record (its name and picture), or the
 * name the record gives. Weights are relative, so a share is a weight's part
 * of their sum; with one contributor, or a weight missing, there is none.
 */
export function toContributors(views: ContributorView[] | undefined): Contributor[] {
  const list = views ?? [];
  const weights = list.map((view) => Number(view.contributionWeight));
  const total = weights.every((w) => Number.isFinite(w) && w > 0)
    ? weights.reduce((sum, w) => sum + w, 0)
    : 0;
  return list.map((view, i) => {
    const info = view.contributorInformation;
    const inline = asString(asRecord(view.contributorIdentity)?.identity)?.trim() || null;
    const actor = view.actor ? toActorCard(view.actor) : null;
    const part = list.length > 1 && total > 0 ? weights[i] / total : null;
    return {
      key: `${i}:${view.actor?.did ?? info?.uri ?? inline}`,
      actor,
      name:
        actor?.displayName ??
        (asString(info?.record.displayName)?.trim() ||
          asString(info?.record.identifier)?.trim() ||
          inline ||
          "Unnamed contributor"),
      avatarUrl: actor?.avatarUrl ?? (info ? avatarUrl(info.did, info.record.image) : null),
      role: asString(asRecord(view.contributionDetails)?.role)?.trim() || null,
      share: part === null ? null : (part < 0.01 ? smallShareFormat : shareFormat).format(part),
    };
  });
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
    description: richTextOf(collection.record.description),
    locationUri: asString(asRecord(collection.record.location)?.uri),
    bannerUrl: imageUrl(collection.did, collection.record.banner, "banner"),
    author: toActorCard(collection.author),
    createdAt: formatDate(collection.record.createdAt),
  };
}

export function toEndorsementCard(award: BadgeAwardView): EndorsementCard {
  return {
    uri: award.uri,
    issuer: toActorCard(award.author),
    badge: asString(award.badge?.record.title)?.trim() || null,
    note: asString(award.record.note),
    createdAt: formatDate(award.record.createdAt),
  };
}

// Badges ----------------------------------------------------------------------
//
// A badge award to an account, with its definition (what the badge is) and
// the recipient's response. Shown literally: the definition's own title and
// type, the issuer's note. What a badge means is for its issuer to say.

export type BadgeCard = {
  uri: string;
  /** The definition's owner and record key: its page (badgeHref). */
  ownerDid: string;
  rkey: string;
  title: string;
  /** The definition's type, as a label: "Certification", "Recognition". */
  type: string | null;
  description: string | null;
  iconUrl: string | null;
  issuer: ActorCard;
  /** When it was awarded: "12 Jun 2026". */
  awarded: string | null;
  /** When it stops applying, if it does: "Mar 2027". */
  validUntil: string | null;
  expired: boolean;
  note: string | null;
  /** A link the award gives, http(s) only. */
  url: string | null;
  /** The recipient's response. Rejected ones show only in its workspace. */
  status: "accepted" | "unanswered" | "rejected";
  /** Sort keys: the recipient's weight (0 without one), and the award's time. */
  weight: number;
  time: number;
};

/** The definition title and type the per-account endorsements use, which the profile shows apart. */
export const PLAIN_ENDORSEMENT = "Endorsement";
export const ENDORSEMENT_BADGE_TYPE = "endorsement";

/**
 * An award as a badge card, or null when it isn't shown as a badge:
 * - rejected by the recipient (unless `withRejected`: its workspace), or its
 *   definition can't be read;
 * - a plain endorsement (a definition of type "endorsement" titled
 *   "Endorsement", one per endorser): the profile's Endorsements show those.
 *   Endorsement-type badges with other titles ("Trusted Evaluator") are badges;
 * - issued by someone the definition doesn't allow (allowedIssuers).
 */
export function toBadgeCard(
  award: BadgeAwardView,
  now = Date.now(),
  { withRejected = false } = {},
): BadgeCard | null {
  if (!award.badge || (award.responseStatus === "rejected" && !withRejected)) return null;
  const definition = award.badge.record;
  const title = asString(definition.title)?.trim();
  if (!title) return null;
  if (definition.badgeType === ENDORSEMENT_BADGE_TYPE && title === PLAIN_ENDORSEMENT) return null;
  const allowed = (definition.allowedIssuers ?? []).map((issuer) =>
    asString(asRecord(issuer)?.did),
  );
  if (allowed.length > 0 && !allowed.includes(award.author.did)) return null;

  const until = asString(award.record.validUntil);
  const untilTime = until ? new Date(until).getTime() : Number.NaN;
  const weight = Number(asString(award.recipientResponse?.record.weight));
  const type = asString(definition.badgeType);
  return {
    uri: award.uri,
    title,
    type: badgeTypeLabel(type),
    description: asString(definition.description)?.trim() || null,
    ownerDid: award.badge.did,
    rkey: award.badge.uri.split("/").pop() ?? "",
    iconUrl: badgeIconUrl(award.badge.did, definition.icon),
    issuer: toActorCard(award.author),
    awarded: formatDate(award.record.createdAt),
    validUntil: formatMonth(until),
    expired: Number.isFinite(untilTime) && untilTime < now,
    note: asString(award.record.note)?.trim() || null,
    url: safeUrl(award.record.url),
    status: award.responseStatus === "unanswered" ? "unanswered" : award.responseStatus,
    weight: Number.isFinite(weight) ? weight : 0,
    time: new Date(asString(award.record.createdAt) ?? 0).getTime() || 0,
  };
}

/** Badges in force first, by the recipient's weight, then newest; expired ones last. */
export function sortBadges<T extends BadgeCard>(cards: T[]): T[] {
  return [...cards].sort(
    (a, b) => Number(a.expired) - Number(b.expired) || b.weight - a.weight || b.time - a.time,
  );
}

/** A badge type as a label: "certification" reads "Certification". */
function badgeTypeLabel(type: string | null): string | null {
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : null;
}

/** A badge's icon: a blob in the repository of the account that defined it. */
function badgeIconUrl(ownerDid: string, icon: unknown): string | null {
  const cid = blobCid(icon);
  return cid
    ? `https://cdn.bsky.app/img/${IMAGE_PRESET.thumbnail}/plain/${ownerDid}/${cid}@jpeg`
    : null;
}

/** A badge definition, for its own page. */
export type BadgeDetail = {
  uri: string;
  ownerDid: string;
  rkey: string;
  title: string;
  type: string | null;
  description: string | null;
  iconUrl: string | null;
  /** The account that defined it. */
  issuer: ActorCard;
  /** Who may award it, when the definition says (allowedIssuers); empty: anyone. */
  allowedIssuers: string[];
};

export function toBadgeDetail(view: BadgeDefinitionView): BadgeDetail | null {
  const definition = view.record;
  const title = asString(definition.title)?.trim();
  if (!title) return null;
  return {
    uri: view.uri,
    ownerDid: view.did,
    rkey: view.uri.split("/").pop() ?? "",
    title,
    type: badgeTypeLabel(asString(definition.badgeType)),
    description: asString(definition.description)?.trim() || null,
    iconUrl: badgeIconUrl(view.did, definition.icon),
    issuer: toActorCard(view.author),
    allowedIssuers: (definition.allowedIssuers ?? []).flatMap(
      (issuer) => asString(asRecord(issuer)?.did) ?? [],
    ),
  };
}

// List items ------------------------------------------------------------------
//
// A list's items are strong references to records. Each shows as what it
// points to (an account, a project, an activity, an endorsement), whatever
// kind the list says it holds; one that can't be read shows as missing.

export type ListItem =
  | { kind: "account"; uri: string; actor: ActorCard }
  | { kind: "project"; uri: string; project: ProjectCard; author: ActorCard | null }
  | { kind: "activity"; uri: string; activity: ActivityCard }
  | {
      kind: "endorsement";
      uri: string;
      issuer: ActorCard;
      subject: ActorCard | null;
      date: string | null;
    }
  | { kind: "missing"; uri: string };

/**
 * The line under an endorsement's account, the same wherever one is listed:
 * what kind of endorsement it is (its badge's title), then the endorser's note.
 */
export function endorsementLine(row: {
  badge?: string | null;
  note: string | null;
}): string | undefined {
  return [row.badge, row.note].filter(Boolean).join(" · ") || undefined;
}

// Funding receipts ------------------------------------------------------------
//
// A payment from a sender to a recipient (org.hypercerts.funding.receipt),
// recorded by any party: mostly a platform that processed it (via). Sender and
// recipient are an account, a record, or free text (a wallet address); the
// sender may be absent (anonymous). `for` is what the funding relates to: a
// project, an activity or an organization.

/** A sender or recipient as a receipt names it. */
export type ReceiptParty =
  | { kind: "account"; did: string }
  | { kind: "text"; value: string }
  | { kind: "anonymous" };

export type Receipt = {
  uri: string;
  /** Who wrote the receipt (often the platform). */
  recorderDid: string;
  from: ReceiptParty;
  to: ReceiptParty;
  viaDid: string | null;
  /** What the funding is for: a record's address, or null. */
  forUri: string | null;
  /** "Donation", "Match", "Grant", or null. */
  type: string | null;
  /** The amount as money: "$100.00", "1 USDC"; null when the receipt has none. */
  amount: string | null;
  /** Its value and currency, for totals. */
  value: number | null;
  currency: string | null;
  /** When the payment happened (else when it was recorded): "19 Nov 2026". */
  date: string | null;
  /** The same, short, for a ledger: "19 Nov" (the year only when it isn't this one). */
  stamp: string | null;
  /** The same with the time, for the short one's tooltip: "19 Nov 2026, 08:42 UTC". */
  stampFull: string | null;
  time: number;
  /** Where it was paid: "Celo", "Ethereum", "Base", "Stripe"; null when not said. */
  network: string | null;
  /** The payment's ID, shortened ("0x5442…ee13"), and its explorer page when known. */
  transaction: { id: string; short: string; href: string | null } | null;
  notes: string | null;
};

const stampDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const stampFull = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** "19 Nov", or "19 Nov 2025" when it isn't this year: a ledger's When. */
function formatStamp(value: string | null, now = Date.now()): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const thisYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return thisYear ? stampDay.format(date) : (formatDate(value) ?? stampDay.format(date));
}

/** "19 Nov 2026, 08:42 UTC": the stamp in full, for its tooltip. */
function formatStampFull(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `${stampFull.format(date)} UTC`;
}

function party(value: unknown): ReceiptParty {
  const record = asRecord(value);
  const did = asString(record?.did);
  if (did?.startsWith("did:")) return { kind: "account", did };
  const uri = asString(record?.uri);
  if (uri?.startsWith("at://")) return { kind: "account", did: didOf(uri) };
  const text = asString(record?.value)?.trim();
  return text ? { kind: "text", value: text } : { kind: "anonymous" };
}

/**
 * An amount in its currency: ISO 4217 codes as money ("$100.00", "¥10,000"),
 * anything else (a token) as a number and its ticker ("1 USDC", "0.05 USDC").
 */
export function formatMoney(amount: string, currency: string | null): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return currency ? `${amount} ${currency}` : amount;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
    } catch {
      // Not a currency Intl knows: shown as a token.
    }
  }
  const number = new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(value);
  return currency ? `${number} ${currency}` : number;
}

/** Block explorers by network, for an onchain payment's transaction hash. */
const EXPLORERS: Record<string, { name: string; tx: string }> = {
  celo: { name: "Celo", tx: "https://celoscan.io/tx/" },
  "eip155:42220": { name: "Celo", tx: "https://celoscan.io/tx/" },
  ethereum: { name: "Ethereum", tx: "https://etherscan.io/tx/" },
  "eip155:1": { name: "Ethereum", tx: "https://etherscan.io/tx/" },
  base: { name: "Base", tx: "https://basescan.org/tx/" },
  "eip155:8453": { name: "Base", tx: "https://basescan.org/tx/" },
};

/**
 * A wallet address as a gift post names it: shortened ("0x6C0f…E401"), and
 * linked to the address on its network's explorer when that is known.
 */
export function toWalletTarget(address: string, network: string | null): FeedTarget {
  const explorer = network ? EXPLORERS[network.toLowerCase()] : undefined;
  const evm = /^0x[0-9a-fA-F]{40}$/.test(address);
  return {
    kind: "wallet",
    address,
    label: address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address,
    href: explorer && evm ? `${explorer.tx.replace(/\/tx\/$/, "/address/")}${address}` : null,
  };
}

export function toReceipt(view: {
  uri: string;
  did: string;
  record: Record<string, unknown>;
}): Receipt {
  const record = view.record;
  const amount = asString(record.amount) ?? asString(record.netAmount);
  const currency =
    asString(record.amount) !== null ? asString(record.currency) : asString(record.netCurrency);
  const value = amount !== null ? Number(amount) : Number.NaN;
  const when = asString(record.occurredAt) ?? asString(record.createdAt);
  const network = asString(record.paymentNetwork)?.trim() || null;
  const explorer = network ? EXPLORERS[network.toLowerCase()] : undefined;
  const id = asString(record.transactionId)?.trim() || null;
  const type = asString(record.type);
  return {
    uri: view.uri,
    recorderDid: view.did,
    from: party(record.from),
    to: party(record.to),
    viaDid: (() => {
      const via = party(record.via);
      return via.kind === "account" ? via.did : null;
    })(),
    forUri: asString(asRecord(record.for)?.uri),
    type: type ? type.charAt(0).toUpperCase() + type.slice(1) : null,
    amount: amount !== null ? formatMoney(amount, currency) : null,
    value: Number.isFinite(value) ? value : null,
    currency,
    date: formatDate(when),
    stamp: formatStamp(when),
    stampFull: formatStampFull(when),
    time: when ? new Date(when).getTime() || 0 : 0,
    network:
      explorer?.name ?? (network ? network.charAt(0).toUpperCase() + network.slice(1) : null),
    transaction: id
      ? {
          id,
          short: id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id,
          href: explorer && /^0x[0-9a-fA-F]{64}$/.test(id) ? `${explorer.tx}${id}` : null,
        }
      : null,
    notes: asString(record.notes)?.trim() || null,
  };
}

/** Totals by currency, largest first: what a list of receipts adds up to. */
export function totalsByCurrency(receipts: Receipt[]): { currency: string; amount: string }[] {
  const sums = new Map<string, number>();
  for (const receipt of receipts) {
    if (receipt.value === null || !receipt.currency) continue;
    sums.set(receipt.currency, (sums.get(receipt.currency) ?? 0) + receipt.value);
  }
  return [...sums.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([currency, sum]) => ({ currency, amount: formatMoney(String(sum), currency) }));
}

// Explore
//
// Explore's rows, as staging's: an activity with its dates and work scope, a
// project with its author, an account with its handle, each with how long ago
// it was created ("2d ago", then the date after a week).

/** When a record was created: for a `<time>` and for reading. */
export type Age = { iso: string; label: string };

export type ExploreActivity = ActivityCard & { age: Age | null };
export type ExploreProject = ProjectCard & { author: ActorCard; age: Age | null };
export type ExploreAccount = ActorCard & { age: Age | null };

const DAY = 86_400_000;

/** "Just now", "5m ago", "3h ago", "6d ago", then "12 Nov 2026". */
export function toAge(value: unknown, now: number): Age | null {
  const text = asString(value);
  if (!text) return null;
  const time = new Date(text).getTime();
  if (Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  const minutes = Math.floor(elapsed / 60_000);
  const label =
    minutes < 1
      ? "Just now"
      : minutes < 60
        ? `${minutes}m ago`
        : elapsed < DAY
          ? `${Math.floor(minutes / 60)}h ago`
          : elapsed < 7 * DAY
            ? `${Math.floor(elapsed / DAY)}d ago`
            : dateFormat.format(new Date(time));
  return { iso: new Date(time).toISOString(), label };
}

/**
 * An activity's work scope as words: "Forest protection, Community
 * stewardship". The record holds a string or a CEL expression
 * (`scope.hasAny(['forest_protection'])`) whose tags, referenced by URI, the
 * API doesn't resolve: the tokens in the expression are the readable part.
 */
export function workScopeWords(value: unknown): string | null {
  let tokens: string[] = [];
  const text = asString(value);
  const record = asRecord(value);
  const expression = text ?? asString(record?.expression) ?? asString(record?.scope);
  if (!expression) return null;
  const list = expression.match(/hasAny\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  if (list) tokens = [...list[1].matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  else if (!/scope\s*\./.test(expression)) tokens = expression.split(",");
  const words = new Map<string, string>();
  for (const token of tokens) {
    const plain = token.trim().replace(/[_-]+/g, " ").trim();
    if (!plain) continue;
    const word = /[A-Z]/.test(plain) ? plain : plain[0].toUpperCase() + plain.slice(1);
    words.set(word.toLowerCase(), word);
  }
  return words.size > 0 ? [...words.values()].join(", ") : null;
}

export function toExploreActivity(activity: ActivityView, now: number): ExploreActivity {
  return {
    ...toActivityCard(activity),
    age: toAge(activity.record.createdAt, now),
  };
}

export function toExploreProject(collection: CollectionView, now: number): ExploreProject {
  return {
    ...toProjectCard(collection),
    author: toActorCard(collection.author),
    age: toAge(collection.record.createdAt, now),
  };
}

// Profile feed
//
// What an account did, newest first: work it published, endorsements and
// badges, follows, funding. Events that come in numbers (gifts, followers,
// badges awarded) are grouped per day into one row.

/** A badge or project as a feed row names it: its title and its page. */
export type FeedLink = { title: string; href: string };

/** One event, as read from the API (cached per page): DIDs, not cards yet. */
export type FeedEvent = { key: string; time: number } & (
  | { kind: "activity"; activity: ActivityCard }
  | { kind: "project"; project: ProjectCard }
  | { kind: "endorsed"; subject: string | null; badge: string | null; note: string | null }
  | { kind: "endorsedBy"; issuer: ActorCard; badge: string | null; note: string | null }
  | { kind: "badge"; badge: BadgeCard }
  | { kind: "awarded"; badge: FeedLink; recipient: string | null }
  | { kind: "follower"; actor: ActorCard }
  | { kind: "followed"; actor: ActorCard }
  | { kind: "followedProject"; project: FeedLink }
  | {
      kind: "gift";
      direction: "received" | "given" | "recorded";
      value: number | null;
      currency: string | null;
      /** Who gave it, as a key for counting donors; null when anonymous. */
      donor: string | null;
      /**
       * What the post names for it: for gifts received, the donor's DID; for
       * gifts given or recorded, the record it was for (an AT-URI), else the
       * receiving account's DID. Null when it names nothing.
       */
      counterpart: string | null;
      /** A wallet the gift went to, when the receipt names only an address. */
      wallet: FeedTarget | null;
    }
);

/** What a gift post names: an account, or the project or activity it was for. */
export type FeedTarget =
  | { kind: "account"; actor: ActorCard }
  | { kind: "record"; uri: string; title: string; href: string; imageUrl: string | null }
  | { kind: "wallet"; address: string; label: string; href: string | null };

/** A row of the feed: one event, or a day's events of one kind together. */
export type FeedRow = { key: string; date: string | null } & (
  | { kind: "activity"; activity: ActivityCard }
  | { kind: "project"; project: ProjectCard }
  | {
      kind: "endorsed";
      /** The accounts endorsed that day with this kind of endorsement; the rest counted. */
      subjects: ActorCard[];
      count: number;
      badge: string | null;
      /** The note, when the row is one endorsement. */
      note: string | null;
    }
  | { kind: "endorsedBy"; issuer: ActorCard; badge: string | null; note: string | null }
  | { kind: "badge"; badge: BadgeCard }
  | { kind: "awarded"; badge: FeedLink; count: number; recipients: ActorCard[] }
  | { kind: "followers" | "following"; count: number; actors: ActorCard[] }
  | { kind: "projectsFollowed"; count: number; projects: FeedLink[] }
  | {
      kind: "gifts";
      direction: "received" | "given" | "recorded";
      count: number;
      totals: { currency: string; amount: string }[];
      donors: number;
      /** The first few it went to (or came from), linked; and how many there were. */
      targets: FeedTarget[];
      targetCount: number;
    }
);

// What others add to an activity or a project (org.hypercerts.context.*):
// evaluations, measurements and attachments. Updates are attachments of type
// "update"; comments (attachments of type "comment") are left out until the
// app has a place for a conversation.

type EvaluationRecordView = org.hypercerts.context.getEvaluation.EvaluationView;
type MeasurementRecordView = org.hypercerts.context.getMeasurement.MeasurementView;
type AttachmentRecordView = org.hypercerts.context.getAttachment.AttachmentView;

/**
 * A file or page a record points to, with what it reads as. An image has
 * `thumbnail` (shown as a picture, linking to the full size); a sound file
 * has `audio` (played in place).
 */
export type FileLink = { href: string; label: string; thumbnail?: string; audio?: boolean };

/** An evaluation of the work: by whom, its verdict, and its score if it gives one. */
export type Evaluation = {
  uri: string;
  /** The records it evaluates (a project, an activity). */
  subjects: string[];
  /** The evaluators' DIDs, in the record's order (the query turns them into cards). */
  evaluatorDids: string[];
  summary: string;
  /** "8", out of "10" (from "1"). */
  score: { value: string; min: string; max: string } | null;
  date: string | null;
  /** When it was made, for ordering a timeline (0 when unknown). */
  time: number;
  /** Its reports and data, where they are links. */
  files: FileLink[];
};

/** A measured result: "25 hectares", what was measured, when and how. */
export type Measurement = {
  uri: string;
  /** The records it measures (a project, an activity). */
  subjects: string[];
  author: ActorCard;
  /** When it was recorded, for ordering a timeline (0 when unknown). */
  time: number;
  /** "Forest area restored". */
  metric: string;
  /** The value as written, numbers grouped: "1,250", "30000 records". */
  value: string;
  unit: string;
  /** When it was measured: a date, or a period. */
  period: string | null;
  /** "Manual count". */
  method: string | null;
  comment: string | null;
  /** Its source, methodology or evidence, as links. */
  files: FileLink[];
};

/** An attachment: an update, a report, a recording, a photo. */
export type Attachment = {
  uri: string;
  /** The records it is about (a project, an activity). */
  subjects: string[];
  author: ActorCard;
  /** When it was captured or made, for ordering a timeline (0 when unknown). */
  time: number;
  /** The record's own type ("update", "report", "audio"), as written. */
  kind: string;
  title: string;
  date: string | null;
  body: RichText | null;
  files: FileLink[];
};

const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 6 });

/** "items_described", "forest-area" → "Items described", "Forest area". */
export function humanize(token: string): string {
  const plain = token.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!plain) return plain;
  return /[A-Z]/.test(plain) ? plain : plain[0].toUpperCase() + plain.slice(1);
}

/** A numeric string grouped for reading ("1250.5" → "1,250.5"); anything else as written. */
function formatValue(value: string): string {
  const text = value.trim();
  return /^-?\d+(\.\d+)?$/.test(text) ? numberFormat.format(Number(text)) : text;
}

const MIME_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "text/csv": "CSV",
  "application/json": "JSON",
  "application/zip": "ZIP",
};

/** "PDF", "Image", "Audio", or the file's subtype in capitals. */
function fileKind(mimeType: string): string {
  if (MIME_LABEL[mimeType]) return MIME_LABEL[mimeType];
  const [type, subtype = ""] = mimeType.split("/");
  if (type === "image") return "Image";
  if (type === "audio") return "Audio";
  if (type === "video") return "Video";
  return subtype.split(/[.+-]/)[0]?.toUpperCase() || "File";
}

/**
 * A record's files and links as links: web addresses as they are (http(s)
 * only), blobs at the author's server (`blobBase`: its getBlob address),
 * anything else (an at:// reference to a record of another app) left out.
 */
export function fileLinks(items: unknown, did: string, blobBase: string | null): FileLink[] {
  return (Array.isArray(items) ? items : []).flatMap((entry): FileLink[] => {
    const item = asRecord(entry);
    const uri = safeUrl(typeof entry === "string" ? entry : item?.uri);
    if (uri) {
      const { hostname, pathname } = new URL(uri);
      const rawSegment = pathname.split("/").filter(Boolean).at(-1) ?? "";
      let file = rawSegment;
      try {
        file = decodeURIComponent(rawSegment);
      } catch {
        // Malformed percent-encoding: keep the raw segment for extension matching.
      }
      const label = /\.[a-z0-9]{2,5}$/i.test(file) ? file : hostname.replace(/^www\./, "");
      // A picture on the web loads only over https (no mixed content).
      const picture = /\.(jpe?g|png|webp|gif)$/i.test(file) ? safeUrl(uri, true) : null;
      return [picture ? { href: uri, label, thumbnail: picture } : { href: uri, label }];
    }
    const blob = asRecord(item?.blob);
    const cid = blobCid(blob);
    if (!cid) return [];
    const mimeType = asString(blob?.mimeType) ?? "";
    // Pictures through the image CDN, as every record image (see IMAGE_PRESET).
    if (mimeType.startsWith("image/")) {
      const at = (preset: string) => `https://cdn.bsky.app/img/${preset}/plain/${did}/${cid}@jpeg`;
      return [{ href: at("feed_fullsize"), label: "Image", thumbnail: at("feed_thumbnail") }];
    }
    if (!blobBase) return [];
    const href = `${blobBase}?${new URLSearchParams({ did, cid })}`;
    return [{ href, label: fileKind(mimeType), audio: mimeType.startsWith("audio/") || undefined }];
  });
}

/** A date as milliseconds, for ordering; 0 when it isn't one. */
function timeOf(value: unknown): number {
  const time = new Date(asString(value) ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}

/** A context record's subjects (a strong ref, or a list of them), as URIs. */
function subjectsOf(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap(
    (entry) => asString(asRecord(entry)?.uri) ?? asString(entry) ?? [],
  );
}

export function toEvaluation(view: EvaluationRecordView, blobBase: string | null): Evaluation {
  const record = view.record as unknown as UnknownRecord;
  const evaluators = (Array.isArray(record.evaluators) ? record.evaluators : []).flatMap(
    (entry) => {
      const did = asString(asRecord(entry)?.did) ?? asString(entry);
      return did ? [did] : [];
    },
  );
  const score = asRecord(record.score);
  const value = asString(score?.value);
  const max = asString(score?.max);
  return {
    uri: view.uri,
    evaluatorDids: evaluators.length > 0 ? [...new Set(evaluators)] : [view.did],
    summary: asString(record.summary)?.trim() ?? "",
    score: value && max ? { value, min: asString(score?.min) ?? "0", max } : null,
    date: formatDate(record.createdAt),
    time: timeOf(record.createdAt),
    subjects: subjectsOf(record.subject ?? record.subjects),
    files: fileLinks(record.content, view.did, blobBase),
  };
}

export function toMeasurement(view: MeasurementRecordView): Measurement {
  const record = view.record as unknown as UnknownRecord;
  const from = formatDate(record.startDate);
  const to = formatDate(record.endDate);
  return {
    uri: view.uri,
    subjects: subjectsOf(record.subjects ?? record.subject),
    author: toActorCard(view.author),
    time: timeOf(record.createdAt),
    metric: humanize(asString(record.metric) ?? ""),
    value: formatValue(asString(record.value) ?? ""),
    unit: asString(record.unit)?.trim() ?? "",
    period:
      from && to && from !== to ? `${from} – ${to}` : (from ?? to ?? formatDate(record.createdAt)),
    method: asString(record.methodType) ? humanize(asString(record.methodType) ?? "") : null,
    comment: asString(record.comment)?.trim() || null,
    // The lexicon's methodology and evidence, and the source some apps write.
    files: fileLinks(
      [
        record.sourceUrl,
        record.methodURI,
        ...(Array.isArray(record.evidenceURI) ? record.evidenceURI : []),
      ],
      view.did,
      null,
    ),
  };
}

export function toAttachment(view: AttachmentRecordView, blobBase: string | null): Attachment {
  const record = view.record as unknown as UnknownRecord;
  const short = asString(record.shortDescription)?.trim();
  return {
    uri: view.uri,
    subjects: subjectsOf(record.subjects ?? record.subject),
    author: toActorCard(view.author),
    time: timeOf(record.capturedAt ?? record.createdAt),
    kind: asString(record.contentType)?.trim().toLowerCase() || "attachment",
    title: asString(record.title)?.trim() || "Untitled",
    date: formatDate(record.capturedAt ?? record.createdAt),
    body: richTextOf(record.description) ?? (short ? richTextOf(short) : null),
    files: fileLinks(record.content, view.did, blobBase),
  };
}
