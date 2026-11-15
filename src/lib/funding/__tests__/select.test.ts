import { describe, it, expect } from "vitest"
import {
  bucketCounts,
  dailyTotals,
  destinationTotals,
  destinations,
  giftBoundsParam,
  giftSizeIndex,
  giftSizes,
  normalizeGiftBounds,
  parseGiftBounds,
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
import { continentFor, regionFor, shapeCenter } from "../geo"
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
      { uri: "at://did:plc:org/org.hypercerts.collection/a", owner: 0, title: "Forest", banner: null, avatar: null, lat: 10, lng: -70, place: null },
      { uri: "at://did:plc:org2/org.hypercerts.collection/b", owner: 1, title: "Reef", banner: null, avatar: null, lat: null, lng: null, place: null },
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

describe("destinations", () => {
  it("groups money by region, unplaced projects last", () => {
    const ds = dataset()
    const ids = [1, 2, 3]
    const dest = destinations(ds, "regions", projectTotals(ds, ids))
    const out = destinationTotals(ds, ids, dest).map((d) => [dest.names[d.dest], d.total, d.projects])
    // Project 0 sits in Venezuela; project 1 has no location.
    expect(out).toEqual([
      ["No location yet", 1500, 1],
      ["South America", 50, 1],
    ])
  })
  it("groups by continent", () => {
    const ds = dataset()
    const dest = destinations(ds, "continents", projectTotals(ds, [2, 3]))
    expect(destinationTotals(ds, [2, 3], dest).map((d) => dest.names[d.dest])).toEqual(["South America"])
  })
  it("names the largest projects, then the rest, then receipts with no project", () => {
    const ds = dataset()
    const ids = [0, 1, 2, 3]
    const dest = destinations(ds, "projects", projectTotals(ds, ids))
    expect(dest.names).toEqual(["Reef", "Forest", "Other projects", "No project"])
    expect([0, 1, 2, 3].map(dest.of)).toEqual([3, 0, 1, 1])
  })
})

describe("gift sizes", () => {
  it("buckets by the default boundaries", () => {
    expect([1, 24.99, 25, 99.99, 100, 999, 1000, 58000].map((a) => giftSizeIndex(a))).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })
  it("labels the default sizes as before", () => {
    expect(giftSizes().map((s) => s.label)).toEqual(["Under $25", "$25 to $99", "$100 to $999", "$1,000 and up"])
  })
  it("labels and buckets your own boundaries", () => {
    expect(giftSizes([10, 11, 5000]).map((s) => s.label)).toEqual(["Under $10", "$10", "$11 to $4,999", "$5,000 and up"])
    expect([9, 10, 10.5, 11, 6000].map((a) => giftSizeIndex(a, [10, 11, 5000]))).toEqual([0, 1, 1, 2, 3])
  })
  it("cleans boundaries: whole, positive, once each, sorted, at most six", () => {
    expect(normalizeGiftBounds([100, 25, 25, 0, -3, 99.6])).toEqual([25, 100])
    expect(normalizeGiftBounds([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5, 6])
  })
  it("reads and writes ?sizes=", () => {
    expect(parseGiftBounds("50-10-250")).toEqual([10, 50, 250])
    expect(parseGiftBounds("ten-50")).toBeNull()
    expect(parseGiftBounds("")).toBeNull()
    expect(parseGiftBounds("0")).toBeNull()
    expect(giftBoundsParam([25, 100, 1000])).toBeNull()
    expect(giftBoundsParam([10, 50])).toBe("10-50")
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
  it("places points in regions a little smaller than continents", () => {
    const at: [number, number, string, string][] = [
      [-37.8, 175.3, "Australia & New Zealand", "Oceania"], // Waikato
      [-21.2, -175.2, "Pacific Islands", "Oceania"], // Tonga, across the date line
      [7.7, 134.6, "Pacific Islands", "Oceania"], // Palau
      [32.2, -111.0, "US & Canada", "North America"], // Tucson
      [29.0, -109.2, "Central America & Caribbean", "North America"], // Sonora
      [25.05, -77.35, "Central America & Caribbean", "North America"], // Nassau
      [9.9, -84.1, "Central America & Caribbean", "North America"], // San José
      [-0.4, -90.4, "South America", "South America"], // Galápagos
      [8.6, -71.1, "South America", "South America"], // Mérida
      [51.5, -0.1, "Europe", "Europe"], // London
      [35.9, 14.4, "Europe", "Europe"], // Malta
      [36.8, 10.2, "Middle East & North Africa", "Africa"], // Tunis
      [32.1, 35.2, "Middle East & North Africa", "Asia"], // Farkha
      [6.5, 3.4, "West & Central Africa", "Africa"], // Lagos
      [0.3, 32.6, "East & Southern Africa", "Africa"], // Kampala
      [43.2, 76.9, "Central Asia", "Asia"], // Almaty
      [23.8, 90.4, "South Asia", "Asia"], // Dhaka
      [3.6, 98.7, "Southeast Asia", "Asia"], // Medan
      [35.7, 139.7, "East Asia", "Asia"], // Tokyo
    ]
    expect(at.map(([lat, lng]) => [regionFor(lat, lng), continentFor(lat, lng)])).toEqual(
      at.map(([, , region, continent]) => [region, continent]),
    )
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
