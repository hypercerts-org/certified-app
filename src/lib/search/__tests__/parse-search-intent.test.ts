import { describe, it, expect } from "vitest"
import { parseSearchIntent } from "../parse-search-intent"

const DID = "did:plc:eu5c56acxntwhhw5cfkzs43z"
const ACTIVITY_URI = `at://${DID}/org.hypercerts.claim.activity/3mo5phr5xbp2m`

describe("parseSearchIntent", () => {
  it("returns null for ordinary search terms", () => {
    expect(parseSearchIntent("Simocracy")).toBeNull()
    expect(parseSearchIntent("restore rainforest")).toBeNull()
    expect(parseSearchIntent("")).toBeNull()
    expect(parseSearchIntent("   ")).toBeNull()
  })

  it("resolves a canonical activity at-URI to a record jump", () => {
    const intent = parseSearchIntent(ACTIVITY_URI)
    expect(intent).toMatchObject({
      kind: "record",
      did: DID,
      collection: "org.hypercerts.claim.activity",
      rkey: "3mo5phr5xbp2m",
      label: "Open activity",
      resolvable: true,
    })
    expect(intent?.href).toBe(`/${DID}/activity/3mo5phr5xbp2m`)
  })

  it("resolves a collection at-URI to a project jump", () => {
    const intent = parseSearchIntent(`at://${DID}/org.hypercerts.collection/abc123`)
    expect(intent).toMatchObject({ kind: "record", label: "Open project" })
    expect(intent?.href).toBe(`/${DID}/project/abc123`)
  })

  it("falls back to a profile jump for a non-page collection", () => {
    const intent = parseSearchIntent(`at://${DID}/app.bsky.feed.post/xyz`)
    expect(intent).toMatchObject({ kind: "profile", actor: DID })
  })

  it("resolves a bare DID to a profile jump", () => {
    expect(parseSearchIntent(DID)).toMatchObject({
      kind: "profile",
      actor: DID,
      href: `/${DID}`,
      resolvable: true,
    })
  })

  it("resolves a handle (with and without @) to a profile jump", () => {
    const expected = {
      kind: "profile",
      actor: "diegorb1329.bsky.social",
      href: "/diegorb1329.bsky.social",
    }
    expect(parseSearchIntent("diegorb1329.bsky.social")).toMatchObject(expected)
    expect(parseSearchIntent("@diegorb1329.bsky.social")).toMatchObject(expected)
  })

  it("rejects dotless words as handles (they are search terms)", () => {
    expect(parseSearchIntent("alice")).toBeNull()
    expect(parseSearchIntent("@simocracy")).toBeNull()
  })

  it("does not treat reserved route words as handles", () => {
    expect(parseSearchIntent("explore")).toBeNull()
    expect(parseSearchIntent("settings")).toBeNull()
  })

  it("interprets a pasted app record URL via its pathname", () => {
    const intent = parseSearchIntent(`https://staging.certified.app/alice.eco/activity/3k`)
    expect(intent).toMatchObject({
      kind: "record",
      collection: "activity",
      rkey: "3k",
      label: "Open activity",
    })
    expect(intent?.href).toBe("/alice.eco/activity/3k")
  })

  it("interprets a pasted app profile URL", () => {
    expect(parseSearchIntent("https://certified.app/alice.eco")).toMatchObject({
      kind: "profile",
      actor: "alice.eco",
    })
  })

  it("interprets a pasted pdsls-style /at/ URL", () => {
    const intent = parseSearchIntent(
      `https://pdsls.dev/at/${DID}/org.hypercerts.claim.activity/3mo5phr5xbp2m`,
    )
    expect(intent).toMatchObject({ kind: "record", did: DID, rkey: "3mo5phr5xbp2m" })
  })

  it("returns null for a foreign URL that doesn't match the app scheme", () => {
    expect(parseSearchIntent("https://example.com/some/random/path")).toBeNull()
    expect(parseSearchIntent("not a url at all !!")).toBeNull()
  })
})
