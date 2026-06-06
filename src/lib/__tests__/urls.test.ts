import { describe, it, expect } from "vitest"
import {
  profileUrl,
  recordUrl,
  activityUrl,
  projectUrl,
  parseActor,
  isDid,
  isRecordType,
  collectionForType,
  typeForCollection,
  parseAtUri,
  buildAtUri,
  parsePastedAtUri,
  recordUrlFromAtUri,
  shareRecordUrl,
  shareProfileUrl,
  RESERVED_ROUTES,
} from "@/lib/urls"

describe("builders", () => {
  it("profileUrl keeps the actor verbatim (no percent-encoding)", () => {
    expect(profileUrl("alice.eco")).toBe("/alice.eco")
    expect(profileUrl("did:plc:abc")).toBe("/did:plc:abc")
  })

  it("recordUrl is actor-first with a friendly type segment", () => {
    expect(recordUrl("alice.eco", "activity", "rkey1")).toBe(
      "/alice.eco/activity/rkey1",
    )
    expect(recordUrl("did:plc:abc", "project", "rk")).toBe(
      "/did:plc:abc/project/rk",
    )
    expect(activityUrl("alice.eco", "r")).toBe("/alice.eco/activity/r")
    expect(projectUrl("alice.eco", "r")).toBe("/alice.eco/project/r")
  })

  it("share* builders force the DID form with an absolute origin", () => {
    expect(shareProfileUrl("did:plc:abc", "https://certified.app")).toBe(
      "https://certified.app/did:plc:abc",
    )
    expect(
      shareRecordUrl("did:plc:abc", "activity", "rk", "https://certified.app"),
    ).toBe("https://certified.app/did:plc:abc/activity/rk")
  })
})

describe("parseActor", () => {
  it("classifies DIDs", () => {
    expect(parseActor("did:plc:abc")).toEqual({
      kind: "did",
      value: "did:plc:abc",
    })
    expect(isDid("did:web:example.com")).toBe(true)
  })

  it("classifies dotted handles", () => {
    expect(parseActor("alice.eco")).toEqual({
      kind: "handle",
      value: "alice.eco",
    })
  })

  it("rejects reserved routes and bare words (no dot)", () => {
    for (const word of ["settings", "explore", "home", "create"]) {
      expect(parseActor(word).kind).toBe("invalid")
      expect(RESERVED_ROUTES.has(word)).toBe(true)
    }
    expect(parseActor("notahandle").kind).toBe("invalid")
  })

  it("rejects segments with slashes or whitespace", () => {
    expect(parseActor("a b.com").kind).toBe("invalid")
  })

  it("decodes a percent-encoded DID (legacy inbound links)", () => {
    expect(parseActor("did%3Aplc%3Aabc")).toEqual({
      kind: "did",
      value: "did:plc:abc",
    })
  })
})

describe("type <-> collection map", () => {
  it("round-trips known types", () => {
    expect(isRecordType("activity")).toBe(true)
    expect(isRecordType("project")).toBe(true)
    expect(isRecordType("nope")).toBe(false)
    expect(collectionForType("activity")).toBe("org.hypercerts.claim.activity")
    expect(typeForCollection("org.hypercerts.collection")).toBe("project")
    expect(typeForCollection("app.certified.actor.membership")).toBeNull()
  })
})

describe("at-uri parsing", () => {
  it("parses + builds canonical at:// URIs", () => {
    const uri = "at://did:plc:abc/org.hypercerts.claim.activity/rk"
    expect(parseAtUri(uri)).toEqual({
      did: "did:plc:abc",
      collection: "org.hypercerts.claim.activity",
      rkey: "rk",
    })
    expect(buildAtUri("did:plc:abc", "org.hypercerts.claim.activity", "rk")).toBe(
      uri,
    )
    expect(parseAtUri("not-an-at-uri")).toBeNull()
  })

  it("maps an at:// URI to the in-app record URL", () => {
    expect(
      recordUrlFromAtUri("at://did:plc:abc/org.hypercerts.collection/rk"),
    ).toBe("/did:plc:abc/project/rk")
    expect(
      recordUrlFromAtUri("at://did:plc:abc/org.hypercerts.collection/rk", "alice.eco"),
    ).toBe("/alice.eco/project/rk")
    // Page-less collection -> null
    expect(
      recordUrlFromAtUri("at://did:plc:abc/app.certified.location/rk"),
    ).toBeNull()
  })

  it("parses pasted pdsls-style paths in all prefix shapes", () => {
    const expected = {
      did: "did:plc:abc",
      collection: "org.hypercerts.claim.activity",
      rkey: "rk",
    }
    expect(
      parsePastedAtUri("/at://did:plc:abc/org.hypercerts.claim.activity/rk"),
    ).toEqual(expected)
    expect(
      parsePastedAtUri("/at:/did:plc:abc/org.hypercerts.claim.activity/rk"),
    ).toEqual(expected)
    expect(
      parsePastedAtUri("/at/did:plc:abc/org.hypercerts.claim.activity/rk"),
    ).toEqual(expected)
  })

  it("does not mistake a handle starting with 'at' for an at-uri", () => {
    expect(parsePastedAtUri("/at.example.com")).toBeNull()
    expect(parsePastedAtUri("/atrium.bsky.social/activity/rk")).toBeNull()
  })

  it("returns null when the pasted at-uri lacks a DID authority", () => {
    expect(parsePastedAtUri("/at/alice.eco/coll/rk")).toBeNull()
  })
})
