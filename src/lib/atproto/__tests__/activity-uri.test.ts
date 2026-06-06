import { describe, it, expect } from "vitest"
import {
  parseAtUri,
  parseActivityUri,
  activityDetailHref,
  activityDetailHrefFromUri,
} from "../activity-uri"

describe("parseAtUri", () => {
  it("parses a well-formed three-part at-URI", () => {
    expect(
      parseAtUri(
        "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.claim.activity/3mlgqszquws2u",
      ),
    ).toEqual({
      did: "did:plc:s4puetfspot742ai7y4otuel",
      collection: "org.hypercerts.claim.activity",
      rkey: "3mlgqszquws2u",
    })
  })

  it("parses a collection URI (org.hypercerts.collection)", () => {
    expect(
      parseAtUri(
        "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrtsu7thf2j",
      ),
    ).toEqual({
      did: "did:plc:s4puetfspot742ai7y4otuel",
      collection: "org.hypercerts.collection",
      rkey: "3mmrtsu7thf2j",
    })
  })

  it("returns null for missing at:// prefix", () => {
    expect(
      parseAtUri("did:plc:s4puetfspot742ai7y4otuel/some.collection/rkey"),
    ).toBeNull()
  })

  it("returns null for too few parts", () => {
    expect(parseAtUri("at://did:plc:abc")).toBeNull()
    expect(parseAtUri("at://did:plc:abc/some.collection")).toBeNull()
  })

  it("returns null for too many parts", () => {
    expect(
      parseAtUri("at://did:plc:abc/some.collection/rkey/extra"),
    ).toBeNull()
  })

  it("returns null when any part is empty", () => {
    expect(parseAtUri("at:///some.collection/rkey")).toBeNull()
    expect(parseAtUri("at://did:plc:abc//rkey")).toBeNull()
    expect(parseAtUri("at://did:plc:abc/some.collection/")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseAtUri("")).toBeNull()
  })
})

describe("parseActivityUri", () => {
  it("delegates to parseAtUri for well-formed input", () => {
    const result = parseActivityUri(
      "at://did:plc:abc/org.hypercerts.claim.activity/rkey1",
    )
    expect(result).toEqual({
      did: "did:plc:abc",
      collection: "org.hypercerts.claim.activity",
      rkey: "rkey1",
    })
  })

  it("returns null for malformed URI (same semantics as parseAtUri)", () => {
    expect(parseActivityUri("garbage")).toBeNull()
  })

  it("does NOT enforce that the collection matches activity NSID", () => {
    // parseActivityUri is structurally identical to parseAtUri — the
    // collection guard lives in activityDetailHrefFromUri instead.
    expect(
      parseActivityUri("at://did:plc:abc/some.other.collection/rkey1"),
    ).toEqual({
      did: "did:plc:abc",
      collection: "some.other.collection",
      rkey: "rkey1",
    })
  })
})

describe("activityDetailHref", () => {
  it("builds the handle-forward record URL (actor-first, DID verbatim)", () => {
    expect(activityDetailHref("did:plc:abc", "rkey1")).toBe(
      "/did:plc:abc/activity/rkey1",
    )
  })
})

describe("activityDetailHrefFromUri", () => {
  it("returns the detail href for a valid activity URI", () => {
    expect(
      activityDetailHrefFromUri(
        "at://did:plc:abc/org.hypercerts.claim.activity/rkey1",
      ),
    ).toBe("/did:plc:abc/activity/rkey1")
  })

  it("returns null when the collection is not the activity NSID", () => {
    expect(
      activityDetailHrefFromUri(
        "at://did:plc:abc/org.hypercerts.collection/rkey1",
      ),
    ).toBeNull()
  })

  it("returns null when the URI is malformed", () => {
    expect(activityDetailHrefFromUri("not-an-at-uri")).toBeNull()
  })
})
