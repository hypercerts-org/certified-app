import { describe, it, expect } from "vitest"
import { accountName, deriveIdentity, isMachineHandle, UNNAMED_ACCOUNT } from "../identity"

/**
 * Contract tests for the shared byline-identity derivation. Locks in
 * the precedence (preferredName > displayName > a readable handle >
 * fallbackLabel ?? "Unnamed account"), the DID-valued-handle suppression,
 * the machine-handle suppression, and the
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
      unnamed: false,
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
    expect(identity.displayName).toBe(UNNAMED_ACCOUNT)
    expect(identity.unnamed).toBe(true)
    expect(identity.profileHref).toBe(`/${DID}`)
    expect(identity.initials).toBe("?")
  })

  it("falls back to \"Unnamed account\" when info is null", () => {
    const identity = deriveIdentity(null, DID)

    expect(identity.displayName).toBe(UNNAMED_ACCOUNT)
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

  it("never names an account by a machine handle", () => {
    const identity = deriveIdentity(
      { did: DID, handle: "1ane6o.certified.one", displayName: null, avatarUrl: null },
      DID,
    )

    expect(identity.displayName).toBe(UNNAMED_ACCOUNT)
    expect(identity.unnamed).toBe(true)
    expect(identity.initials).toBe("?")
    // The link still uses the handle.
    expect(identity.profileHref).toBe("/1ane6o.certified.one")
  })

  it("uses fallbackLabel instead of \"Unnamed account\" when provided", () => {
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

describe("isMachineHandle", () => {
  it("knows the handles the PDS makes up at sign-up", () => {
    expect(isMachineHandle("1ane6o.certified.one")).toBe(true)
    expect(isMachineHandle("howxll.certified.one")).toBe(true)
    expect(isMachineHandle("@163dcq.certified.one")).toBe(true)
  })

  it("leaves handles a person chose alone", () => {
    expect(isMachineHandle("gainforest.certified.one")).toBe(false)
    expect(isMachineHandle("ma-earth-tqzc.certified.one")).toBe(false)
    expect(isMachineHandle("holke.xyz")).toBe(false)
    expect(isMachineHandle("abc123.bsky.social")).toBe(false)
    expect(isMachineHandle(null)).toBe(false)
  })
})

describe("accountName", () => {
  it("prefers the name, then a readable handle", () => {
    expect(accountName("Barbara Choat", "1ane6o.certified.one")).toEqual({
      name: "Barbara Choat",
      fallback: false,
    })
    expect(accountName(null, "holke.xyz")).toEqual({ name: "holke.xyz", fallback: false })
  })

  it("falls back quietly for a machine handle or a DID", () => {
    expect(accountName(" ", "163dcq.certified.one")).toEqual({
      name: UNNAMED_ACCOUNT,
      fallback: true,
    })
    expect(accountName(null, DID, DID)).toEqual({ name: UNNAMED_ACCOUNT, fallback: true })
  })
})
