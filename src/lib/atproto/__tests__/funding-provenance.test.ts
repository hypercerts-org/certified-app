import { describe, it, expect } from "vitest"
import {
  thirdPartyDids,
  confirmRoleBucket,
  matchesConfirmedBy,
  CONFIRM_ROLES,
  type ConfirmRole,
} from "../funding-provenance"
import type { FundingAttestation } from "../indexer"

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
