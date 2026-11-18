import { describe, expect, it } from "vitest"
import {
  fundingByline,
  mergeRecordReceipts,
  shownSentence,
  summarizeRecordFunding,
} from "../record-funding"
import type { FundingReceipt } from "@/lib/atproto/indexer"
import { GAINFOREST_DID, MA_EARTH_DID } from "../trusted-sources"

function receipt(over: Partial<FundingReceipt> & { uri: string }): FundingReceipt {
  return {
    cid: "c",
    did: MA_EARTH_DID,
    createdAt: null,
    occurredAt: null,
    amount: "10",
    currency: "USD",
    from: null,
    to: null,
    forUri: null,
    forCid: null,
    paymentRail: null,
    paymentNetwork: null,
    transactionId: null,
    notes: null,
    matchingReceipt: null,
    attestations: [],
    ...over,
  }
}

describe("mergeRecordReceipts", () => {
  it("de-duplicates by URI and sorts newest first", () => {
    const a = receipt({ uri: "at://x/r/a", occurredAt: "2026-01-01T00:00:00Z" })
    const b = receipt({ uri: "at://x/r/b", occurredAt: "2026-03-01T00:00:00Z" })
    const c = receipt({ uri: "at://x/r/c", createdAt: "2026-02-01T00:00:00Z" })
    const merged = mergeRecordReceipts([[a, b], [b, c]])
    expect(merged.map((r) => r.uri)).toEqual(["at://x/r/b", "at://x/r/c", "at://x/r/a"])
  })
})

describe("summarizeRecordFunding", () => {
  it("sums dollars, counts named funders once and anonymous gifts apart", () => {
    const s = summarizeRecordFunding([
      receipt({ uri: "1", amount: "20.00", from: { kind: "account", did: "did:plc:a" } }),
      receipt({ uri: "2", amount: "5.50", from: { kind: "account", did: "did:plc:a" } }),
      receipt({ uri: "3", amount: "100", currency: "usd", from: { kind: "text", value: "Jo" } }),
      receipt({ uri: "4", amount: "1", from: null }),
      receipt({ uri: "5", amount: "12.5", currency: "USDC", from: null }),
    ])
    expect(s.gifts).toBe(5)
    expect(s.total).toBe(126.5)
    expect(s.primaryGifts).toBe(4)
    expect(s.funders).toBe(2)
    expect(s.anonymous).toBe(2)
    expect(s.others).toEqual([{ currency: "USDC", total: 12.5, count: 1 }])
  })

  it("lists the Confirmed-by buckets the gifts fall in, in display order", () => {
    const s = summarizeRecordFunding([
      receipt({
        uri: "1",
        attestations: [
          { role: "sender", did: "did:plc:a" },
          { role: "recipient", did: "did:plc:b" },
        ],
      }),
      receipt({ uri: "2", attestations: [{ role: "third-party", did: MA_EARTH_DID }] }),
    ])
    expect(s.confirmedBy).toEqual(["ma-earth", "both"])
  })

  it("names GainForest as its own source, not another publisher", () => {
    const s = summarizeRecordFunding([
      receipt({ uri: "1", did: GAINFOREST_DID, attestations: [{ role: "third-party", did: GAINFOREST_DID }] }),
      receipt({ uri: "2", attestations: [{ role: "third-party", did: "did:plc:someone" }] }),
      receipt({ uri: "3", attestations: [{ role: "third-party", did: MA_EARTH_DID }] }),
    ])
    expect(s.confirmedBy).toEqual(["ma-earth", "gainforest", "other"])
  })

  it("ignores amounts that aren't numbers", () => {
    const s = summarizeRecordFunding([receipt({ uri: "1", amount: "lots" }), receipt({ uri: "2", amount: null })])
    expect(s.total).toBe(0)
    expect(s.gifts).toBe(2)
  })
})

describe("fundingByline", () => {
  const base = summarizeRecordFunding([])
  it("says who gave", () => {
    expect(fundingByline({ ...base, gifts: 64, funders: 46, anonymous: 17 })).toBe(
      "64 gifts from 46 funders and anonymous donors",
    )
    expect(fundingByline({ ...base, gifts: 2, funders: 1, anonymous: 0 })).toBe(
      "2 gifts from 1 funder",
    )
    expect(fundingByline({ ...base, gifts: 3, funders: 0, anonymous: 3 })).toBe(
      "3 gifts, all anonymous",
    )
    expect(fundingByline({ ...base, gifts: 1, funders: 0, anonymous: 1 })).toBe(
      "1 anonymous gift",
    )
  })
})

describe("shownSentence", () => {
  it("says what the default filter shows, naming each source", () => {
    expect(shownSentence(new Set(["ma-earth", "gainforest", "both"]))).toBe(
      "Showing gifts recorded by Ma Earth and GainForest, or confirmed by both sides.",
    )
  })

  it("names the source that is on", () => {
    expect(shownSentence(new Set(["gainforest"]))).toBe("Showing gifts recorded by GainForest.")
    expect(shownSentence(new Set(["ma-earth", "both"]))).toBe(
      "Showing gifts recorded by Ma Earth or confirmed by both sides.",
    )
  })

  it("names picked accounts and an empty selection", () => {
    expect(shownSentence(new Set(["sender"]), 1)).toBe(
      "Showing gifts published only by the funder or confirmed by the account you picked.",
    )
    expect(shownSentence(new Set())).toBe(
      "The filter shows nothing. Turn on a source to see gifts.",
    )
  })
})
