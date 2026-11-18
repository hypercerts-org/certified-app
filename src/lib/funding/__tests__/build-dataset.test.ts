import { beforeEach, describe, expect, it, vi } from "vitest"
import { GAINFOREST_DID, MA_EARTH_DID } from "../trusted-sources"
import {
  BUCKET_OTHER,
  BUCKET_RECIPIENT,
  BUCKET_SENDER,
  BUCKET_TRUSTED,
  receiptUri,
  sourceBucket,
  type FundingDataset,
} from "../dataset-types"
import { bucketCounts, roleMask, selectReceipts } from "../select"

// Building the /funding dataset with two trusted sources: each source's
// receipts come from its own repository with its own bucket bit, the
// indexer's copies of them are skipped, and nothing a source recorded is
// counted as another publisher's.

const RECEIPT = "org.hypercerts.funding.receipt"
const ORG = "did:plc:org"
const DONOR = "did:plc:donor"
const BOT = "did:plc:bot"
const PROJECT = `at://${ORG}/org.hypercerts.collection/p1`

const net = vi.hoisted(() => ({
  repos: {} as Record<string, { uri: string; cid: string; value: Record<string, unknown> }[]>,
  indexer: [] as Record<string, unknown>[],
  noPds: new Set<string>(),
}))

vi.mock("@/lib/atproto/server-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atproto/server-fetch")>()
  const receiptsPage = (nodes: Record<string, unknown>[]) => ({
    orgHypercertsFundingReceipt: {
      edges: nodes.map((node) => ({ node })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  })
  return {
    ...actual,
    pdsFor: vi.fn(async (did: string) => (net.noPds.has(did) ? null : "https://pds.test")),
    getJson: vi.fn(async (url: string) => {
      const repo = new URL(url).searchParams.get("repo") ?? ""
      return { records: net.repos[repo] ?? [] }
    }),
    gqlQuery: vi.fn(async (query: string) =>
      query.includes("FundingDatasetReceipts")
        ? { data: receiptsPage(net.indexer.slice(0, 1)), error: null }
        : { data: null, error: "unexpected" },
    ),
    gql: vi.fn(async (query: string) => {
      if (query.includes("FundingDatasetReceipts")) return receiptsPage(net.indexer)
      if (query.includes("FundingDatasetProfiles")) {
        return {
          appCertifiedActorProfile: {
            edges: [{ node: { did: ORG, displayName: "River Trust", avatar: null } }],
          },
        }
      }
      if (query.includes("FundingDatasetProjects")) {
        return {
          orgHypercertsCollection: {
            edges: [
              {
                node: { uri: PROJECT, did: ORG, title: "Mangroves", location: null, avatar: null, banner: null },
              },
            ],
          },
        }
      }
      return null
    }),
    getRecordFromRepo: vi.fn(async () => null),
  }
})

vi.mock("@/lib/security/ssrf", () => ({
  guardedFetch: vi.fn(async () => {
    throw new Error("no network in tests")
  }),
}))

const repoRecord = (did: string, rkey: string, value: Record<string, unknown>) => ({
  uri: `at://${did}/${RECEIPT}/${rkey}`,
  cid: `cid-${rkey}`,
  value: { $type: RECEIPT, createdAt: "2026-10-01T00:00:00Z", ...value },
})

const node = (did: string, rkey: string, over: Record<string, unknown> = {}) => ({
  uri: `at://${did}/${RECEIPT}/${rkey}`,
  did,
  createdAt: "2026-10-02T00:00:00Z",
  occurredAt: null,
  amount: "5",
  currency: "USD",
  from: null,
  to: null,
  for: null,
  matchingReceipt: null,
  attestations: [],
  ...over,
})

function indexOf(ds: FundingDataset, did: string, rkey: string): number {
  const uri = `at://${did}/${RECEIPT}/${rkey}`
  for (let i = 0; i < ds.receipts.rkey.length; i++) if (receiptUri(ds, i) === uri) return i
  return -1
}

