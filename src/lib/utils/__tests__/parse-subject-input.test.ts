import { describe, it, expect } from "vitest"
import { parseSubjectInput } from "../parse-subject-input"

describe("parseSubjectInput", () => {
  it("passes through a bare PLC DID", () => {
    expect(parseSubjectInput("did:plc:s4puetfspot742ai7y4otuel")).toEqual({
      kind: "did",
      value: "did:plc:s4puetfspot742ai7y4otuel",
    })
  })

  it("passes through a bare DID web", () => {
    expect(parseSubjectInput("did:web:example.com")).toEqual({
      kind: "did",
      value: "did:web:example.com",
    })
  })

  it("treats a bare handle as a handle (kind: handle)", () => {
    expect(parseSubjectInput("alice.bsky.social")).toEqual({
      kind: "handle",
      value: "alice.bsky.social",
    })
  })

  it("strips a leading @ from handles — paste from a Twitter-style mention", () => {
    expect(parseSubjectInput("@alice.bsky.social")).toEqual({
      kind: "handle",
      value: "alice.bsky.social",
    })
  })

  it("ignores leading + trailing whitespace", () => {
    expect(parseSubjectInput("   alice.bsky.social  ")).toEqual({
      kind: "handle",
      value: "alice.bsky.social",
    })
  })

  it("extracts the DID from a full actor at-URI", () => {
    expect(
      parseSubjectInput(
        "at://did:plc:s4puetfspot742ai7y4otuel/app.certified.actor.profile/self",
      ),
    ).toEqual({
      kind: "did",
      value: "did:plc:s4puetfspot742ai7y4otuel",
    })
  })

  it("extracts the DID from a bare at-URI without a record path", () => {
    expect(
      parseSubjectInput("at://did:plc:s4puetfspot742ai7y4otuel"),
    ).toEqual({
      kind: "did",
      value: "did:plc:s4puetfspot742ai7y4otuel",
    })
  })

  it("extracts a DID from a profile URL when the segment is a DID", () => {
    expect(
      parseSubjectInput(
        "https://redesign.certified.app/profile/did:plc:s4puetfspot742ai7y4otuel",
      ),
    ).toEqual({
      kind: "did",
      value: "did:plc:s4puetfspot742ai7y4otuel",
    })
  })

  it("extracts a handle from a profile URL when the segment is a handle", () => {
    expect(
      parseSubjectInput("https://redesign.certified.app/profile/alice.bsky.social"),
    ).toEqual({
      kind: "handle",
      value: "alice.bsky.social",
    })
  })

  it("URL-decodes a percent-encoded profile segment", () => {
    expect(
      parseSubjectInput(
        "https://redesign.certified.app/profile/did%3Aplc%3As4puetfspot742ai7y4otuel",
      ),
    ).toEqual({
      kind: "did",
      value: "did:plc:s4puetfspot742ai7y4otuel",
    })
  })

  it("returns null for empty + whitespace-only input", () => {
    expect(parseSubjectInput("")).toBeNull()
    expect(parseSubjectInput("   ")).toBeNull()
    expect(parseSubjectInput("@")).toBeNull()
  })

  it("returns null for obvious garbage (no dot, not a DID)", () => {
    expect(parseSubjectInput("just-some-text")).toBeNull()
    expect(parseSubjectInput("hello world")).toBeNull()
    expect(parseSubjectInput("did:nocolons")).toBeNull()
  })
})
