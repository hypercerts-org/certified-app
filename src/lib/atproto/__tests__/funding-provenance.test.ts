import { describe, it, expect } from "vitest"
import {
  thirdPartyDids,
  confirmRoleBucket,
  confirmBuckets,
  matchesConfirmedBy,
  fundingConfirmEligibility,
  DEFAULT_CONFIRM_ROLES,
  type ConfirmRole,
} from "../funding-provenance"
import type { FundingAttestation, FundingParty } from "../indexer"
import { MA_EARTH_DID } from "@/lib/funding/trusted-sources"

const recipient: FundingAttestation = { role: "recipient", did: "did:plc:rcpt" }
const sender: FundingAttestation = { role: "sender", did: "did:plc:sndr" }
const third = (did: string): FundingAttestation => ({ role: "third-party", did })

const roleSet = (...rs: ConfirmRole[]): ReadonlySet<ConfirmRole> => new Set(rs)
const tpSet = (...dids: string[]): ReadonlySet<string> => new Set(dids)
const DEFAULT_ROLES: ReadonlySet<ConfirmRole> = new Set(DEFAULT_CONFIRM_ROLES)
const maEarth = third(MA_EARTH_DID)
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

describe("confirmBuckets", () => {
  it("a trusted source's receipt is 'trusted'", () => {
    expect([...confirmBuckets([maEarth])]).toEqual(["trusted"])
  })
  it("an unknown third party's receipt is 'other'", () => {
    expect([...confirmBuckets([third("did:plc:a")])]).toEqual(["other"])
  })
  it("a trusted receipt the recipient confirmed is 'trusted' and 'recipient'", () => {
    expect(confirmBuckets([maEarth, recipient])).toEqual(new Set(["trusted", "recipient"]))
  })
  it("no attestations => no bucket", () => {
    expect(confirmBuckets([]).size).toBe(0)
  })
})

describe("matchesConfirmedBy", () => {
  // The default state (trusted sources + both sides, no specific third
  // party) shows what a trusted source recorded and what both parties
  // confirmed. One-sided, unknown-source and as-yet-unattested receipts are
  // hidden until their bucket (or attestor) is selected. Callers derive the
  // displayed count from this filtered set so the count agrees with the list.
  describe("default selection: trusted sources + both sides", () => {
    it("passes a trusted-source receipt", () => {
      expect(matchesConfirmedBy([maEarth], DEFAULT_ROLES, NO_TP)).toBe(true)
    })
    it("passes a both-confirmed receipt", () => {
      expect(matchesConfirmedBy([recipient, sender], DEFAULT_ROLES, NO_TP)).toBe(true)
    })
    it("hides a sender-only receipt", () => {
      expect(matchesConfirmedBy([sender], DEFAULT_ROLES, NO_TP)).toBe(false)
    })
    it("hides a recipient-only receipt", () => {
      expect(matchesConfirmedBy([recipient], DEFAULT_ROLES, NO_TP)).toBe(false)
    })
    it("hides an unknown third party's receipt", () => {
      expect(matchesConfirmedBy([third("did:plc:a")], DEFAULT_ROLES, NO_TP)).toBe(false)
    })
    it("hides a zero-attestation receipt", () => {
      expect(matchesConfirmedBy([], DEFAULT_ROLES, NO_TP)).toBe(false)
    })
  })

  describe("narrowed selection applies union semantics", () => {
    it("role={sender} matches a sender-only receipt", () => {
      expect(matchesConfirmedBy([sender], roleSet("sender"), NO_TP)).toBe(true)
    })
    it("role={sender} does NOT match a recipient-only receipt", () => {
      expect(matchesConfirmedBy([recipient], roleSet("sender"), NO_TP)).toBe(false)
    })
    it("role={sender} does NOT match a 'both' receipt (bucket is 'both')", () => {
      expect(matchesConfirmedBy([recipient, sender], roleSet("sender"), NO_TP)).toBe(false)
    })
    it("role={other} matches an unknown third party's receipt", () => {
      expect(matchesConfirmedBy([third("did:plc:a")], roleSet("other"), NO_TP)).toBe(true)
    })
    it("role={other} does NOT match a trusted-source receipt", () => {
      expect(matchesConfirmedBy([maEarth], roleSet("other"), NO_TP)).toBe(false)
    })
    it("role={recipient} matches a trusted receipt the recipient confirmed", () => {
      expect(matchesConfirmedBy([maEarth, recipient], roleSet("recipient"), NO_TP)).toBe(true)
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
