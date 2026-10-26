// Plain, serializable view models for the UI.
//
// The API returns hydrated records whose blob references and union types are
// awkward to pass across the server/client boundary. Pages and tiles only see
// these shapes, so swapping the data source (generated bindings today, the
// Hypercerts SDK later) does not touch any component.

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

export type ActorDetail = ActorCard & {
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

export type ProjectDetail = ProjectCard & {
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

// Actor views differ slightly between endpoints but share did, profile and
// organization, each wrapping the indexed record.
export function toActorCard(view: unknown): ActorCard {
  const actor = asRecord(view) ?? {}
  const did = asString(actor.did) ?? "unknown"
  const profile = asRecord(asRecord(actor.profile)?.record) ?? {}
  return {
    did,
    displayName: asString(profile.displayName) ?? did,
    description: asString(profile.description),
    avatarUrl: avatarUrl(did, profile.avatar),
    isOrganization: Boolean(asRecord(actor.organization)),
  }
}

export function toActorDetail(view: unknown): ActorDetail {
  const card = toActorCard(view)
  const organization =
    asRecord(asRecord(asRecord(view)?.organization)?.record) ?? {}
  const urls = Array.isArray(organization.urls)
    ? organization.urls
        .map((entry) => asString(asRecord(entry)?.url))
        .filter((url): url is string => url !== null)
    : []
  return {
    ...card,
    organizationTypes: Array.isArray(organization.organizationType)
      ? organization.organizationType.filter(
          (type): type is string => typeof type === "string",
        )
      : [],
    urls,
    longDescription: plainText(organization.longDescription),
    foundedDate: formatDate(organization.foundedDate),
  }
}

export function toActivityCard(view: unknown): ActivityCard {
  const activity = asRecord(view) ?? {}
  const record = asRecord(activity.record) ?? {}
  return {
    uri: asString(activity.uri) ?? "",
    cid: asString(activity.cid) ?? "",
    title: asString(record.title) ?? "Untitled activity",
    summary: asString(record.shortDescription) ?? plainText(record.description),
    author: toActorCard(activity.author),
    createdAt: formatDate(record.createdAt),
    indexedAt: asString(activity.indexedAt),
  }
}

export function toProjectCard(view: unknown): ProjectCard {
  const collection = asRecord(view) ?? {}
  const record = asRecord(collection.record) ?? {}
  const uri = asString(collection.uri) ?? ""
  return {
    uri,
    rkey: rkeyOf(uri),
    authorDid: asString(collection.did) ?? "",
    title: asString(record.title) ?? "Untitled project",
    summary: asString(record.shortDescription),
    itemCount: Array.isArray(record.items) ? record.items.length : 0,
  }
}

export function toProjectDetail(view: unknown): ProjectDetail {
  const collection = asRecord(view) ?? {}
  const record = asRecord(collection.record) ?? {}
  return {
    ...toProjectCard(view),
    description: plainText(record.description),
    author: toActorCard(collection.author),
    createdAt: formatDate(record.createdAt),
  }
}

export function toBadgeCard(view: unknown): BadgeCard {
  const award = asRecord(view) ?? {}
  const definition = asRecord(asRecord(award.badge)?.record) ?? {}
  return {
    uri: asString(award.uri) ?? "",
    title: asString(definition.title) ?? "Badge",
    badgeType: asString(definition.badgeType),
    issuer: toActorCard(award.author),
    response: asString(award.responseStatus),
    createdAt: formatDate(asRecord(award.record)?.createdAt),
  }
}
