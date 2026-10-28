// Plain, serializable view models for the UI.
//
// The API returns hydrated records whose blob references and union types are
// awkward to pass across the server/client boundary. Pages and tiles only see
// these shapes, so swapping the data source (generated bindings today, the
// Hypercerts SDK later) does not touch any component.

import type {
  ActivityView,
  ActorView,
  BadgeAwardView,
  CollectionActorView,
  CollectionView,
  OrganizationActorView,
} from "./api"

export type Page<T> = {
  items: T[]
  cursor: string | null
}

export type ActorCard = {
  did: string
  displayName: string
  description: string | null
  avatarUrl: string | null
  isOrganization: boolean
}

export interface ActorDetail extends ActorCard {
  organizationTypes: string[]
  urls: string[]
  longDescription: string | null
  foundedDate: string | null
}

export type ActivityCard = {
  uri: string
  cid: string
  title: string
  summary: string | null
  author: ActorCard
  createdAt: string | null
  indexedAt: string | null
}

export type ProjectCard = {
  uri: string
  rkey: string
  authorDid: string
  title: string
  summary: string | null
  itemCount: number
}

export interface ProjectDetail extends ProjectCard {
  description: string | null
  author: ActorCard
  createdAt: string | null
}

export type BadgeCard = {
  uri: string
  title: string
  badgeType: string | null
  issuer: ActorCard
  response: string | null
  createdAt: string | null
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

// Dates are formatted once, on the server, with a fixed locale and time zone,
// so server-rendered HTML and client hydration always agree.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
})

export function formatDate(value: unknown): string | null {
  const text = asString(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date)
}

// Descriptions arrive as a plain string, an org.hypercerts.defs#descriptionString,
// or a pub.leaflet.pages.linearDocument. The spike renders plain text only.
export function plainText(value: unknown): string | null {
  const direct = asString(value)
  if (direct) return direct
  const record = asRecord(value)
  if (!record) return null
  if (record.$type === "org.hypercerts.defs#descriptionString")
    return asString(record.value)
  if (Array.isArray(record.blocks)) {
    const paragraphs = record.blocks
      .map((entry) => asString(asRecord(asRecord(entry)?.block)?.plaintext))
      .filter((text): text is string => text !== null)
    return paragraphs.length > 0 ? paragraphs.join("\n\n") : null
  }
  return null
}

function blobCid(image: unknown): string | null {
  const ref = asRecord(image)?.ref
  if (typeof ref === "string") return ref
  const link = asRecord(ref)?.$link
  if (typeof link === "string") return link
  // Parsed CID instances stringify to their base32 form.
  return ref ? String(ref) : null
}

// Avatars are served through the Bluesky CDN, which fetches the blob from the
// account's PDS. This avoids resolving every DID to its PDS in the spike.
export function avatarUrl(did: string, avatar: unknown): string | null {
  const record = asRecord(avatar)
  if (!record) return null
  if (record.$type === "org.hypercerts.defs#uri") return asString(record.uri)
  const cid = blobCid(record.image)
  return cid ? `https://cdn.bsky.app/img/avatar/plain/${did}/${cid}@jpeg` : null
}

export function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? uri
}

// The mappers take the typed API views. Where indexed data is known to diverge
// from the lexicons (descriptions, blob references), they read defensively.
type AnyActorView = ActorView | OrganizationActorView | CollectionActorView

export function toActorCard(actor: AnyActorView): ActorCard {
  const profile = actor.profile?.record
  return {
    did: actor.did,
    displayName: profile?.displayName || actor.did,
    description: profile?.description || null,
    avatarUrl: avatarUrl(actor.did, profile?.avatar),
    isOrganization: Boolean(actor.organization),
  }
}

export function toActorDetail(actor: AnyActorView): ActorDetail {
  const organization = actor.organization?.record
  return {
    ...toActorCard(actor),
    organizationTypes: organization?.organizationType ?? [],
    urls: (organization?.urls ?? []).map((entry) => entry.url),
    longDescription: plainText(organization?.longDescription),
    foundedDate: formatDate(organization?.foundedDate),
  }
}

export function toActivityCard(activity: ActivityView): ActivityCard {
  const { record } = activity
  return {
    uri: activity.uri,
    cid: activity.cid,
    title: record.title || "Untitled activity",
    summary: record.shortDescription || plainText(record.description),
    author: toActorCard(activity.author),
    createdAt: formatDate(record.createdAt),
    indexedAt: activity.indexedAt,
  }
}

export function toProjectCard(collection: CollectionView): ProjectCard {
  const { record } = collection
  return {
    uri: collection.uri,
    rkey: rkeyOf(collection.uri),
    authorDid: collection.did,
    title: record.title || "Untitled project",
    summary: record.shortDescription || null,
    itemCount: record.items?.length ?? 0,
  }
}

export function toProjectDetail(collection: CollectionView): ProjectDetail {
  return {
    ...toProjectCard(collection),
    description: plainText(collection.record.description),
    author: toActorCard(collection.author),
    createdAt: formatDate(collection.record.createdAt),
  }
}

export function toBadgeCard(award: BadgeAwardView): BadgeCard {
  const definition = award.badge?.record
  return {
    uri: award.uri,
    title: definition?.title || "Badge",
    badgeType: definition?.badgeType ?? null,
    issuer: toActorCard(award.author),
    response: award.responseStatus,
    createdAt: formatDate(award.record.createdAt),
  }
}
