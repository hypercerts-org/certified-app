// Read queries against the Hypercerts API.
//
// Every page, route handler and embed reads through these functions; nothing
// else talks to the API. They call the XRPC endpoints with @atproto/lex and
// bindings generated from the API's own lexicons. When the Hypercerts SDK
// ships its read layer, only the bodies of these functions should change.
import "server-only"

import { type l, xrpc, xrpcSafe } from "@atproto/lex"
import { cacheLife, cacheTag } from "next/cache"

import getOrganization from "@/lexicons/app/certified/actor/getOrganization"
import getProfile from "@/lexicons/app/certified/actor/getProfile"
import listOrganizations from "@/lexicons/app/certified/actor/listOrganizations"
import searchOrganizations from "@/lexicons/app/certified/actor/searchOrganizations"
import listBadgeAwards from "@/lexicons/app/certified/badge/listBadgeAwards"
import listActivities from "@/lexicons/org/hypercerts/claim/listActivities"
import getCollection from "@/lexicons/org/hypercerts/collection/getCollection"
import listCollectionItems from "@/lexicons/org/hypercerts/collection/listCollectionItems"
import listCollections from "@/lexicons/org/hypercerts/collection/listCollections"

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

const API_URL = process.env.HYPERCERTS_API_URL ?? "https://api.hypercerts.dev"
// Response validation is off for reads. Indexed records come from many authors,
// and some do not match their lexicon (for example a Leaflet description
// missing its $type). With validation on, one such record fails the whole
// page. The view mappers in ./views read fields defensively instead. Writes
// should keep strict validation.
const read = () => ({
  signal: AbortSignal.timeout(8_000),
  validateResponse: false,
})

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

  const profile = await xrpcSafe(API_URL, getProfile, {
    params: { actor: actor as l.AtIdentifierString },
    ...read(),
  })
  if (!profile.success) return null

  // getProfile accepts a handle or DID; getOrganization needs the DID and fails
  // for accounts without an organization record (people).
  const did = profile.body.profile.did
  const organization = await xrpcSafe(API_URL, getOrganization, {
    params: { actor: did },
    ...read(),
  })
  return toActorDetail(
    organization.success
      ? organization.body.actor
      : { did, profile: profile.body.profile },
  )
}

export async function listActivitiesPage(options: {
  author?: string
  cursor?: string
  limit?: number
}): Promise<Page<ActivityCard>> {
  "use cache"
  publicData(options.author ? `activities:${options.author}` : "activities")

  const { body } = await xrpc(API_URL, listActivities, {
    params: {
      authors: options.author ? [options.author as Did] : undefined,
      cursor: options.cursor,
      limit: options.limit ?? 10,
    },
    ...read(),
  })
  return {
    items: body.activities.map(toActivityCard),
    cursor: body.cursor ?? null,
  }
}

export async function listProjectsPage(options: {
  author: string
  cursor?: string
}): Promise<Page<ProjectCard>> {
  "use cache"
  publicData(`projects:${options.author}`)

  const { body } = await xrpc(API_URL, listCollections, {
    params: {
      authors: [options.author as Did],
      types: ["project"],
      cursor: options.cursor,
      limit: 10,
    },
    ...read(),
  })
  return {
    items: body.collections.map(toProjectCard),
    cursor: body.cursor ?? null,
  }
}

export async function getProject(uri: string): Promise<ProjectDetail | null> {
  "use cache"
  publicData(`project:${uri}`)

  const result = await xrpcSafe(API_URL, getCollection, {
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

  const { body } = await xrpc(API_URL, listCollectionItems, {
    params: {
      collection: options.project as AtUri,
      cursor: options.cursor,
      limit: 10,
    },
    ...read(),
  })
  // Collection items can reference activities, nested collections or other
  // records; the spike shows activities only.
  const activities = body.items
    .map((item) => item.record)
    .filter((record) =>
      (record as { $type?: string } | null)?.$type?.endsWith("#activityView"),
    )
  return { items: activities.map(toActivityCard), cursor: body.cursor ?? null }
}

export async function listOrganizationsPage(options: {
  query?: string
  cursor?: string
}): Promise<Page<ActorCard>> {
  "use cache"
  publicData("organizations")

  const params = { cursor: options.cursor, limit: 12 }
  const { body } = options.query
    ? await xrpc(API_URL, searchOrganizations, {
        params: { ...params, search: options.query },
        ...read(),
      })
    : await xrpc(API_URL, listOrganizations, { params, ...read() })
  return { items: body.actors.map(toActorCard), cursor: body.cursor ?? null }
}

export async function listBadgesReceived(did: string): Promise<BadgeCard[]> {
  "use cache"
  publicData(`badges:${did}`)

  const { body } = await xrpc(API_URL, listBadgeAwards, {
    params: { subjects: [did], limit: 20 },
    ...read(),
  })
  return body.badgeAwards.map(toBadgeCard)
}
