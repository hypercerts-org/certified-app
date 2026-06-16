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
  // must pass EVERY receipt, so the rendered list matches the count the UI
  // reports. This is the regression correctness-1 fixes: third-party-only
  // and as-yet-unattested receipts were silently dropped while still counted.
  describe("default selection shows all receipts the count includes", () => {
    it("passes a both-confirmed receipt", () => {
      expect(matchesConfirmedBy([recipient, sender], ALL_ROLES, NO_TP)).toBe(true)
    })
    it("passes a sender-only receipt", () => {
      expect(matchesConfirmedBy([sender], ALL_ROLES, NO_TP)).toBe(true)
    })
    it("passes a recipient-only receipt", () => {
      expect(matchesConfirmedBy([recipient], ALL_ROLES, NO_TP)).toBe(true)
    })
    it("passes a THIRD-PARTY-ONLY receipt (the bug fix)", () => {
      expect(matchesConfirmedBy([third("did:plc:a")], ALL_ROLES, NO_TP)).toBe(true)
    })
    it("passes a ZERO-ATTESTATION receipt (the bug fix)", () => {
      expect(matchesConfirmedBy([], ALL_ROLES, NO_TP)).toBe(true)
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
