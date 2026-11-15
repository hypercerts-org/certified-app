import "server-only"

import { DEFAULT_HIDDEN_CERT_LABELS, DEFAULT_HIDDEN_ORG_LABELS } from "@/lib/atproto/labels"
import {
  asRecord,
  asString,
  chunk,
  didOf,
  getRecordFromRepo,
  gql,
  mapLimit,
  pdsFor,
  recordImage,
  rkeyOf,
  type ImageNode,
} from "@/lib/atproto/server-fetch"
import { getBlobRefLink } from "@/lib/atproto/types"
import { guardedFetch } from "@/lib/security/ssrf"
import { countryAt, countryName, nearestCountry } from "./countries"
import type { MapAccount, MapActivity, MapDataset, MapOrg, MapPlace, MapPolygon, MapProject } from "./dataset-types"
import { cleanPlaceName, readPlace } from "./places"

/**
 * Builds the /map dataset (see `dataset-types.ts`).
 *
 *  1. Activities, projects, organizations and places from the indexer, in
 *     parallel, with the app's default label filters (no test or draft).
 *  2. Most places keep their coordinates in an attached file the indexer
 *     can't read, so each file is downloaded from its owner's server. Files
 *     are content-addressed, so a downloaded one is kept for the life of the
 *     instance.
 *  3. Each place is read (`places.ts`), given a precision and a country,
 *     and joined to what points to it.
 *
 * Slow on a cold start (about a minute: thousands of small files) and meant
 * to run behind the route's cache.
 */

const HIDDEN_CERT = JSON.stringify([...DEFAULT_HIDDEN_CERT_LABELS])
const HIDDEN_ORG = JSON.stringify([...DEFAULT_HIDDEN_ORG_LABELS])
/** Stop downloading files after this long and serve what we have. */
const FILE_BUDGET_MS = 150_000
const FILE_TIMEOUT_MS = 10_000
const MAX_FILE_BYTES = 300_000

