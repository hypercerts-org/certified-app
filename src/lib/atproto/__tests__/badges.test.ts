import { describe, it, expect } from "vitest"
import {
  extractAwardSubjectDid,
  resolveCanonicalEndorsementDef,
  definitionContentKey,
  ENDORSEMENT_BADGE_TYPE,
  type BadgeDefinitionRecord,
  type BadgeDefinitionValue,
} from "../badges"

function makeDef(
  rkey: string,
  createdAt: string | undefined,
  content?: Partial<Omit<BadgeDefinitionValue, "createdAt">>,
): BadgeDefinitionRecord {
  return {
    uri: `at://did:plc:test/app.certified.badge.definition/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    value: {
      badgeType: ENDORSEMENT_BADGE_TYPE,
      title: "Endorsement",
      ...content,
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

  // Data-loss regression. Matching on `badgeType` alone treated every
  // distinct endorsement badge as disposable: a hand-authored
  // "Organization Endorsement" got hard-deleted on the owner's next
  // endorse, keeping only the oldest def. Only EXACT content
  // redundancies may ever be scheduled for deletion.
  it("does NOT treat a differently-titled def as a duplicate", () => {
    const dflt = makeDef("default", "2024-01-01T00:00:00.000Z")
    const org = makeDef("org", "2025-01-01T00:00:00.000Z", {
      title: "Organization Endorsement",
    })
    const result = resolveCanonicalEndorsementDef([dflt, org])
    expect(result?.canonical.rkey).toBe("default")
    expect(result?.duplicates).toEqual([])
  })

  it("does NOT dedupe defs differing only in description", () => {
    const a = makeDef("a", "2024-01-01T00:00:00.000Z")
    const b = makeDef("b", "2025-01-01T00:00:00.000Z", {
      description: "Endorsed for ecological restoration work",
    })
    expect(resolveCanonicalEndorsementDef([a, b])?.duplicates).toEqual([])
  })

  it("does NOT dedupe defs differing only in allowedIssuers", () => {
    const a = makeDef("a", "2024-01-01T00:00:00.000Z", {
      allowedIssuers: ["did:plc:one"],
    })
    const b = makeDef("b", "2025-01-01T00:00:00.000Z", {
      allowedIssuers: ["did:plc:two"],
    })
    expect(resolveCanonicalEndorsementDef([a, b])?.duplicates).toEqual([])
  })

  it("keeps the oldest of several distinctly-titled defs, deleting none", () => {
    // The exact Ma Earth shape: three bespoke badges plus the app default.
    const defs = [
      makeDef("trusted", "2025-06-08T00:00:00.000Z", {
        title: "Trusted Evaluator",
      }),
      makeDef("org", "2025-07-01T00:00:00.000Z", {
        title: "Organization Endorsement",
      }),
      makeDef("verified", "2025-07-02T00:00:00.000Z", {
        title: "Verified by Ma Earth",
      }),
      makeDef("default", "2025-08-01T00:00:00.000Z"),
    ]
    const result = resolveCanonicalEndorsementDef(defs)
    expect(result?.canonical.rkey).toBe("trusted")
    expect(result?.duplicates).toEqual([])
  })

  it("still dedupes byte-identical twins, keeping the oldest", () => {
    const older = makeDef("older", "2024-01-01T00:00:00.000Z", {
      title: "Organization Endorsement",
    })
    const twin = makeDef("twin", "2025-01-01T00:00:00.000Z", {
      title: "Organization Endorsement",
    })
    const result = resolveCanonicalEndorsementDef([twin, older])
    expect(result?.canonical.rkey).toBe("older")
    expect(result?.duplicates.map((d) => d.rkey)).toEqual(["twin"])
  })

  it("dedupes only within a content group, leaving unique defs alone", () => {
    const dflt = makeDef("default", "2024-01-01T00:00:00.000Z")
    const dfltTwin = makeDef("default-twin", "2024-02-01T00:00:00.000Z")
    const org = makeDef("org", "2024-03-01T00:00:00.000Z", {
      title: "Organization Endorsement",
    })
    const result = resolveCanonicalEndorsementDef([dflt, dfltTwin, org])
    expect(result?.canonical.rkey).toBe("default")
    expect(result?.duplicates.map((d) => d.rkey)).toEqual(["default-twin"])
  })

  it("ignores non-endorsement badge types entirely", () => {
    const award = makeDef("award", "2023-01-01T00:00:00.000Z", {
      badgeType: "award",
    })
    const endorsement = makeDef("end", "2024-01-01T00:00:00.000Z")
    const result = resolveCanonicalEndorsementDef([award, endorsement])
    expect(result?.canonical.rkey).toBe("end")
    expect(result?.duplicates).toEqual([])
  })

  // `listDefinitions` casts the listRecords response with no runtime
  // validation, so a foreign client can put any shape in a field. A
  // malformed def must be inert, not fatal: the fingerprint is reached
  // from `createEndorsementAward`, so a throw here fails the endorse
  // itself and keeps failing on every retry.
  it("survives a malformed def rather than failing the whole endorse", () => {
    const good = makeDef("good", "2024-01-01T00:00:00.000Z")
    const bad = makeDef("bad", "2025-01-01T00:00:00.000Z")
    ;(bad.value as { allowedIssuers?: unknown }).allowedIssuers = 5
    const result = resolveCanonicalEndorsementDef([good, bad])
    expect(result?.canonical.rkey).toBe("good")
    // Distinct content, so nothing is scheduled for deletion.
    expect(result?.duplicates).toEqual([])
  })
})

describe("definitionContentKey", () => {
  it("ignores createdAt — twins differ in exactly that", () => {
    const a = makeDef("a", "2024-01-01T00:00:00.000Z")
    const b = makeDef("b", "2030-12-31T00:00:00.000Z")
    expect(definitionContentKey(a.value)).toBe(definitionContentKey(b.value))
  })

  it("separates every meaningful field", () => {
    const base = makeDef("base", "2024-01-01T00:00:00.000Z").value
    const key = definitionContentKey(base)
    const variants: Partial<BadgeDefinitionValue>[] = [
      { title: "Other" },
      { description: "x" },
      { badgeType: "award" },
      { allowedIssuers: ["did:plc:one"] },
      { icon: { $type: "blob", ref: { $link: "bafy" } } },
    ]
    for (const v of variants) {
      expect(definitionContentKey({ ...base, ...v })).not.toBe(key)
    }
  })

  it("is order-insensitive for allowedIssuers and icon keys", () => {
    const base = makeDef("base", "2024-01-01T00:00:00.000Z").value
    const a = definitionContentKey({
      ...base,
      allowedIssuers: ["did:plc:a", "did:plc:b"],
      icon: { $type: "blob", size: 1, ref: { $link: "bafy" } },
    })
    const b = definitionContentKey({
      ...base,
      allowedIssuers: ["did:plc:b", "did:plc:a"],
      icon: { ref: { $link: "bafy" }, $type: "blob", size: 1 },
    })
    expect(a).toBe(b)
  })

  it("treats an absent optional field as equal to an explicit undefined", () => {
    const withUndef = makeDef("a", "2024-01-01T00:00:00.000Z", {
      description: undefined,
    }).value
    const without = makeDef("b", "2024-01-01T00:00:00.000Z").value
    expect(definitionContentKey(withUndef)).toBe(definitionContentKey(without))
  })

  it("treats an absent allowedIssuers as equal to an explicit empty array", () => {
    // Guards the obvious-looking `?? null` normalisation, which would
    // fingerprint these two differently and stop genuine twins deduping.
    const absent = makeDef("a", "2024-01-01T00:00:00.000Z").value
    const empty = makeDef("b", "2024-01-01T00:00:00.000Z", {
      allowedIssuers: [],
    }).value
    expect(definitionContentKey(absent)).toBe(definitionContentKey(empty))
  })

  it.each([
    ["an object", { did: "did:plc:one" }],
    ["a number", 5],
    ["a boolean", true],
    ["a string", "did:plc:one"],
  ])("does not throw when allowedIssuers is %s", (_label, bad) => {
    const value = {
      ...makeDef("bad", "2024-01-01T00:00:00.000Z").value,
      allowedIssuers: bad as unknown as string[],
    }
    expect(() => definitionContentKey(value)).not.toThrow()
  })

  it("keeps a malformed allowedIssuers distinct from a well-formed def", () => {
    const ok = makeDef("ok", "2024-01-01T00:00:00.000Z").value
    const objectForm = {
      ...ok,
      allowedIssuers: { did: "did:plc:one" } as unknown as string[],
    }
    // Distinct, so a malformed def is never a deletion-eligible twin of
    // the app's default one.
    expect(definitionContentKey(objectForm)).not.toBe(definitionContentKey(ok))
    // And a string is not silently spread into its characters.
    const asString = { ...ok, allowedIssuers: "ab" as unknown as string[] }
    const asChars = { ...ok, allowedIssuers: ["a", "b"] }
    expect(definitionContentKey(asString)).not.toBe(
      definitionContentKey(asChars),
    )
  })
})
