import { describe, it, expect } from "vitest"
import {
  fundingPartyToRecord,
  buildFundingReceiptRecord,
  buildConfirmationRecord,
  FUNDING_RECEIPT_COLLECTION,
} from "../funding-receipt-record"
import type { FundingParty, FundingReceipt } from "../indexer"

const DID_TYPE = "app.certified.defs#did"
const TEXT_TYPE = "org.hypercerts.funding.receipt#text"

const account = (did: string): FundingParty => ({ kind: "account", did })
const text = (value: string): FundingParty => ({ kind: "text", value })

describe("fundingPartyToRecord", () => {
  it("maps an account to the DID union variant", () => {
    expect(fundingPartyToRecord(account("did:plc:abc"))).toEqual({
      $type: DID_TYPE,
      did: "did:plc:abc",
    })
  })

  it("maps free text to the #text union variant", () => {
    expect(fundingPartyToRecord(text("0xWALLET"))).toEqual({
      $type: TEXT_TYPE,
      value: "0xWALLET",
    })
  })

  it("maps null to undefined so an optional party is dropped", () => {
    expect(fundingPartyToRecord(null)).toBeUndefined()
  })
})

describe("buildFundingReceiptRecord", () => {
  it("builds a record with the required fields + $type", () => {
    const record = buildFundingReceiptRecord({
      to: account("did:plc:rcpt"),
      from: account("did:plc:sndr"),
      amount: "0.1",
      currency: "USDC",
      createdAt: "2026-06-16T00:00:00.000Z",
    })
    expect(record).toEqual({
      $type: FUNDING_RECEIPT_COLLECTION,
      to: { $type: DID_TYPE, did: "did:plc:rcpt" },
      from: { $type: DID_TYPE, did: "did:plc:sndr" },
      amount: "0.1",
      currency: "USDC",
      createdAt: "2026-06-16T00:00:00.000Z",
    })
  })

  it("drops empty optionals and an absent from", () => {
    const record = buildFundingReceiptRecord({
      to: text("0xRCPT"),
      amount: "5",
      currency: "USD",
      createdAt: "2026-06-16T00:00:00.000Z",
      from: null,
      occurredAt: null,
      paymentRail: "",
      notes: null,
    })
    expect(record).not.toHaveProperty("from")
    expect(record).not.toHaveProperty("occurredAt")
    expect(record).not.toHaveProperty("paymentRail")
    expect(record).not.toHaveProperty("notes")
    expect(record).not.toHaveProperty("for")
    expect(record).not.toHaveProperty("matchingReceipt")
  })

  it("includes the for strongRef + payment metadata when present", () => {
    const record = buildFundingReceiptRecord({
      to: account("did:plc:rcpt"),
      amount: "1",
      currency: "ETH",
      createdAt: "2026-06-16T00:00:00.000Z",
      for: { uri: "at://did:plc:x/org.hypercerts.claim.activity/rk", cid: "bafycid" },
      occurredAt: "2026-06-15T12:00:00.000Z",
      paymentRail: "onchain",
      paymentNetwork: "base",
      transactionId: "0xtx",
      notes: "thanks",
    })
    expect(record.for).toEqual({
      uri: "at://did:plc:x/org.hypercerts.claim.activity/rk",
      cid: "bafycid",
    })
    expect(record.occurredAt).toBe("2026-06-15T12:00:00.000Z")
    expect(record.paymentRail).toBe("onchain")
    expect(record.paymentNetwork).toBe("base")
    expect(record.transactionId).toBe("0xtx")
    expect(record.notes).toBe("thanks")
  })

  it("throws when the recipient (to) is null", () => {
    expect(() =>
      buildFundingReceiptRecord({
        to: null,
        amount: "1",
        currency: "USDC",
        createdAt: "2026-06-16T00:00:00.000Z",
      }),
    ).toThrow(/recipient/i)
  })
})

describe("buildConfirmationRecord", () => {
  const base: Pick<
    FundingReceipt,
    | "uri"
    | "cid"
    | "from"
    | "to"
    | "amount"
    | "currency"
    | "forUri"
    | "forCid"
    | "occurredAt"
    | "transactionId"
    | "paymentRail"
    | "paymentNetwork"
  > = {
    uri: "at://did:plc:orig/org.hypercerts.funding.receipt/origrk",
    cid: "bafyorig",
    from: account("did:plc:sndr"),
    to: text("0xRCPT"),
    amount: "0.1",
    currency: "USDC",
    forUri: "at://did:plc:x/org.hypercerts.claim.activity/rk",
    forCid: "bafyactivity",
    occurredAt: "2026-06-15T12:00:00.000Z",
    transactionId: "0xORIGTX",
    paymentRail: "onchain",
    paymentNetwork: "base",
  }

  it("keeps `for` on the activity and links the original via matchingReceipt", () => {
    const record = buildConfirmationRecord(base, {})
    expect(record.from).toEqual({ $type: DID_TYPE, did: "did:plc:sndr" })
    expect(record.to).toEqual({ $type: TEXT_TYPE, value: "0xRCPT" })
    expect(record.amount).toBe("0.1")
    expect(record.currency).toBe("USDC")
    // `for` stays on the funded activity...
    expect(record.for).toEqual({ uri: base.forUri, cid: base.forCid })
    // ...and `matchingReceipt` strong-refs the receipt being confirmed.
    expect(record.matchingReceipt).toEqual({ uri: base.uri, cid: base.cid })
    expect(record.occurredAt).toBe("2026-06-15T12:00:00.000Z")
  })

  it("copies transactionId + rail/network from the original (cluster keys, not entered)", () => {
    const record = buildConfirmationRecord(base, { notes: "saw it land" })
    expect(record.transactionId).toBe("0xORIGTX")
    expect(record.paymentRail).toBe("onchain")
    expect(record.paymentNetwork).toBe("base")
    // Only the free-text note is the confirmer's own.
    expect(record.notes).toBe("saw it land")
  })

  it("throws when the payment is missing an amount or currency", () => {
    expect(() =>
      buildConfirmationRecord({ ...base, amount: null }),
    ).toThrow(/amount or currency/i)
  })
})
