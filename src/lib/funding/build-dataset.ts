import "server-only"

import { resolvePdsUrl } from "@/lib/atproto/did"
import { guardedFetch } from "@/lib/security/ssrf"
import { parseLocationShape } from "@/lib/atproto/location"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { confirmBuckets } from "@/lib/atproto/funding-provenance"
import type { FundingAttestation } from "@/lib/atproto/indexer"
import { TRUSTED_FUNDING_SOURCES, isTrustedFundingSource } from "./trusted-sources"
import { regionFor, shapeCenter } from "./geo"
import {
  BUCKET_BOTH,
  BUCKET_OTHER,
  BUCKET_RECIPIENT,
  BUCKET_SENDER,
  BUCKET_TRUSTED,
  type FundingAccount,
  type FundingDataset,
  type FundingProject,
} from "./dataset-types"

/**
 * Builds the /funding dataset (see `dataset-types.ts`).
 *
 *  1. Every trusted source's receipts, read from its own repository. The
 *     indexer holds them too, but paging it is slow and has stopped early
 *     before; the repository is the record of truth and pages quickly.
 *  2. Every other receipt, from the indexer. It cannot filter out an author,
 *     so the scan is split into createdAt ranges that run in parallel. A
 *     receipt that confirms a trusted source's receipt (its
 *     `matchingReceipt`) is folded into that receipt instead of listed.
 *  3. Recipients, projects and project locations, from the indexer, with
 *     location blobs read from the owner's repository.
 *
 * Slow (tens of seconds) and meant to run behind the route's cache.
 */

const RECEIPT_NSID = "org.hypercerts.funding.receipt"
const PROJECT_NSID = "org.hypercerts.collection"
const INDEXER_URL =
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-prod.up.railway.app/graphql"

const PDS_TIMEOUT_MS = 15_000
const INDEXER_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null
}

/** A party (`from`/`to`) as written in a record or served by the indexer. */
function partyOf(v: unknown): { did: string } | { text: string } | null {
  const o = asRecord(v)
  if (!o) return null
  const did = asString(o.did)
  if (did) return { did }
  const text = asString(o.value)
  if (text) return { text }
  return null
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1)
}

function didOf(uri: string): string {
  return uri.slice(5, uri.indexOf("/", 5))
}

