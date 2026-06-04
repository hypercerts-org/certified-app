import { describe, it, expect, vi, afterEach } from "vitest"
import { ownerTagForDid, ownerTagForUri } from "../owner-tag"
import type { ManagedIdentity } from "@/hooks/use-managed-authors"
import type { Group } from "@/lib/groups/types"

const VIEWER = "did:plc:viewer0000000000000000000000"
const GROUP = "did:plc:group00000000000000000000000"
const STRANGER = "did:plc:stranger00000000000000000000"

const groupObj = {
  groupDid: GROUP,
  handle: "estuary.certified.app",
  displayName: "Estuary Alliance",
  role: "owner",
  accepted: true,
} as unknown as Group

function byDidMap(): Map<string, ManagedIdentity> {
  return new Map<string, ManagedIdentity>([
    [VIEWER, { did: VIEWER, kind: "personal", label: "You" }],
    [GROUP, { did: GROUP, kind: "group", role: "owner", group: groupObj, label: "Estuary Alliance" }],
  ])
}

describe("ownerTagForDid", () => {
  afterEach(() => vi.restoreAllMocks())

  it("tags the viewer's own DID as personal 'You'", () => {
    const tag = ownerTagForDid(VIEWER, byDidMap(), VIEWER)
    expect(tag.kind).toBe("personal")
    expect(tag.label).toBe("You")
    expect(tag.ownerDid).toBe(VIEWER)
  })

  it("tags a managed group DID with its role + label", () => {
    const tag = ownerTagForDid(GROUP, byDidMap(), VIEWER)
    expect(tag.kind).toBe("group")
    expect(tag.role).toBe("owner")
    expect(tag.label).toBe("Estuary Alliance")
    expect(tag.group).toBe(groupObj)
  })

  it("falls back to personal 'You' for the viewer even when absent from the map", () => {
    const tag = ownerTagForDid(VIEWER, new Map(), VIEWER)
    expect(tag.kind).toBe("personal")
    expect(tag.label).toBe("You")
  })

  it("NEVER labels a stranger DID as 'You' — defensive group tag instead", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const tag = ownerTagForDid(STRANGER, new Map(), VIEWER)
    expect(tag.kind).toBe("group")
    expect(tag.label).not.toBe("You")
    // A truncated-DID label, not the raw DID and not "You".
    expect(tag.label).toContain("did:")
    expect(tag.ownerDid).toBe(STRANGER)
  })
})

describe("ownerTagForUri", () => {
  afterEach(() => vi.restoreAllMocks())

  it("resolves the owner from the AT-URI repo DID", () => {
    const uri = `at://${GROUP}/org.hypercerts.collection/abc`
    const tag = ownerTagForUri(uri, byDidMap(), VIEWER)
    expect(tag.kind).toBe("group")
    expect(tag.ownerDid).toBe(GROUP)
    expect(tag.label).toBe("Estuary Alliance")
  })

  it("falls back to the viewer's personal identity on an unparseable URI", () => {
    const tag = ownerTagForUri("not-an-at-uri", byDidMap(), VIEWER)
    expect(tag.kind).toBe("personal")
    expect(tag.label).toBe("You")
    expect(tag.ownerDid).toBe(VIEWER)
  })
})
