import { describe, it, expect } from "vitest"
import {
  fundingPartyKey,
  receiptAuthorRole,
  sameClusterKeys,
  mergeMatchingReceipts,
} from "../funding-merge"
import type { FundingParty, FundingReceipt } from "../indexer"

const A = "did:plc:sender"
const B = "did:plc:recipient"
const acct = (did: string): FundingParty => ({ kind: "account", did })
const text = (value: string): FundingParty => ({ kind: "text", value })

function receipt(
  p: Partial<FundingReceipt> & { uri: string; did: string },
): FundingReceipt {
  return {
    uri: p.uri,
    cid: p.cid ?? `cid:${p.uri}`,
    did: p.did,
    createdAt: null,
    occurredAt: null,
    amount: p.amount ?? "1",
    currency: p.currency ?? "USDC",
    from: p.from ?? acct(A),
    to: p.to ?? acct(B),
    forUri: p.forUri ?? "at://act/1",
    forCid: p.forCid ?? "cid:act",
    paymentRail: null,
    paymentNetwork: null,
    transactionId: p.transactionId ?? null,
    notes: null,
    matchingReceipt: p.matchingReceipt ?? null,
    attestations: p.attestations ?? [],
  }
}

describe("fundingPartyKey", () => {
  it("keys an account by DID and text by value", () => {
    expect(fundingPartyKey(acct("did:plc:x"))).toBe("account:did:plc:x")
    expect(fundingPartyKey(text("0xWALLET"))).toBe("text:0xWALLET")
    expect(fundingPartyKey(null)).toBeNull()
  })
})

describe("receiptAuthorRole", () => {
  it("is recipient when author == to account", () => {
    expect(receiptAuthorRole({ did: B, from: acct(A), to: acct(B) })).toBe("recipient")
  })
  it("is sender when author == from account", () => {
    expect(receiptAuthorRole({ did: A, from: acct(A), to: acct(B) })).toBe("sender")
  })
  it("is third-party when author is neither", () => {
    expect(receiptAuthorRole({ did: "did:plc:x", from: acct(A), to: acct(B) })).toBe(
      "third-party",
    )
    // A wallet-text party never matches the author DID.
    expect(receiptAuthorRole({ did: B, from: acct(A), to: text("0xB") })).toBe(
      "third-party",
    )
  })
})

describe("sameClusterKeys", () => {
  it("true when amount/currency/from/to/for all match", () => {
    expect(sameClusterKeys(receipt({ uri: "a", did: A }), receipt({ uri: "b", did: B }))).toBe(
      true,
    )
  })
  it("false when any key differs", () => {
    expect(
      sameClusterKeys(
        receipt({ uri: "a", did: A, amount: "1" }),
        receipt({ uri: "b", did: B, amount: "2" }),
      ),
    ).toBe(false)
    expect(
      sameClusterKeys(
        receipt({ uri: "a", did: A, forUri: "at://act/1" }),
        receipt({ uri: "b", did: B, forUri: "at://act/2" }),
      ),
    ).toBe(false)
  })
  it("false when transactionId differs", () => {
    expect(
      sameClusterKeys(
        receipt({ uri: "a", did: A, transactionId: "0xAAA" }),
        receipt({ uri: "b", did: B, transactionId: "0xBBB" }),
      ),
    ).toBe(false)
  })
})

describe("mergeMatchingReceipts", () => {
  it("returns a single receipt unchanged", () => {
    const one = [receipt({ uri: "a", did: A })]
    expect(mergeMatchingReceipts(one)).toEqual(one)
  })

  it("collapses a confirmation pair into one row with both attestations", () => {
    const original = receipt({
      uri: "orig",
      did: A, // author is the sender
      attestations: [{ role: "sender", did: A }],
    })
    const confirmation = receipt({
      uri: "conf",
      did: B, // author is the recipient
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    const merged = mergeMatchingReceipts([original, confirmation])
    expect(merged).toHaveLength(1)
    // Representative is the recipient-authored receipt (indexer's canonical pick).
    expect(merged[0].uri).toBe("conf")
    expect(merged[0].matchingReceipt).toBeNull()
    expect(merged[0].attestations).toEqual([
      { role: "sender", did: A },
      { role: "recipient", did: B },
    ])
  })

  it("does NOT merge when cluster keys differ despite a matchingReceipt link", () => {
    const original = receipt({ uri: "orig", did: A, amount: "1" })
    const confirmation = receipt({
      uri: "conf",
      did: B,
      amount: "2", // mismatched amount
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    expect(mergeMatchingReceipts([original, confirmation])).toHaveLength(2)
  })

  it("does NOT merge when transactionId differs despite a matchingReceipt link", () => {
    const original = receipt({ uri: "orig", did: A, transactionId: "0xAAA" })
    const confirmation = receipt({
      uri: "conf",
      did: B,
      transactionId: "0xBBB", // mismatched transaction id
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    expect(mergeMatchingReceipts([original, confirmation])).toHaveLength(2)
  })

  it("merges a pair that shares the same transactionId", () => {
    const original = receipt({ uri: "orig", did: A, transactionId: "0xSAME" })
    const confirmation = receipt({
      uri: "conf",
      did: B,
      transactionId: "0xSAME",
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    expect(mergeMatchingReceipts([original, confirmation])).toHaveLength(1)
  })

  it("does NOT merge when matchingReceipt points at a receipt not in the list", () => {
    const confirmation = receipt({
      uri: "conf",
      did: B,
      matchingReceipt: { uri: "missing", cid: "cid:missing" },
    })
    expect(mergeMatchingReceipts([confirmation])).toHaveLength(1)
  })

  it("collapses a 3-receipt cluster (original + two confirmations)", () => {
    const original = receipt({ uri: "orig", did: A })
    const recip = receipt({
      uri: "conf-r",
      did: B,
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    const tp = receipt({
      uri: "conf-tp",
      did: "did:plc:eval",
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    const merged = mergeMatchingReceipts([original, recip, tp])
    expect(merged).toHaveLength(1)
    expect(merged[0].uri).toBe("conf-r") // recipient-authored representative
    expect(merged[0].attestations).toEqual([
      { role: "sender", did: A },
      { role: "recipient", did: B },
      { role: "third-party", did: "did:plc:eval" },
    ])
  })

  it("preserves order by each cluster's earliest member and leaves singletons", () => {
    const lone1 = receipt({ uri: "lone1", did: A, forUri: "at://act/9", to: text("0xZ") })
    const original = receipt({ uri: "orig", did: A })
    const lone2 = receipt({ uri: "lone2", did: A, forUri: "at://act/8", to: text("0xY") })
    const confirmation = receipt({
      uri: "conf",
      did: B,
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    const merged = mergeMatchingReceipts([lone1, original, lone2, confirmation])
    expect(merged.map((r) => r.uri)).toEqual(["lone1", "conf", "lone2"])
  })

  it("de-duplicates identical attestations across members", () => {
    const original = receipt({
      uri: "orig",
      did: A,
      attestations: [{ role: "sender", did: A }],
    })
    const confirmation = receipt({
      uri: "conf",
      did: B,
      // Indexer already attributed both (partially collapsed) — must not double up.
      attestations: [
        { role: "sender", did: A },
        { role: "recipient", did: B },
      ],
      matchingReceipt: { uri: "orig", cid: "cid:orig" },
    })
    const merged = mergeMatchingReceipts([original, confirmation])
    expect(merged[0].attestations).toEqual([
      { role: "sender", did: A },
      { role: "recipient", did: B },
    ])
  })
})