function parseAmount(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function toUnix(iso: unknown): number {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? Math.round(t / 1000) : 0
}

const pdsCache = new Map<string, Promise<string | null>>()
function pdsFor(did: string): Promise<string | null> {
  let p = pdsCache.get(did)
  if (!p) {
    p = resolvePdsUrl(did).catch(() => null)
    pdsCache.set(did, p)
    // Don't pin a failed lookup for the life of the instance.
    p.then((v) => {
      if (!v) pdsCache.delete(did)
    })
  }
  return p
}

async function getJson<T>(url: string, timeoutMs = PDS_TIMEOUT_MS): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await guardedFetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        headers: { accept: "application/json" },
      })
      if (res.ok) return (await res.json()) as T
      if (res.status < 500) return null
    } catch {
      // retry once
    }
  }
  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One indexer query. Sends the app's rate-limit bypass key when set (as the
 * /api/indexer proxy does): the scan is hundreds of requests from one
 * egress IP, which the indexer's per-IP limiter otherwise throttles. A 429
 * or 5xx is retried with backoff (honouring Retry-After).
 */
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  const bypassKey = process.env.INDEXER_RATELIMIT_BYPASS_KEY
  if (bypassKey) headers["X-RateLimit-Bypass"] = bypassKey
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 600 * 2 ** (attempt - 1)) + Math.random() * 300)
    try {
      const res = await fetch(INDEXER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(INDEXER_TIMEOUT_MS),
        cache: "no-store",
      })
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after"))
        if (Number.isFinite(wait) && wait > 0) await sleep(Math.min(wait, 10) * 1000)
        continue
      }
      if (!res.ok) {
        if (res.status < 500) return null
        continue
      }
      const body = (await res.json()) as {
        data?: T
        errors?: { message: string; extensions?: { code?: string } }[]
      }
      if (body.data) return body.data
      const err = body.errors?.[0]
      if (err) {
        // A throttle or timeout reported as a GraphQL error is worth a retry;
        // anything else is a query problem that won't fix itself.
        if (/rate|limit|timeout|unavailable/i.test(`${err.extensions?.code ?? ""} ${err.message}`)) continue
        console.warn("[funding] indexer error:", err.message)
        return null
      }
    } catch {
      // network error or timeout: retry
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 1. Trusted sources, from their repositories
// ---------------------------------------------------------------------------

interface RepoRecord {
  uri: string
  cid: string
  value: Record<string, unknown>
}

interface ListRecordsPage {
  records?: RepoRecord[]
  cursor?: string
}

/**
 * Every record of a collection in one repository. Walks from both ends at
 * once (newest-first and oldest-first) and stops where the two meet, which
 * halves the wall time of a cursor-only API.
 */
async function listAllRecords(
  pds: string,
  did: string,
  collection: string,
): Promise<{ records: RepoRecord[]; complete: boolean }> {
  const byRkey = new Map<string, RepoRecord>()
  const base = `${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&limit=100`
  let downCursor: string | undefined
  let upCursor: string | undefined
  let downDone = false
  let upDone = false
  // Lowest rkey reached walking down, highest walking up.
  let downLow: string | null = null
  let upHigh: string | null = null

  while (!downDone || !upDone) {
    const [down, up] = await Promise.all([
      downDone
        ? null
        : getJson<ListRecordsPage>(base + (downCursor ? `&cursor=${encodeURIComponent(downCursor)}` : "")),
      upDone
        ? null
        : getJson<ListRecordsPage>(
            base + "&reverse=true" + (upCursor ? `&cursor=${encodeURIComponent(upCursor)}` : ""),
          ),
    ])
    if ((!downDone && !down) || (!upDone && !up)) {
      return { records: [...byRkey.values()], complete: false }
    }
    for (const r of down?.records ?? []) {
      const k = rkeyOf(r.uri)
      byRkey.set(k, r)
      if (downLow === null || k < downLow) downLow = k
    }
    for (const r of up?.records ?? []) {
      const k = rkeyOf(r.uri)
      byRkey.set(k, r)
      if (upHigh === null || k > upHigh) upHigh = k
    }
    if (!downDone) {
      downCursor = down?.cursor
      if (!downCursor || (down?.records?.length ?? 0) === 0) downDone = true
    }
    if (!upDone) {
      upCursor = up?.cursor
      if (!upCursor || (up?.records?.length ?? 0) === 0) upDone = true
    }
    // The walks have met: everything in between is covered.
    if (downLow !== null && upHigh !== null && downLow <= upHigh) break
  }
  return { records: [...byRkey.values()], complete: true }
}

// ---------------------------------------------------------------------------
// 2. Everything else, from the indexer
// ---------------------------------------------------------------------------

interface IndexerReceiptNode {
  uri: string
  did: string
  createdAt: string | null
  occurredAt: string | null
  amount: string | null
  currency: string | null
  from: { did?: string | null; value?: string | null } | null
  to: { did?: string | null; value?: string | null } | null
  for: { uri: string | null } | null
  matchingReceipt: { uri: string | null } | null
  attestations: { role: string | null; did: string | null }[] | null
}

const ISO_RE = /^[0-9:.TZ+-]+$/

/** The receipts query for one createdAt range. The bounds are inlined (they
 *  come from our own records and are checked against ISO_RE) so the query
 *  doesn't depend on the name of the indexer's filter input type. */
function receiptsInRangeQuery(range: { gte?: string; lt?: string }): string {
  const parts: string[] = []
  if (range.gte && ISO_RE.test(range.gte)) parts.push(`gte: "${range.gte}"`)
  if (range.lt && ISO_RE.test(range.lt)) parts.push(`lt: "${range.lt}"`)
  const where = parts.length ? `, where: { createdAt: { ${parts.join(", ")} } }` : ""
  return `
    query FundingDatasetReceipts($first: Int!, $after: String) {
      orgHypercertsFundingReceipt(first: $first, after: $after${where}) {
        edges {
          node {
            uri did createdAt occurredAt amount currency
            from { ... on AppCertifiedDefsDid { did } ... on OrgHypercertsFundingReceiptText { value } }
            to { ... on AppCertifiedDefsDid { did } ... on OrgHypercertsFundingReceiptText { value } }
            for { uri }
            matchingReceipt { uri }
            attestations { role did }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
}

interface ReceiptsPage {
  orgHypercertsFundingReceipt?: {
    edges: { node: IndexerReceiptNode | null }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  } | null
}

/**
 * Every receipt the indexer holds that no trusted source authored. The
 * boundaries split the scan into createdAt ranges of roughly equal size
 * (taken from the trusted receipts, which are nearly all of them), paged in
 * parallel.
 */
async function fetchOtherReceipts(
  boundaries: string[],
): Promise<{ nodes: IndexerReceiptNode[]; complete: boolean }> {
  const ranges: { gte?: string; lt?: string }[] = []
  for (let i = 0; i <= boundaries.length; i++) {
    ranges.push({
      ...(i > 0 ? { gte: boundaries[i - 1] } : {}),
      ...(i < boundaries.length ? { lt: boundaries[i] } : {}),
    })
  }
  let complete = true
  const parts = await mapLimit(ranges, 4, async (range) => {
    const out: IndexerReceiptNode[] = []
    const query = receiptsInRangeQuery(range)
    let after: string | null = null
    for (let page = 0; page < 400; page++) {
      const data: ReceiptsPage | null = await gql<ReceiptsPage>(query, { first: 100, after })
      const conn: ReceiptsPage["orgHypercertsFundingReceipt"] = data?.orgHypercertsFundingReceipt
      if (!conn) {
        complete = false
        break
      }
      for (const e of conn.edges) {
        if (e.node && !isTrustedFundingSource(e.node.did)) out.push(e.node)
      }
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
      after = conn.pageInfo.endCursor
    }
    return out
  })
  const seen = new Set<string>()
  const nodes: IndexerReceiptNode[] = []
  for (const n of parts.flat()) {
    if (seen.has(n.uri)) continue
    seen.add(n.uri)
    nodes.push(n)
  }
  return { nodes, complete }
}

// ---------------------------------------------------------------------------
// 3. Hydration: accounts, projects, locations
// ---------------------------------------------------------------------------

type ImageNode = {
  __typename?: string
  uri?: string | null
  image?: { ref?: string | null } | null
} | null

function imageUrl(did: string, node: ImageNode): string | null {
  if (!node) return null
  if (node.uri && /^https:\/\//.test(node.uri)) return node.uri
  const ref = node.image?.ref
  return ref ? buildAvatarUrlFromCid(did, ref) : null
}

const PROFILES = `
  query FundingDatasetProfiles($dids: [String!]!) {
    appCertifiedActorProfile(first: 100, where: { did: { in: $dids } }) {
      edges { node {
        did displayName
        avatar { __typename ... on OrgHypercertsDefsUri { uri } ... on OrgHypercertsDefsSmallImage { image { ref } } }
      } }
    }
  }
`

async function fetchAccounts(dids: string[]): Promise<Map<string, FundingAccount>> {
  const out = new Map<string, FundingAccount>()
  await mapLimit(chunk(dids, 100), 2, async (batch) => {
    const data = await gql<{
      appCertifiedActorProfile?: {
        edges: { node: { did: string; displayName: string | null; avatar: ImageNode } | null }[]
      } | null
    }>(PROFILES, { dids: batch })
    for (const e of data?.appCertifiedActorProfile?.edges ?? []) {
      const n = e.node
      if (!n) continue
      out.set(n.did, { did: n.did, name: n.displayName ?? null, avatar: imageUrl(n.did, n.avatar) })
    }
  })
  return out
}

const COLLECTIONS = `
  query FundingDatasetProjects($uris: [String!]!) {
    orgHypercertsCollection(first: 50, where: { uri: { in: $uris } }) {
      edges { node {
        uri did title
        location { uri }
        avatar { __typename ... on OrgHypercertsDefsUri { uri } ... on OrgHypercertsDefsSmallImage { image { ref } } }
        banner { __typename ... on OrgHypercertsDefsUri { uri } ... on OrgHypercertsDefsLargeImage { image { ref } } }
      } }
    }
  }
`

interface ProjectNode {
  uri: string
  did: string
  title: string | null
  location: { uri: string | null } | null
  avatar: ImageNode
  banner: ImageNode
}

async function fetchProjects(uris: string[]): Promise<Map<string, ProjectNode>> {
  const out = new Map<string, ProjectNode>()
  await mapLimit(chunk(uris, 50), 2, async (batch) => {
    const data = await gql<{ orgHypercertsCollection?: { edges: { node: ProjectNode | null }[] } | null }>(
      COLLECTIONS,
      { uris: batch },
    )
    for (const e of data?.orgHypercertsCollection?.edges ?? []) {
      if (e.node) out.set(e.node.uri, e.node)
    }
  })
  return out
}

const LOCATIONS = `
  query FundingDatasetLocations($uris: [String!]!) {
    appCertifiedLocation(first: 50, where: { uri: { in: $uris } }) {
      edges { node {
        uri did name locationType
        location {
          __typename
          ... on AppCertifiedLocationString { string }
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallBlob { blob { ref } }
        }
      } }
    }
  }
`

interface LocationNode {
  uri: string
  did: string
  name: string | null
  locationType: string | null
  location: { __typename?: string; string?: string | null; uri?: string | null; blob?: { ref?: string | null } | null } | null
}

/** Location blobs are content-addressed, so a parsed point never changes. */
const blobPointCache = new Map<string, { lat: number; lng: number } | null>()

async function locationPoint(node: LocationNode): Promise<{ lat: number; lng: number } | null> {
  const type = node.locationType ?? undefined
  const loc = node.location
  if (!loc) return null
  const inline = loc.string ?? loc.uri ?? null
  if (inline) {
    const shape = parseLocationShape(type, inline)
    return shape ? shapeCenter(shape) : null
  }
  const cid = loc.blob?.ref
  if (!cid || !/^[A-Za-z0-9]+$/.test(cid)) return null
  if (blobPointCache.has(cid)) return blobPointCache.get(cid) ?? null
  const pds = await pdsFor(node.did)
  if (!pds) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await guardedFetch(
        `${pds.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(node.did)}&cid=${cid}`,
        { signal: AbortSignal.timeout(10_000), redirect: "error" },
      )
      if (!res.ok) {
        if (res.status < 500) break
        continue
      }
      const text = (await res.text()).slice(0, 200_000)
      const shape = parseLocationShape(type, text)
      const point = shape ? shapeCenter(shape) : null
      blobPointCache.set(cid, point)
      return point
    } catch {
      // retry once
    }
  }
  return null
}

async function fetchLocations(uris: string[]): Promise<Map<string, { lat: number; lng: number; name: string | null }>> {
  const nodes: LocationNode[] = []
  await mapLimit(chunk(uris, 50), 2, async (batch) => {
    const data = await gql<{ appCertifiedLocation?: { edges: { node: LocationNode | null }[] } | null }>(
      LOCATIONS,
      { uris: batch },
    )
    for (const e of data?.appCertifiedLocation?.edges ?? []) if (e.node) nodes.push(e.node)
  })
  const out = new Map<string, { lat: number; lng: number; name: string | null }>()
  await mapLimit(nodes, 8, async (node) => {
    const p = await locationPoint(node)
    if (p && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180) {
      out.set(node.uri, { ...p, name: node.name })
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

interface Row {
  /** Attestations to ship: confirmations for a trusted row, the full list
   *  otherwise. */
  attestations: [string, FundingAttestation["role"]][]
  author: string
  rkey: string
  t: number
  amount: number
  currency: string
  forUri: string | null
  to: { did: string } | { text: string } | null
  from: { did: string } | { text: string } | null
  buckets: number
}

function bucketBits(attestations: readonly FundingAttestation[]): number {
  let bits = 0
  for (const b of confirmBuckets(attestations)) {
    bits |=
      b === "trusted"
        ? BUCKET_TRUSTED
        : b === "both"
          ? BUCKET_BOTH
          : b === "sender"
            ? BUCKET_SENDER
            : b === "recipient"
              ? BUCKET_RECIPIENT
              : BUCKET_OTHER
  }
  return bits
}

function roleOf(author: string, from: Row["from"], to: Row["to"]): FundingAttestation["role"] {
  if (to && "did" in to && to.did === author) return "recipient"
  if (from && "did" in from && from.did === author) return "sender"
  return "third-party"
}

export async function buildFundingDataset(): Promise<FundingDataset> {
  let partial = false

  // 1. Trusted sources.
  const trustedRows: Row[] = []
  const sources: FundingDataset["sources"] = []
  const createdAts: string[] = []
  for (const source of TRUSTED_FUNDING_SOURCES) {
    const pds = await pdsFor(source.did)
    if (!pds) {
      partial = true
      sources.push({ did: source.did, name: source.name, count: 0 })
      continue
    }
    const { records, complete } = await listAllRecords(pds, source.did, RECEIPT_NSID)
    if (!complete) partial = true
    for (const r of records) {
      const v = r.value
      const forUri = asString(asRecord(v.for)?.uri)
      const createdAt = asString(v.createdAt)
      if (createdAt) createdAts.push(createdAt)
      trustedRows.push({
        author: source.did,
        rkey: rkeyOf(r.uri),
        t: toUnix(v.occurredAt) || toUnix(v.createdAt),
        amount: parseAmount(v.amount),
        currency: (asString(v.currency) ?? "").toUpperCase(),
        forUri,
        to: partyOf(v.to),
        from: partyOf(v.from),
        buckets: BUCKET_TRUSTED,
        attestations: [],
      })
    }
    sources.push({ did: source.did, name: source.name, count: records.length })
  }

  // 2. Everything else. Range boundaries every ~1,000 trusted receipts.
  createdAts.sort()
  const boundaries: string[] = []
  for (let i = 1000; i < createdAts.length; i += 1000) {
    const b = createdAts[i]
    if (b !== boundaries[boundaries.length - 1]) boundaries.push(b)
  }
  const { nodes, complete } = await fetchOtherReceipts(boundaries)
  if (!complete) partial = true

  const trustedIndex = new Map<string, number>()
  trustedRows.forEach((r, i) => trustedIndex.set(`at://${r.author}/${RECEIPT_NSID}/${r.rkey}`, i))
  const confirmationsByRow = new Map<number, [string, FundingAttestation["role"]][]>()
  const otherByUri = new Map(nodes.map((n) => [n.uri, n]))
  const otherRows: Row[] = []
  for (const n of nodes) {
    const from = partyOf(n.from)
    const to = partyOf(n.to)
    const target = n.matchingReceipt?.uri ?? null
    // A confirmation of a trusted source's receipt: fold it in.
    if (target && trustedIndex.has(target)) {
      const i = trustedIndex.get(target)!
      const list = confirmationsByRow.get(i) ?? []
      list.push([n.did, roleOf(n.did, from, to)])
      confirmationsByRow.set(i, list)
      continue
    }
    // A confirmation of another listed receipt: that one carries the
    // cluster's attestations, so skip this copy.
    if (target && otherByUri.has(target) && target !== n.uri) continue
    const attestations: FundingAttestation[] = []
    for (const a of n.attestations ?? []) {
      if (a.did && (a.role === "sender" || a.role === "recipient" || a.role === "third-party")) {
        attestations.push({ did: a.did, role: a.role })
      }
    }
    if (attestations.length === 0) attestations.push({ did: n.did, role: roleOf(n.did, from, to) })
    otherRows.push({
      author: n.did,
      rkey: rkeyOf(n.uri),
      t: toUnix(n.occurredAt) || toUnix(n.createdAt),
      amount: parseAmount(n.amount),
      currency: (n.currency ?? "").toUpperCase(),
      forUri: n.for?.uri ?? null,
      to,
      from,
      buckets: bucketBits(attestations),
      attestations: attestations.map((a) => [a.did, a.role]),
    })
  }
  for (const [i, list] of confirmationsByRow) {
    const r = trustedRows[i]
    const attestations: FundingAttestation[] = list.map(([did, role]) => ({ did, role }))
    attestations.push({ did: r.author, role: "third-party" })
    r.buckets = bucketBits(attestations)
    r.attestations = list
  }

  const rows = [...trustedRows, ...otherRows].sort((a, b) => b.t - a.t)

  // 3. Hydrate.
  const projectUris = [
    ...new Set(
      rows.map((r) => r.forUri).filter((u): u is string => !!u && u.includes(`/${PROJECT_NSID}/`)),
    ),
  ]
  const projectNodes = await fetchProjects(projectUris)
  const locationUris = [
    ...new Set(
      [...projectNodes.values()].map((p) => p.location?.uri).filter((u): u is string => !!u),
    ),
  ]
  const accountDids = new Set<string>()
  for (const r of rows) if (r.to && "did" in r.to) accountDids.add(r.to.did)
  for (const uri of projectUris) accountDids.add(didOf(uri))
  for (const s of TRUSTED_FUNDING_SOURCES) accountDids.add(s.did)
  const [accountMap, locations] = await Promise.all([
    fetchAccounts([...accountDids]),
    fetchLocations(locationUris),
  ])

  // Tables.
  const accounts: FundingAccount[] = []
  const accountIndex = new Map<string, number>()
  const accountOf = (did: string) => {
    let i = accountIndex.get(did)
    if (i === undefined) {
      i = accounts.length
      accounts.push(accountMap.get(did) ?? { did, name: null, avatar: null })
      accountIndex.set(did, i)
    }
    return i
  }
  const projects: FundingProject[] = []
  const projectIndex = new Map<string, number>()
  for (const uri of projectUris) {
    const node = projectNodes.get(uri)
    const owner = didOf(uri)
    const loc = node?.location?.uri ? locations.get(node.location.uri) : undefined
    projectIndex.set(uri, projects.length)
    projects.push({
      uri,
      owner: accountOf(owner),
      title: node?.title ?? null,
      banner: node ? imageUrl(owner, node.banner) : null,
      avatar: node ? imageUrl(owner, node.avatar) : null,
      lat: loc ? Math.round(loc.lat * 1e4) / 1e4 : null,
      lng: loc ? Math.round(loc.lng * 1e4) / 1e4 : null,
      place: loc?.name ?? null,
      region: loc ? regionFor(loc.lat, loc.lng) : null,
    })
  }
  const currencies: string[] = []
  const currencyIndex = new Map<string, number>()
  const authors: string[] = []
  const authorIndex = new Map<string, number>()
  const donors: string[] = []
  const donorIndex = new Map<string, number>()
  const index = <K>(map: Map<K, number>, list: K[], key: K) => {
    let i = map.get(key)
    if (i === undefined) {
      i = list.length
      list.push(key)
      map.set(key, i)
    }
    return i
  }

  const ds: FundingDataset = {
    builtAt: new Date().toISOString(),
    sources,
    currencies,
    authors,
    accounts,
    donors,
    projects,
    receipts: { rkey: [], author: [], t: [], amount: [], currency: [], project: [], to: [], from: [], buckets: [] },
    toText: {},
    fromText: {},
    forUri: {},
    attestations: {},
    partial,
  }
  const cols = ds.receipts
  rows.forEach((r, i) => {
    cols.rkey.push(r.rkey)
    cols.author.push(index(authorIndex, authors, r.author))
    cols.t.push(r.t)
    cols.amount.push(Math.round(r.amount * 100) / 100)
    cols.currency.push(index(currencyIndex, currencies, r.currency))
    const p = r.forUri ? projectIndex.get(r.forUri) : undefined
    cols.project.push(p ?? -1)
    if (p === undefined && r.forUri) ds.forUri[i] = r.forUri
    if (r.to && "did" in r.to) cols.to.push(accountOf(r.to.did))
    else {
      cols.to.push(-1)
      if (r.to) ds.toText[i] = r.to.text
    }
    if (!r.from) cols.from.push(-1)
    else if ("did" in r.from) cols.from.push(index(donorIndex, donors, r.from.did))
    else {
      cols.from.push(-2)
      ds.fromText[i] = r.from.text
    }
    cols.buckets.push(r.buckets)
    if (r.attestations.length) ds.attestations[i] = r.attestations
  })
  return ds
}
