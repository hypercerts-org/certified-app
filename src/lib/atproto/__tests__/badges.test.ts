import { describe, it, expect } from "vitest"
import {
  extractAwardSubjectDid,
  resolveCanonicalEndorsementDef,
  ENDORSEMENT_BADGE_TYPE,
  type BadgeDefinitionRecord,
} from "../badges"

function makeDef(
  rkey: string,
  createdAt: string | undefined,
): BadgeDefinitionRecord {
  return {
    uri: `at://did:plc:test/app.certified.badge.definition/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    value: {
      badgeType: ENDORSEMENT_BADGE_TYPE,
      title: "Endorsement",
      // Intentionally allow undefined to model a malformed record.
      createdAt: createdAt as string,
    },
  }
}

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

describe("resolveCanonicalEndorsementDef", () => {
  it("returns null when no endorsement def matches", () => {
    expect(resolveCanonicalEndorsementDef([])).toBeNull()
  })

  it("picks the oldest by createdAt as canonical", () => {
    const older = makeDef("older", "2024-01-01T00:00:00.000Z")
    const newer = makeDef("newer", "2025-01-01T00:00:00.000Z")
    const result = resolveCanonicalEndorsementDef([newer, older])
    expect(result?.canonical.rkey).toBe("older")
    expect(result?.duplicates.map((d) => d.rkey)).toEqual(["newer"])
  })

  it("does NOT let a def missing createdAt win canonical", () => {
    // Regression: a malformed def lacking createdAt must sort to the
    // END (treated as latest), so the well-formed def stays canonical
    // and the malformed one is the duplicate scheduled for cleanup.
    const wellFormed = makeDef("good", "2024-06-01T00:00:00.000Z")
    const malformed = makeDef("bad", undefined)
    const result = resolveCanonicalEndorsementDef([malformed, wellFormed])
    expect(result?.canonical.rkey).toBe("good")
    expect(result?.duplicates.map((d) => d.rkey)).toEqual(["bad"])
  })

  it("treats an empty-string createdAt as latest too", () => {
    const wellFormed = makeDef("good", "2024-06-01T00:00:00.000Z")
    const empty = makeDef("empty", "")
    const result = resolveCanonicalEndorsementDef([empty, wellFormed])
    expect(result?.canonical.rkey).toBe("good")
    expect(result?.duplicates.map((d) => d.rkey)).toEqual(["empty"])
  })
})
