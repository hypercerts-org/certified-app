import { describe, it, expect } from "vitest"
import {
  thirdPartyDids,
  confirmRoleBucket,
  matchesConfirmedBy,
  fundingConfirmEligibility,
  CONFIRM_ROLES,
  type ConfirmRole,
} from "../funding-provenance"
import type { FundingAttestation, FundingParty } from "../indexer"

const recipient: FundingAttestation = { role: "recipient", did: "did:plc:rcpt" }
const sender: FundingAttestation = { role: "sender", did: "did:plc:sndr" }
const third = (did: string): FundingAttestation => ({ role: "third-party", did })

const roleSet = (...rs: ConfirmRole[]): ReadonlySet<ConfirmRole> => new Set(rs)
const tpSet = (...dids: string[]): ReadonlySet<string> => new Set(dids)
const ALL_ROLES = new Set(CONFIRM_ROLES)
const NO_TP: ReadonlySet<string> = new Set<string>()

describe("thirdPartyDids", () => {
  it("returns only third-party DIDs, de-duplicated and order-preserving", () => {
    const attestations = [
      recipient,
      third("did:plc:a"),
      sender,
      third("did:plc:b"),
      third("did:plc:a"),
    ]
    expect(thirdPartyDids(attestations)).toEqual(["did:plc:a", "did:plc:b"])
  })

  it("is empty when no third parties attest", () => {
    expect(thirdPartyDids([recipient, sender])).toEqual([])
  })
})

describe("confirmRoleBucket", () => {
  it("both parties attested => 'both'", () => {
    expect(confirmRoleBucket([recipient, sender])).toBe("both")
  })
  it("sender-only => 'sender'", () => {
    expect(confirmRoleBucket([sender])).toBe("sender")
  })
  it("recipient-only => 'recipient'", () => {
    expect(confirmRoleBucket([recipient])).toBe("recipient")
  })
  it("third-party-only => null (no sender/recipient bucket)", () => {
    expect(confirmRoleBucket([third("did:plc:a")])).toBeNull()
  })
  it("no attestations => null", () => {
    expect(confirmRoleBucket([])).toBeNull()
  })
})

describe("matchesConfirmedBy", () => {
  // The default state (every role bucket selected, no specific third party)
  // shows only receipts confirmed by the sender, the recipient, or both.
  // Third-party-only and as-yet-unattested receipts have no role bucket, so
  // they are hidden by default (reachable only by selecting their third-party
  // attestor). Callers derive the displayed count from this filtered set so
  // the count agrees with the list.
  describe("default selection shows only sender/recipient/both-confirmed receipts", () => {
    it("passes a both-confirmed receipt", () => {
      expect(matchesConfirmedBy([recipient, sender], ALL_ROLES, NO_TP)).toBe(true)
    })
    it("passes a sender-only receipt", () => {
      expect(matchesConfirmedBy([sender], ALL_ROLES, NO_TP)).toBe(true)
    })
    it("passes a recipient-only receipt", () => {
      expect(matchesConfirmedBy([recipient], ALL_ROLES, NO_TP)).toBe(true)
    })
    it("hides a third-party-only receipt by default", () => {
      expect(matchesConfirmedBy([third("did:plc:a")], ALL_ROLES, NO_TP)).toBe(false)
    })
    it("hides a zero-attestation receipt by default", () => {
      expect(matchesConfirmedBy([], ALL_ROLES, NO_TP)).toBe(false)
    })
  })

  // Once the user narrows the filter the original UNION semantics apply,
  // byte-for-byte unchanged — a bucket-less receipt is no longer shown.
  describe("narrowed selection applies union semantics (unchanged)", () => {
    it("role={sender} matches a sender-only receipt", () => {
      expect(matchesConfirmedBy([sender], roleSet("sender"), NO_TP)).toBe(true)
    })
    it("role={sender} does NOT match a recipient-only receipt", () => {
      expect(matchesConfirmedBy([recipient], roleSet("sender"), NO_TP)).toBe(false)
    })
    it("role={sender} does NOT match a 'both' receipt (bucket is 'both')", () => {
      expect(matchesConfirmedBy([recipient, sender], roleSet("sender"), NO_TP)).toBe(false)
    })
    it("role={sender,recipient} (deselected 'both') does NOT match a third-party-only receipt", () => {
      expect(
        matchesConfirmedBy([third("did:plc:a")], roleSet("sender", "recipient"), NO_TP),
      ).toBe(false)
    })
    it("third-party selection matches a receipt with that attestor", () => {
      expect(
        matchesConfirmedBy([third("did:plc:a")], roleSet(), tpSet("did:plc:a")),
      ).toBe(true)
    })
    it("third-party selection does NOT match a receipt with a different attestor", () => {
      expect(
        matchesConfirmedBy([third("did:plc:b")], roleSet(), tpSet("did:plc:a")),
      ).toBe(false)
    })
    it("union: role OR third-party matches", () => {
      expect(
        matchesConfirmedBy([sender, third("did:plc:a")], roleSet("sender"), tpSet("did:plc:z")),
      ).toBe(true)
    })
  })

  describe("nothing selected matches nothing", () => {
    it("empty roles + empty third parties => false even for a both receipt", () => {
      expect(matchesConfirmedBy([recipient, sender], roleSet(), NO_TP)).toBe(false)
    })
  })
})

