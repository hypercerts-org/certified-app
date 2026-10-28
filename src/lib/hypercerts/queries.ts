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
  getOrganizations,
  getProfile,
  getProfiles,
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
  awardSubject,
  type BadgeCard,
  collectionOf,
  didOf,
  type Network,
  type NetworkMember,
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

// Networks
//
// An organization forms a network by awarding badges: a funder, fellowship or
// platform awards its badges to member accounts and projects. The API has no
// endpoint for a network's size or programmes, so networkSource pages through
// every award the account has issued, once per cache lifetime, and keeps a
// plain summary. Large networks are cut off at MAX_NETWORK_AWARDS.
const MAX_NETWORK_AWARDS = 2_000
const MEMBERS_SHOWN = 8

type NetworkSource = {
  awards: { badge: string; subject: string }[]
  definitions: Record<
    string,
    { title: string; badgeType: string | null; owner: string }
  >
  truncated: boolean
}

async function networkSource(did: string): Promise<NetworkSource> {
  "use cache"
  publicData(`network:${did}`)

  const source: NetworkSource = {
    awards: [],
    definitions: {},
    truncated: false,
  }
  let cursor: string | undefined
  do {
    const page = await api.call(
      listBadgeAwards,
      { authors: [did as Did], limit: 100, cursor },
      read(),
    )
    for (const award of page.badgeAwards) {
      const subject = awardSubject(award.record.subject)
      const badge = award.record.badge.uri
      if (!subject) continue
      source.awards.push({ badge, subject })
      source.definitions[badge] ??= {
        title: award.badge?.record.title || "Untitled badge",
        badgeType: award.badge?.record.badgeType ?? null,
        owner: award.badge?.did ?? didOf(badge),
      }
    }
    cursor = page.cursor
  } while (cursor && source.awards.length < MAX_NETWORK_AWARDS)
  source.truncated = Boolean(cursor)
  return source
}

export async function isNetwork(did: string): Promise<boolean> {
  "use cache"
  publicData(`network:${did}`)

  const { badgeAwards } = await api.call(
    listBadgeAwards,
    { authors: [did as Did], limit: 1 },
    read(),
  )
  return badgeAwards.length > 0
}

function chunks<T>(items: T[], size = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

// Organizations come with their profile; accounts without an organization
// record (people) need a second lookup for theirs.
async function actorCards(dids: string[]): Promise<Map<string, ActorCard>> {
  const cards = new Map<string, ActorCard>()
  for (const batch of chunks(dids)) {
    const { organizations } = await api.call(
      getOrganizations,
      { actors: batch as Did[] },
      read(),
    )
    for (const result of organizations)
      if (result.organization)
        cards.set(result.actor, toActorCard(result.organization))
    const people = batch.filter((did) => !cards.has(did))
    if (people.length === 0) continue
    const { profiles } = await api.call(
      getProfiles,
      { actors: people as Did[] },
      read(),
    )
    for (const result of profiles)
      cards.set(
        result.actor,
        toActorCard({
          did: result.actor,
          profile: result.profile,
          organization: null,
        }),
      )
  }
  return cards
}

async function projectCards(uris: string[]): Promise<Map<string, ProjectCard>> {
  const cards = new Map<string, ProjectCard>()
  for (const batch of chunks(uris)) {
    const { collections } = await api.call(
      listCollections,
      { uris: batch as AtUri[], limit: 100 },
      read(),
    )
    for (const collection of collections)
      cards.set(collection.uri, toProjectCard(collection))
  }
  return cards
}

export async function getNetwork(did: string): Promise<Network | null> {
  "use cache"
  publicData(`network:${did}`)

  const source = await networkSource(did)
  if (source.awards.length === 0) return null

  const subjectsByBadge = new Map<string, Set<string>>()
  for (const { badge, subject } of source.awards) {
    const subjects = subjectsByBadge.get(badge) ?? new Set<string>()
    subjects.add(subject)
    subjectsByBadge.set(badge, subjects)
  }
  const grouped = [...subjectsByBadge].sort((a, b) => b[1].size - a[1].size)
  const shown = grouped.flatMap(([, subjects]) =>
    [...subjects].slice(0, MEMBERS_SHOWN),
  )

  const definers = Object.values(source.definitions)
    .map((definition) => definition.owner)
    .filter((owner) => owner !== did)
  const actors = await actorCards([
    ...new Set([...shown.filter((s) => s.startsWith("did:")), ...definers]),
  ])
  const projects = await projectCards(
    shown.filter((s) => collectionOf(s) === "org.hypercerts.collection"),
  )

  const member = (subject: string): NetworkMember => {
    const actor = actors.get(subject)
    if (actor) return { kind: "actor", actor }
    const project = projects.get(subject)
    if (project) return { kind: "project", project }
    return subject.startsWith("did:")
      ? {
          kind: "actor",
          actor: toActorCard({
            did: subject as Did,
            profile: null,
            organization: null,
          }),
        }
      : { kind: "record", uri: subject }
  }

  return {
    did,
    awardCount: source.awards.length,
    memberCount: new Set(source.awards.map((a) => a.subject)).size,
    truncated: source.truncated,
    programmes: grouped.map(([uri, subjects]) => {
      const definition = source.definitions[uri]
      return {
        uri,
        title: definition.title,
        badgeType: definition.badgeType,
        definedBy:
          definition.owner === did
            ? null
            : (actors.get(definition.owner) ?? null),
        memberCount: subjects.size,
        members: [...subjects].slice(0, MEMBERS_SHOWN).map(member),
      }
    }),
  }
}

// Recent activities by a network's members: accounts it awarded, and the
// owners of projects it awarded. listActivities takes at most 100 authors, so
// only the most recently awarded 100 members are included.
export async function listNetworkActivitiesPage(options: {
  network: string
  cursor?: string
}): Promise<Page<ActivityCard>> {
  "use cache"
  publicData(`network:${options.network}`)

  const source = await networkSource(options.network)
  const authors = [
    ...new Set(
      source.awards.map(({ subject }) =>
        subject.startsWith("did:") ? subject : didOf(subject),
      ),
    ),
  ].slice(0, 100)
  if (authors.length === 0) return { items: [], cursor: null }

  const { activities, cursor } = await api.call(
    listActivities,
    { authors: authors as Did[], cursor: options.cursor, limit: 6 },
    read(),
  )
  return { items: activities.map(toActivityCard), cursor: cursor ?? null }
}
