import { describe, it, expect } from "vitest"
import { extractAwardSubjectDid } from "../badges"

describe("extractAwardSubjectDid", () => {
  it("returns null for null / undefined subject", () => {
    expect(extractAwardSubjectDid(undefined)).toBeNull()
    expect(extractAwardSubjectDid(null as never)).toBeNull()
  })

  describe("bare DID string variant", () => {
    it("returns a well-formed PLC DID", () => {
      expect(extractAwardSubjectDid("did:plc:s4puetfspot742ai7y4otuel")).toBe(
        "did:plc:s4puetfspot742ai7y4otuel",
      )
    })

    it("returns a well-formed did:web", () => {
      expect(extractAwardSubjectDid("did:web:example.com")).toBe(
        "did:web:example.com",
      )
    })

    it("returns null for a non-DID string", () => {
      expect(extractAwardSubjectDid("not-a-did")).toBeNull()
    })

    it("returns null for an empty string", () => {
      expect(extractAwardSubjectDid("")).toBeNull()
    })
  })

  describe("AppCertifiedDefsDid object variant", () => {
    it("extracts a DID from the canonical {did: '...'} shape", () => {
      expect(
        extractAwardSubjectDid({ did: "did:plc:abc1234" } as never),
      ).toBe("did:plc:abc1234")
    })

    it("returns null when did is missing", () => {
      expect(extractAwardSubjectDid({} as never)).toBeNull()
    })

    it("returns null when did is not a string", () => {
      expect(
        extractAwardSubjectDid({ did: 123 } as never),
      ).toBeNull()
    })

    it("returns null when did doesn't start with did:", () => {
      expect(
        extractAwardSubjectDid({ did: "not-a-did" } as never),
      ).toBeNull()
    })
  })

  describe("ComAtprotoRepoStrongRef variant", () => {
    it("slices the DID out of an at-URI", () => {
      expect(
        extractAwardSubjectDid({
          uri: "at://did:plc:abc1234/app.certified.actor.profile/self",
        } as never),
      ).toBe("did:plc:abc1234")
    })

    it("returns the full tail when the at-URI has no record path", () => {
      // Defensive: an at-URI with just the DID (no slash after it)
      // should still surface the DID. The function does this by
      // returning the full tail when no slash separator is found.
      expect(
        extractAwardSubjectDid({ uri: "at://did:plc:abc1234" } as never),
      ).toBe("did:plc:abc1234")
    })

    it("returns null when uri doesn't start with at://did:", () => {
      expect(
        extractAwardSubjectDid({ uri: "https://example.com/x" } as never),
      ).toBeNull()
    })

    it("returns null when uri is missing", () => {
      expect(
        extractAwardSubjectDid({ uri: null } as never),
      ).toBeNull()
    })
  })

  it("returns null for primitive (non-string, non-object) subjects", () => {
    expect(extractAwardSubjectDid(123 as never)).toBeNull()
    expect(extractAwardSubjectDid(true as never)).toBeNull()
  })
})
