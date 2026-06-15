import { describe, it, expect } from "vitest"
import { kindChips, thirdPartyDids } from "../funding-provenance"
import type { FundingAttestation } from "../indexer"

const recipient: FundingAttestation = { role: "recipient", did: "did:plc:rcpt" }
const sender: FundingAttestation = { role: "sender", did: "did:plc:sndr" }
const third = (did: string): FundingAttestation => ({ role: "third-party", did })

describe("kindChips", () => {
  it("returns no chips when there are no attestations", () => {
    expect(kindChips([])).toEqual([])
  })

  it("recipient-only is 'Reported by recipient'", () => {
    const chips = kindChips([recipient])
    expect(chips.map((c) => c.key)).toEqual(["self-recipient"])
    expect(chips[0].label).toBe("Reported by recipient")
    expect(chips[0].tone).toBe("neutral")
  })

  it("sender-only is 'Reported by sender'", () => {
    const chips = kindChips([sender])
    expect(chips.map((c) => c.key)).toEqual(["self-sender"])
  })

  it("recipient + sender supersede to a single 'Confirmed by both' (success)", () => {
    const chips = kindChips([recipient, sender])
    expect(chips.map((c) => c.key)).toEqual(["mutually-confirmed"])
    expect(chips[0].tone).toBe("success")
  })

  it("third-party-only is 'Confirmed by third party'", () => {
    const chips = kindChips([third("did:plc:maearth")])
    expect(chips.map((c) => c.key)).toEqual(["third-party"])
  })

  it("self-reported AND third-party co-occur (two chips)", () => {
    const chips = kindChips([recipient, third("did:plc:maearth")])
    expect(chips.map((c) => c.key)).toEqual(["self-recipient", "third-party"])
  })

  it("mutually-confirmed AND third-party co-occur", () => {
    const chips = kindChips([recipient, sender, third("did:plc:maearth")])
    expect(chips.map((c) => c.key)).toEqual(["mutually-confirmed", "third-party"])
  })
})

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