const EVALUATOR = "did:plc:evaluator0000000000000000"
const EVALUATORS: readonly string[] = [EVALUATOR]
const acct = (did: string): FundingParty => ({ kind: "account", did })
const txt = (value: string): FundingParty => ({ kind: "text", value })

describe("fundingConfirmEligibility", () => {
  it("lets the sender (named by DID) confirm as 'sender'", () => {
    const r = { from: acct("did:plc:me"), to: txt("0xRCPT"), attestations: [] }
    expect(fundingConfirmEligibility(r, "did:plc:me", EVALUATORS)).toEqual({
      canConfirm: true,
      role: "sender",
      alreadyAttested: false,
    })
  })

  it("lets the recipient (named by DID) confirm as 'recipient'", () => {
    const r = { from: txt("0xSNDR"), to: acct("did:plc:me"), attestations: [] }
    expect(fundingConfirmEligibility(r, "did:plc:me", EVALUATORS).role).toBe("recipient")
  })

  it("lets a trusted evaluator (neither party) confirm as 'third-party'", () => {
    const r = { from: txt("0xS"), to: txt("0xR"), attestations: [] }
    expect(fundingConfirmEligibility(r, EVALUATOR, EVALUATORS).role).toBe("third-party")
  })

  it("does not let an unrelated, non-evaluator account confirm", () => {
    const r = { from: txt("0xS"), to: txt("0xR"), attestations: [] }
    expect(fundingConfirmEligibility(r, "did:plc:nobody", EVALUATORS)).toEqual({
      canConfirm: false,
      role: null,
      alreadyAttested: false,
    })
  })

  it("does not grant third-party when the evaluator set is empty", () => {
    const r = { from: txt("0xS"), to: txt("0xR"), attestations: [] }
    expect(fundingConfirmEligibility(r, EVALUATOR, []).canConfirm).toBe(false)
  })

  it("hides confirm once the viewer has already attested", () => {
    const r = {
      from: acct("did:plc:me"),
      to: txt("0xRCPT"),
      attestations: [{ role: "sender" as const, did: "did:plc:me" }],
    }
    const e = fundingConfirmEligibility(r, "did:plc:me", EVALUATORS)
    expect(e.alreadyAttested).toBe(true)
    expect(e.canConfirm).toBe(false)
  })

  it("treats a party named only by wallet text as not-the-viewer (evaluator-only)", () => {
    // The viewer is the recipient in reality, but the receipt names the
    // recipient by wallet address, not their DID — so they can't claim the
    // recipient role and are ineligible unless they're an evaluator.
    const r = { from: txt("0xS"), to: txt("0xRCPT"), attestations: [] }
    expect(fundingConfirmEligibility(r, "did:plc:me", EVALUATORS).canConfirm).toBe(false)
  })

  it("is ineligible for a logged-out viewer", () => {
    const r = { from: acct("did:plc:me"), to: txt("0xR"), attestations: [] }
    expect(fundingConfirmEligibility(r, null, EVALUATORS).canConfirm).toBe(false)
  })
})
