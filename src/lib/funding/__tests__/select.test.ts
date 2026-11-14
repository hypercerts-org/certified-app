import { describe, it, expect } from "vitest"
import {
  bucketCounts,
  dailyTotals,
  flowData,
  giftSizeIndex,
  primaryRole,
  projectTotals,
  roleMask,
  selectReceipts,
  selectionSentence,
  summarize,
} from "../select"
import {
  BUCKET_BOTH,
  BUCKET_OTHER,
  BUCKET_RECIPIENT,
  BUCKET_TRUSTED,
  type FundingDataset,
} from "../dataset-types"
import { regionFor, shapeCenter } from "../geo"
import type { ConfirmRole } from "@/lib/atproto/funding-provenance"

const DAY = 86_400

/** Four receipts: two trusted USD gifts to project 0 (one anonymous), one
 *  both-sides USD gift to project 1, one other-publisher USDC payment. */
function dataset(): FundingDataset {
  return {
    builtAt: "2026-11-14T00:00:00Z",
    sources: [{ did: "did:plc:src", name: "Ma Earth", count: 2 }],
    currencies: ["USD", "USDC"],
    authors: ["did:plc:src", "did:plc:org", "did:plc:bot"],
    accounts: [
      { did: "did:plc:org", name: "Trees", avatar: null },
      { did: "did:plc:org2", name: "Reefs", avatar: null },
    ],
    donors: ["did:plc:donor"],
    projects: [
      { uri: "at://did:plc:org/org.hypercerts.collection/a", owner: 0, title: "Forest", banner: null, avatar: null, lat: 10, lng: -70, place: null, region: "Americas" },
      { uri: "at://did:plc:org2/org.hypercerts.collection/b", owner: 1, title: "Reef", banner: null, avatar: null, lat: null, lng: null, place: null, region: null },
    ],
    receipts: {
      rkey: ["r4", "r3", "r2", "r1"],
      author: [2, 1, 0, 0],
      t: [10 * DAY + 5, 9 * DAY, 2 * DAY + 60, 2 * DAY],
      amount: [5, 1500, 20, 30],
      currency: [1, 0, 0, 0],
      project: [-1, 1, 0, 0],
      to: [-1, 1, 0, 0],
      from: [-2, 0, -1, 0],
      buckets: [BUCKET_OTHER, BUCKET_BOTH, BUCKET_TRUSTED, BUCKET_TRUSTED | BUCKET_RECIPIENT],
    },
    toText: { "0": "0xabc" },
    fromText: { "0": "0xdef" },
    forUri: {},
    attestations: {},
    partial: false,
  }
}

const roles = (...r: ConfirmRole[]) => new Set<ConfirmRole>(r)

describe("selectReceipts", () => {
  it("keeps receipts in any selected bucket, newest first", () => {
    const ds = dataset()
    expect(selectReceipts(ds, roleMask(roles("trusted", "both")))).toEqual([1, 2, 3])
    expect(selectReceipts(ds, roleMask(roles("recipient")))).toEqual([3])
    expect(selectReceipts(ds, roleMask(roles()))).toEqual([])
  })
})

describe("bucketCounts", () => {
  it("counts a receipt in every bucket it is in", () => {
    expect(bucketCounts(dataset())).toEqual({ trusted: 2, both: 1, sender: 0, recipient: 1, other: 1 })
  })
})

describe("summarize", () => {
  it("totals the primary currency and lists the others apart", () => {
    const ds = dataset()
    const s = summarize(ds, [0, 1, 2, 3])
    expect(s.count).toBe(4)
    expect(s.total).toBe(1550)
    expect(s.projects).toBe(2)
    expect(s.namedDonors).toBe(1)
    expect(s.anonymous).toBe(1)
    expect(s.others).toEqual([{ currency: "USDC", total: 5, count: 1 }])
  })
})

describe("projectTotals", () => {
  it("sums per project, largest first, primary currency only", () => {
    const t = projectTotals(dataset(), [0, 1, 2, 3])
    expect(t.map((x) => [x.project, x.total, x.count, x.donors, x.anonymous])).toEqual([
      [1, 1500, 1, 1, 0],
      [0, 50, 2, 1, 1],
    ])
  })
})

describe("dailyTotals", () => {
  it("groups by UTC day", () => {
    expect(dailyTotals(dataset(), [1, 2, 3])).toEqual([
      { day: 2, count: 2, total: 50 },
      { day: 9, count: 1, total: 1500 },
    ])
  })
})

describe("flowData", () => {
  it("splits money by gift size and region, unplaced projects apart", () => {
    const f = flowData(dataset(), [1, 2, 3])
    expect(f.total).toBe(1550)
    expect(f.sizes.map((s) => s.count)).toEqual([1, 1, 0, 1])
    // Americas (index 0) holds project 0; "none" (last) holds project 1.
    expect(f.regionTotals[0]).toBe(50)
    expect(f.regionTotals[f.regionTotals.length - 1]).toBe(1500)
  })
})

describe("giftSizeIndex", () => {
  it("buckets by the size boundaries", () => {
    expect([1, 24.99, 25, 99.99, 100, 999, 1000, 58000].map(giftSizeIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })
})

describe("primaryRole", () => {
  it("prefers both sides, then the trusted source", () => {
    expect(primaryRole(BUCKET_BOTH | BUCKET_TRUSTED)).toBe("both")
    expect(primaryRole(BUCKET_TRUSTED | BUCKET_RECIPIENT)).toBe("trusted")
    expect(primaryRole(BUCKET_OTHER)).toBe("other")
  })
})

describe("selectionSentence", () => {
  it("says what the default shows", () => {
    expect(selectionSentence(roles("trusted", "both"), 14886)).toBe(
      "Showing 14,886 receipts recorded by Ma Earth or confirmed by both sides.",
    )
  })
  it("says when nothing is on", () => {
    expect(selectionSentence(roles(), 0)).toMatch(/Nothing is switched on/)
  })
})

describe("geo", () => {
  it("places points in rough regions", () => {
    expect(regionFor(-37.8, 175.3)).toBe("Oceania") // Waikato
    expect(regionFor(3.6, 98.7)).toBe("Asia") // Medan
    expect(regionFor(0.3, 32.6)).toBe("Africa") // Kampala
    expect(regionFor(51.5, -0.1)).toBe("Europe") // London
    expect(regionFor(9.9, -84.1)).toBe("Americas") // San José
  })
  it("centres a polygon on its outer ring", () => {
    const ring = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
      { lat: 0, lng: 0 },
    ]
    expect(shapeCenter({ kind: "polygon", rings: [ring] })).toEqual({ lat: 1, lng: 1 })
  })
})
