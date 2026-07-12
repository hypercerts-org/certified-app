import { describe, it, expect } from "vitest"
import { deriveIdentity } from "../identity"
import { truncateDid } from "../did"

/**
 * Contract tests for the shared byline-identity derivation. Locks in
 * the precedence (preferredName > displayName > handle > fallbackLabel
 * ?? truncateDid), the DID-valued-handle suppression, and the
 * handle-preferred profile href.
 */

const DID = "did:plc:abcdefghijklmnopqrstuvwx"

describe("deriveIdentity", () => {
  it("uses resolved display name, handle, avatar and handle-based href", () => {
    const identity = deriveIdentity(
      {
        did: DID,
        handle: "alice.test",
        displayName: "Alice Ames",
        avatarUrl: "https://cdn.example/alice.jpg",
      },
      DID,
    )

    expect(identity).toEqual({
      displayName: "Alice Ames",
      handle: "alice.test",
      initials: "AA",
      profileHref: "/alice.test",
      avatarUrl: "https://cdn.example/alice.jpg",
    })
  })

  it("treats a DID-valued handle as no handle", () => {
    // useAuthorInfo falls back to `handle: did` when resolution fails.
    const identity = deriveIdentity(
      { did: DID, handle: DID, displayName: null, avatarUrl: null },
      DID,
    )

    expect(identity.handle).toBeNull()
    expect(identity.displayName).toBe(truncateDid(DID))
    expect(identity.profileHref).toBe(`/${DID}`)
    expect(identity.initials).toBe("?")
  })

  it("falls back to truncateDid(did) when info is null", () => {
    const identity = deriveIdentity(null, DID)

    expect(identity.displayName).toBe(truncateDid(DID))
    expect(identity.handle).toBeNull()
    expect(identity.initials).toBe("?")
    expect(identity.profileHref).toBe(`/${DID}`)
    expect(identity.avatarUrl).toBeNull()
  })

  it("lets record-level preferredName and preferredAvatarUrl outrank resolved info", () => {
    const identity = deriveIdentity(
      {
        did: DID,
        handle: "alice.test",
        displayName: "Alice Ames",
        avatarUrl: "https://cdn.example/resolved.jpg",
      },
      DID,
      {
        preferredName: "Record Org",
        preferredAvatarUrl: "https://cdn.example/record.jpg",
      },
    )

    expect(identity.displayName).toBe("Record Org")
    expect(identity.avatarUrl).toBe("https://cdn.example/record.jpg")
    expect(identity.initials).toBe("RO")
    // Handle and href still come from the resolved info.
    expect(identity.handle).toBe("alice.test")
    expect(identity.profileHref).toBe("/alice.test")
  })

  it("uses fallbackLabel instead of the truncated DID when provided", () => {
    const identity = deriveIdentity(null, DID, { fallbackLabel: "Anonymous" })

    expect(identity.displayName).toBe("Anonymous")
    expect(identity.initials).toBe("An")
  })

  it("prefers the handle over the DID for the profile href", () => {
    const withHandle = deriveIdentity(
      { did: DID, handle: "alice.test", displayName: null, avatarUrl: null },
      DID,
    )
    const withoutHandle = deriveIdentity(
      { did: DID, handle: DID, displayName: "Alice", avatarUrl: null },
      DID,
    )

    expect(withHandle.profileHref).toBe("/alice.test")
    // Display name falls back to the handle when there is no name.
    expect(withHandle.displayName).toBe("alice.test")
    expect(withoutHandle.profileHref).toBe(`/${DID}`)
  })
})