beforeEach(() => {
  net.noPds.clear()
  net.repos = {
    [MA_EARTH_DID]: [
      repoRecord(MA_EARTH_DID, "ma1", {
        amount: "30",
        currency: "USD",
        occurredAt: "2026-10-01T10:00:00Z",
        from: { did: DONOR },
        to: { did: ORG },
        for: { uri: PROJECT, cid: "p" },
      }),
      repoRecord(MA_EARTH_DID, "ma2", { amount: "20", currency: "USD" }),
    ],
    [GAINFOREST_DID]: [
      repoRecord(GAINFOREST_DID, "gf1", {
        amount: "10",
        currency: "usd",
        to: { $type: `${RECEIPT}#text`, value: "0xabc" },
      }),
      repoRecord(GAINFOREST_DID, "gf2", { amount: "20", currency: "USDC" }),
    ],
  }
  net.indexer = [
    // The indexer's copies of the sources' own receipts: read from the
    // repositories instead.
    node(GAINFOREST_DID, "gf1", { attestations: [{ role: "third-party", did: GAINFOREST_DID }] }),
    node(MA_EARTH_DID, "ma1", { attestations: [{ role: "third-party", did: MA_EARTH_DID }] }),
    // The recipient confirming Ma Earth's receipt: folded into it.
    node(ORG, "c1", {
      to: { did: ORG },
      matchingReceipt: { uri: `at://${MA_EARTH_DID}/${RECEIPT}/ma1` },
      attestations: [{ role: "recipient", did: ORG }],
    }),
    // Someone else's receipt: another publisher.
    node(BOT, "b1", { attestations: [{ role: "third-party", did: BOT }] }),
    // A funder's receipt GainForest confirmed.
    node(DONOR, "d1", {
      from: { did: DONOR },
      attestations: [
        { role: "sender", did: DONOR },
        { role: "third-party", did: GAINFOREST_DID },
      ],
    }),
  ]
})

async function build(): Promise<FundingDataset> {
  const { buildFundingDataset } = await import("../build-dataset")
  return buildFundingDataset()
}

describe("buildFundingDataset with two trusted sources", () => {
  it("reads each source from its own repository and counts it by name", async () => {
    const ds = await build()
    expect(ds.partial).toBe(false)
    expect(ds.sources).toEqual([
      { did: MA_EARTH_DID, name: "Ma Earth", count: 2 },
      { did: GAINFOREST_DID, name: "GainForest", count: 2 },
    ])
    // Two receipts per source, plus the bot's and the funder's; the
    // indexer's copies and the folded confirmation are not listed again.
    expect(ds.receipts.rkey).toHaveLength(6)
  })

  it("gives a source's receipts its own bit, never Other publishers", async () => {
    const ds = await build()
    const gf = sourceBucket(GAINFOREST_DID)
    const ma = sourceBucket(MA_EARTH_DID)
    for (const rkey of ["gf1", "gf2"]) {
      const bits = ds.receipts.buckets[indexOf(ds, GAINFOREST_DID, rkey)]
      expect(bits).toBe(BUCKET_TRUSTED | gf)
      expect(bits & BUCKET_OTHER).toBe(0)
    }
    expect(ds.receipts.buckets[indexOf(ds, MA_EARTH_DID, "ma2")]).toBe(BUCKET_TRUSTED | ma)
    expect(ds.receipts.buckets[indexOf(ds, BOT, "b1")]).toBe(BUCKET_OTHER)
    expect(ds.receipts.buckets[indexOf(ds, DONOR, "d1")]).toBe(BUCKET_SENDER | BUCKET_TRUSTED | gf)
  })

  it("folds a confirmation into the source's receipt", async () => {
    const ds = await build()
    const i = indexOf(ds, MA_EARTH_DID, "ma1")
    expect(ds.receipts.buckets[i]).toBe(BUCKET_TRUSTED | sourceBucket(MA_EARTH_DID) | BUCKET_RECIPIENT)
    expect(ds.attestations[i]).toEqual([[ORG, "recipient"]])
    expect(ds.projects.map((p) => p.title)).toEqual(["Mangroves"])
  })

  it("counts and selects each source on its own", async () => {
    const ds = await build()
    expect(bucketCounts(ds)).toEqual({
      "ma-earth": 2,
      gainforest: 3,
      both: 0,
      sender: 1,
      recipient: 1,
      other: 1,
    })
    const other = selectReceipts(ds, roleMask(new Set(["other"])))
    expect(other.map((i) => ds.authors[ds.receipts.author[i]])).toEqual([BOT])
    const gainforest = selectReceipts(ds, roleMask(new Set(["gainforest"])))
    expect(gainforest).toHaveLength(3)
    expect(ds.currencies[ds.receipts.currency[indexOf(ds, GAINFOREST_DID, "gf1")]]).toBe("USD")
  })

  it("still reads the other source when one can't be reached", async () => {
    net.noPds.add(GAINFOREST_DID)
    const ds = await build()
    expect(ds.partial).toBe(true)
    expect(ds.sources).toEqual([
      { did: MA_EARTH_DID, name: "Ma Earth", count: 2 },
      { did: GAINFOREST_DID, name: "GainForest", count: 0 },
    ])
    expect(indexOf(ds, MA_EARTH_DID, "ma2")).toBeGreaterThanOrEqual(0)
    expect(indexOf(ds, GAINFOREST_DID, "gf1")).toBe(-1)
  })
})
