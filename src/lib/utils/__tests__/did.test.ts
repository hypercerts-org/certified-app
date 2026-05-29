import { describe, it, expect } from "vitest"
import { isValidDid, isDid } from "../did"

// A syntactically valid did:plc has exactly 24 base32 chars [a-z2-7].
const VALID_PLC = "did:plc:abcdefghij234567klmnopqr"

describe("isValidDid", () => {
  it("accepts a well-formed did:plc (24 base32 chars)", () => {
    expect(VALID_PLC.length).toBe("did:plc:".length + 24)
    expect(isValidDid(VALID_PLC)).toBe(true)
  })

  it("accepts a well-formed did:web", () => {
    expect(isValidDid("did:web:example.com")).toBe(true)
    expect(isValidDid("did:web:sub.example.com:8443:path")).toBe(true)
    expect(isValidDid("did:web:a")).toBe(true)
  })

  it("rejects a did:plc with the wrong identifier length", () => {
    expect(isValidDid("did:plc:tooshort")).toBe(false)
    expect(isValidDid("did:plc:abcdefghij234567klmnopqrs")).toBe(false)
  })

  it("rejects a did:plc with out-of-alphabet characters", () => {
    // '1', '8', '9', '0' and uppercase are not in the base32 [a-z2-7] set.
    expect(isValidDid("did:plc:1bcdefghij234567klmnopqr")).toBe(false)
    expect(isValidDid("did:plc:Abcdefghij234567klmnopqr")).toBe(false)
  })

  it("rejects a did:web with no identifier", () => {
    expect(isValidDid("did:web:")).toBe(false)
  })

  it("rejects unknown DID methods", () => {
    expect(isValidDid("did:key:z6Mki")).toBe(false)
    expect(isValidDid("did:example:123")).toBe(false)
  })

  it("rejects strings that are not DIDs at all", () => {
    expect(isValidDid("example.com")).toBe(false)
    expect(isValidDid("plc:abcdefghij234567klmnopqr")).toBe(false)
    expect(isValidDid("@alice.bsky.social")).toBe(false)
  })

  it("rejects the empty string", () => {
    expect(isValidDid("")).toBe(false)
  })

  it("rejects a valid DID with surrounding whitespace (anchored regex)", () => {
    expect(isValidDid(` ${VALID_PLC}`)).toBe(false)
    expect(isValidDid(`${VALID_PLC}\n`)).toBe(false)
  })
})

describe("isDid", () => {
  it("returns true for the did:plc and did:web prefixes", () => {
    expect(isDid(VALID_PLC)).toBe(true)
    expect(isDid("did:web:example.com")).toBe(true)
  })

  it("returns true for prefix-only strings (it is a cheap prefix check, not a validator)", () => {
    expect(isDid("did:plc:")).toBe(true)
    expect(isDid("did:web:")).toBe(true)
  })

  it("returns false for other DID methods", () => {
    expect(isDid("did:key:z6Mki")).toBe(false)
    expect(isDid("did:example:123")).toBe(false)
  })

  it("returns false for non-DID and empty strings", () => {
    expect(isDid("")).toBe(false)
    expect(isDid("example.com")).toBe(false)
    expect(isDid("@alice.bsky.social")).toBe(false)
  })

  it("is prefix-sensitive (no leading whitespace)", () => {
    expect(isDid(` ${VALID_PLC}`)).toBe(false)
  })
})