interface Page<N> {
  edges: { node: N | null }[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

/** Every page of one indexer query. `complete` is false if a page failed. */
async function allPages<N>(root: string, query: string): Promise<{ nodes: N[]; complete: boolean }> {
  const nodes: N[] = []
  let after: string | null = null
  for (let i = 0; i < 400; i++) {
    const data: Record<string, Page<N> | null> | null = await gql<Record<string, Page<N> | null>>(query, { after })
    const page: Page<N> | null | undefined = data?.[root]
    if (!page) return { nodes, complete: false }
    for (const e of page.edges) if (e.node) nodes.push(e.node)
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return { nodes, complete: true }
    after = page.pageInfo.endCursor
  }
  return { nodes, complete: false }
}

interface ActivityNode {
  uri: string
  did: string
  title: string | null
  startDate: string | null
  createdAt: string | null
  locations: { uri: string | null }[] | null
}
const ACTIVITIES = `
  query MapActivities($after: String) {
    orgHypercertsClaimActivity(first: 100, after: $after, excludeLabels: ${HIDDEN_CERT}, excludeAuthorLabels: ${HIDDEN_ORG}) {
      edges { node { uri did title startDate createdAt locations { uri } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface ProjectNode {
  uri: string
  did: string
  title: string | null
  location: { uri: string | null } | null
  items: { itemIdentifier: { uri: string | null } | null }[] | null
}
const PROJECTS = `
  query MapProjects($after: String) {
    orgHypercertsCollection(first: 100, after: $after, where: { type: { eqi: "project" } }, excludeAuthorLabels: ${HIDDEN_ORG}) {
      edges { node { uri did title location { uri } items { itemIdentifier { uri } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface OrgNode {
  did: string
  location: { uri: string | null } | null
}
const ORGS = `
  query MapOrganizations($after: String) {
    appCertifiedActorOrganization(first: 100, after: $after, excludeLabels: ${HIDDEN_ORG}) {
      edges { node { did location { uri } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface LocationNode {
  uri: string
  did: string
  name: string | null
  locationType: string | null
  location: { string?: string | null; uri?: string | null; blob?: { ref?: string | null } | null } | null
}
const LOCATIONS = `
  query MapLocations($after: String) {
    appCertifiedLocation(first: 100, after: $after, excludeAuthorLabels: ${HIDDEN_ORG}) {
      edges { node {
        uri did name locationType
        location {
          __typename
          ... on AppCertifiedLocationString { string }
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallBlob { blob { ref } }
        }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const PROFILES = `
  query MapProfiles($dids: [String!]!) {
    appCertifiedActorProfile(first: 100, where: { did: { in: $dids } }) {
      edges { node {
        did displayName
        avatar { __typename ... on OrgHypercertsDefsUri { uri } ... on OrgHypercertsDefsSmallImage { image { ref } } }
      } }
    }
  }
`

/** A place the indexer doesn't hold yet, read from its owner's repository. */
async function locationFromRepo(uri: string): Promise<LocationNode | null> {
  const v = await getRecordFromRepo(uri)
  if (!v) return null
  const loc = asRecord(v.location)
  const blobRef = asRecord(loc?.blob)?.ref
  return {
    uri,
    did: didOf(uri),
    name: asString(v.name),
    locationType: asString(v.locationType),
    location: loc
      ? { string: asString(loc.string), uri: asString(loc.uri), blob: blobRef ? { ref: getBlobRefLink(blobRef) } : null }
      : null,
  }
}

/** Attached files by content id; content-addressed, so never stale. */
const fileCache = new Map<string, string | null>()

/** A file's text; null if it is gone for good, undefined if its server
 *  couldn't be reached (counted as unplaceable this time, retried next build). */
async function fileText(did: string, cid: string): Promise<string | null | undefined> {
  if (fileCache.has(cid)) return fileCache.get(cid)
  if (!/^[A-Za-z0-9]+$/.test(cid)) return undefined
  const pds = await pdsFor(did)
  if (!pds) return undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await guardedFetch(
        `${pds.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${cid}`,
        { signal: AbortSignal.timeout(FILE_TIMEOUT_MS), redirect: "error" },
      )
      if (!res.ok) {
        // Gone for good (deleted, or never uploaded): remember that.
        if (res.status < 500) {
          fileCache.set(cid, null)
          return null
        }
        continue
      }
      const text = (await res.text()).slice(0, MAX_FILE_BYTES)
      fileCache.set(cid, text)
      return text
    } catch {
      // retry once
    }
  }
  return undefined
}

/** An account with only the fields it has; a repository image as its
 *  content id (the client builds the URL), an https image as its URL. */
function account(did: string, name: string | null | undefined, avatar: ImageNode): MapAccount {
  const a: MapAccount = { did }
  const n = name?.trim()
  if (n) a.name = n
  if (avatar?.uri && /^https:\/\//.test(avatar.uri)) a.avatar = avatar.uri
  else if (avatar?.image?.ref) a.avatar = avatar.image.ref
  return a
}

async function fetchAccounts(dids: string[]): Promise<Map<string, MapAccount>> {
  const out = new Map<string, MapAccount>()
  await mapLimit(chunk(dids, 100), 3, async (batch) => {
    const data = await gql<{
      appCertifiedActorProfile?: { edges: { node: { did: string; displayName: string | null; avatar: ImageNode } | null }[] } | null
    }>(PROFILES, { dids: batch })
    for (const e of data?.appCertifiedActorProfile?.edges ?? []) {
      const n = e.node
      if (n) out.set(n.did, account(n.did, n.displayName, n.avatar))
    }
  })
  // Profiles the indexer hasn't picked up yet, from the owners' repositories.
  const missing = dids.filter((d) => !out.get(d)?.name)
  await mapLimit(missing.slice(0, 300), 8, async (did) => {
    const v = await getRecordFromRepo(`at://${did}/app.certified.actor.profile/self`)
    if (asString(v?.displayName)) out.set(did, account(did, asString(v?.displayName), recordImage(v?.avatar)))
  })
  return out
}

export async function buildMapDataset(): Promise<MapDataset> {
  const started = Date.now()
  let partial = false

  // 1. Records.
  const [acts, projs, orgList, locs] = await Promise.all([
    allPages<ActivityNode>("orgHypercertsClaimActivity", ACTIVITIES),
    allPages<ProjectNode>("orgHypercertsCollection", PROJECTS),
    allPages<OrgNode>("appCertifiedActorOrganization", ORGS),
    allPages<LocationNode>("appCertifiedLocation", LOCATIONS),
  ])
  if (!acts.complete || !projs.complete || !orgList.complete || !locs.complete) partial = true

  const locByUri = new Map(locs.nodes.map((n) => [n.uri, n]))
  const referenced = new Set<string>()
  for (const a of acts.nodes) for (const l of a.locations ?? []) if (l.uri) referenced.add(l.uri)
  for (const p of projs.nodes) if (p.location?.uri) referenced.add(p.location.uri)
  for (const o of orgList.nodes) if (o.location?.uri) referenced.add(o.location.uri)

  // Places something points to that the indexer doesn't have.
  const missing = [...referenced].filter((u) => !locByUri.has(u) && u.startsWith("at://"))
  await mapLimit(missing.slice(0, 400), 8, async (uri) => {
    const n = await locationFromRepo(uri)
    if (n) locByUri.set(uri, n)
  })

  // 2. Attached files.
  const deadline = started + FILE_BUDGET_MS
  const texts = new Map<string, string | null>()
  const nodes = [...locByUri.values()]
  await mapLimit(nodes, 16, async (n) => {
    const loc = n.location
    if (!loc) return
    const inline = loc.string ?? loc.uri ?? null
    if (inline) {
      texts.set(n.uri, inline)
      return
    }
    const cid = loc.blob?.ref
    if (!cid) return
    if (Date.now() > deadline) {
      // Out of time: serve what we have, marked partial, and try again soon.
      partial = true
      return
    }
    const t = await fileText(n.did, cid)
    if (t !== undefined) texts.set(n.uri, t)
  })

  // 3. Read every place.
  const accounts: MapAccount[] = []
  const accountIndex = new Map<string, number>()
  const accountOf = (did: string) => {
    let i = accountIndex.get(did)
    if (i === undefined) {
      i = accounts.length
      accountIndex.set(did, i)
      accounts.push({ did })
    }
    return i
  }
  const countries: string[] = []
  const countryIndex = new Map<number, number>()
  const countryOf = (feature: number) => {
    if (feature < 0) return -1
    let i = countryIndex.get(feature)
    if (i === undefined) {
      i = countries.length
      countryIndex.set(feature, i)
      countries.push(countryName(feature) ?? "")
    }
    return i
  }

  const places: MapPlace[] = []
  const areas: MapPolygon[][] = []
  const placeIndex = new Map<string, number>()
  const placeUris: string[] = []
  let unplaceable = 0
  for (const n of nodes) {
    const r = readPlace({ locationType: n.locationType, text: texts.get(n.uri) ?? null, name: n.name })
    if (!r.ok) {
      unplaceable++
      continue
    }
    let feature = countryAt(r.lng, r.lat)
    if (feature < 0) feature = nearestCountry(r.lng, r.lat, 1.5)
    let area = -1
    if (r.polygons && r.polygons.length > 0) {
      area = areas.length
      areas.push(r.polygons)
    }
    placeIndex.set(n.uri, places.length)
    const place: MapPlace = { lng: round(r.lng), lat: round(r.lat), prec: r.prec, account: accountOf(n.did) }
    const name = cleanPlaceName(n.name)
    if (name) place.name = name
    const country = countryOf(feature)
    if (country >= 0) place.country = country
    if (area >= 0) place.area = area
    if (r.km2 !== null) place.km2 = Math.round(r.km2 * 1e4) / 1e4
    if (r.radiusKm !== null) place.radiusKm = Math.round(r.radiusKm * 100) / 100
    places.push(place)
    placeUris.push(n.uri)
  }
  const placeOf = (uri: string | null | undefined) => (uri ? (placeIndex.get(uri) ?? -1) : -1)

  // 4. Join.
  const projectOfActivity = new Map<string, string>()
  for (const p of projs.nodes) {
    for (const it of p.items ?? []) {
      const u = it.itemIdentifier?.uri
      if (u && u.includes("/org.hypercerts.claim.activity/") && !projectOfActivity.has(u)) projectOfActivity.set(u, p.uri)
    }
  }
  const projByUri = new Map(projs.nodes.map((p) => [p.uri, p]))
  const projects: MapProject[] = []
  const projectIndex = new Map<string, number>()
  const addProject = (p: ProjectNode) => {
    let i = projectIndex.get(p.uri)
    if (i === undefined) {
      i = projects.length
      projectIndex.set(p.uri, i)
      projects.push({ rkey: rkeyOf(p.uri), title: p.title?.trim() || null, account: accountOf(p.did), place: placeOf(p.location?.uri) })
    }
    return i
  }
  for (const p of projs.nodes) if (placeOf(p.location?.uri) >= 0) addProject(p)

  const activities: MapActivity[] = []
  for (const a of acts.nodes) {
    const own = (a.locations ?? []).map((l) => placeOf(l.uri)).filter((i) => i >= 0)
    const projUri = projectOfActivity.get(a.uri)
    const proj = projUri ? projByUri.get(projUri) : undefined
    const projPlaced = proj ? placeOf(proj.location?.uri) >= 0 : false
    if (own.length === 0 && !projPlaced) continue
    activities.push({
      rkey: rkeyOf(a.uri),
      title: a.title?.trim() || null,
      account: accountOf(a.did),
      place: own[0] ?? -1,
      more: own.slice(1),
      project: proj ? addProject(proj) : -1,
      date: (a.startDate ?? a.createdAt ?? "").slice(0, 10) || null,
    })
  }

  const orgs: MapOrg[] = []
  for (const o of orgList.nodes) {
    const place = placeOf(o.location?.uri)
    if (place >= 0) orgs.push({ account: accountOf(o.did), place })
  }

  const used = new Set<number>()
  for (const a of activities) {
    if (a.place >= 0) used.add(a.place)
    for (const m of a.more) used.add(m)
  }
  for (const p of projects) if (p.place >= 0) used.add(p.place)
  for (const o of orgs) used.add(o.place)
  const unused: number[] = []
  // Only places from the indexer count as unused: one fetched because
  // something pointed to it is used by definition.
  for (let i = 0; i < places.length; i++) if (!used.has(i) && !referenced.has(placeUris[i])) unused.push(i)

  // 5. Names and pictures.
  const byDid = await fetchAccounts(accounts.map((a) => a.did))
  for (const a of accounts) {
    const found = byDid.get(a.did)
    if (found?.name) a.name = found.name
    if (found?.avatar) a.avatar = found.avatar
  }

  return {
    generatedAt: new Date().toISOString(),
    partial,
    accounts,
    countries,
    places,
    areas,
    activities,
    projects,
    orgs,
    unused,
    totals: { activities: acts.nodes.length, projects: projs.nodes.length, orgs: orgList.nodes.length, unplaceable },
  }
}

const round = (v: number) => Math.round(v * 1e6) / 1e6
