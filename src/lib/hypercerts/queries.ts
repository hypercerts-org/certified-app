// Read queries against the Hypercerts API.
//
// Every page, route handler and embed reads through these functions; nothing
// else talks to the API. They call the XRPC endpoints with @atproto/lex and
// bindings generated from the API's own lexicons. When the Hypercerts SDK
// ships its read layer, only the bodies of these functions should change.
import "server-only"

import { Client, type l } from "@atproto/lex"
import { cacheLife, cacheTag } from "next/cache"

import {
  type ActivityView,
  getCollection,
  getOrganization,
  getProfile,
  listActivities,
  listBadgeAwards,
  listCollectionItems,
  listCollections,
  listOrganizations,
  searchOrganizations,
} from "./api"
import {
  type ActivityCard,
  type ActorCard,
  type ActorDetail,
  type BadgeCard,
  type Page,
  type ProjectCard,
  type ProjectDetail,
  toActivityCard,
  toActorCard,
  toActorDetail,
  toBadgeCard,
  toProjectCard,
  toProjectDetail,
} from "./views"

// Response validation is off for reads. Indexed records come from many authors,
// and some older ones do not match their lexicon (for example a description
// missing its $type). With validation on, one such record fails the whole
// response. Responses are still typed from the lexicons; the view mappers in
// ./views stay defensive only where the data is known to diverge. Writes
// should keep strict validation.
const api = new Client(
  process.env.HYPERCERTS_API_URL ?? "https://api.hypercerts.dev",
  { validateResponse: false },
)

const read = () => ({ signal: AbortSignal.timeout(8_000) })

// Public, indexed data: shared by every visitor, refreshed within about a minute.
// Next.js uses the same profile for the prerendered page and its ISR upgrade.
function publicData(...tags: string[]) {
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(...tags)
}

// Callers validate identifiers before they reach these functions (see
// src/lib/validate.ts); the casts only satisfy lex's branded string types.
type Did = l.DidString
type AtUri = l.AtUriString

export async function getActor(actor: string): Promise<ActorDetail | null> {
  "use cache"
  publicData(`actor:${actor}`)

  const profile = await api.xrpcSafe(getProfile, {
    params: { actor: actor as l.AtIdentifierString },
    ...read(),
  })
  if (!profile.success) return null

  // getProfile accepts a handle or DID; getOrganization needs the DID and fails
  // for accounts without an organization record (people).
  const did = profile.body.profile.did
  const organization = await api.xrpcSafe(getOrganization, {
    params: { actor: did },
    ...read(),
  })
  return toActorDetail(
    organization.success
      ? organization.body.actor
      : { did, profile: profile.body.profile, organization: null },
  )
}

export async function listActivitiesPage(options: {
  author?: string
  cursor?: string
  limit?: number
}): Promise<Page<ActivityCard>> {
  "use cache"
  publicData(options.author ? `activities:${options.author}` : "activities")

  const { activities, cursor } = await api.call(
    listActivities,
    {
      authors: options.author ? [options.author as Did] : undefined,
      cursor: options.cursor,
      limit: options.limit ?? 10,
    },
    read(),
  )
  return { items: activities.map(toActivityCard), cursor: cursor ?? null }
}

export async function listProjectsPage(options: {
  author: string
  cursor?: string
}): Promise<Page<ProjectCard>> {
  "use cache"
  publicData(`projects:${options.author}`)

  const { collections, cursor } = await api.call(
    listCollections,
    {
      authors: [options.author as Did],
      types: ["project"],
      cursor: options.cursor,
      limit: 10,
    },
    read(),
  )
  return { items: collections.map(toProjectCard), cursor: cursor ?? null }
}

export async function getProject(uri: string): Promise<ProjectDetail | null> {
  "use cache"
  publicData(`project:${uri}`)

  const result = await api.xrpcSafe(getCollection, {
    params: { uri: uri as AtUri },
    ...read(),
  })
  return result.success ? toProjectDetail(result.body.collection) : null
}

export async function listProjectActivitiesPage(options: {
  project: string
  cursor?: string
}): Promise<Page<ActivityCard>> {
  "use cache"
  publicData(`project:${options.project}`)

  const { items, cursor } = await api.call(
    listCollectionItems,
    {
      collection: options.project as AtUri,
      cursor: options.cursor,
      limit: 10,
    },
    read(),
  )
  // Collection items can reference activities, nested collections or other
  // records; the spike shows activities only.
  const activities = items
    .map((item) => item.record)
    .filter(
      (record): record is l.$Typed<ActivityView> =>
        record?.$type === "org.hypercerts.claim.getActivity#activityView",
    )
  return { items: activities.map(toActivityCard), cursor: cursor ?? null }
}

export async function listOrganizationsPage(options: {
  query?: string
  cursor?: string
}): Promise<Page<ActorCard>> {
  "use cache"
  publicData("organizations")

  const params = { cursor: options.cursor, limit: 12 }
  const { actors, cursor } = options.query
    ? await api.call(
        searchOrganizations,
        { ...params, search: options.query },
        read(),
      )
    : await api.call(listOrganizations, params, read())
  return { items: actors.map(toActorCard), cursor: cursor ?? null }
}

export async function listBadgesReceived(did: string): Promise<BadgeCard[]> {
  "use cache"
  publicData(`badges:${did}`)

  const { badgeAwards } = await api.call(
    listBadgeAwards,
    { subjects: [did], limit: 20 },
    read(),
  )
  return badgeAwards.map(toBadgeCard)
}
