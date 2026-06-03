import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, cleanup } from "@testing-library/react"
import type { Group, OrgRole } from "@/lib/groups/types"

// Controllable mocks for the two context hooks the author-set derivation
// reads from. Each test sets `mockDid` / `mockGroups` before rendering.
let mockDid: string | null = "did:plc:viewer"
let mockGroups: Group[] = []
let mockAuthLoading = false
let mockOrgLoading = false

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: mockDid, isLoading: mockAuthLoading }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ groups: mockGroups, isLoading: mockOrgLoading }),
}))

import { useManagedAuthors } from "../use-managed-authors"

function group(groupDid: string, role: OrgRole): Group {
  return {
    groupDid,
    handle: `${groupDid}.example.com`,
    displayName: `Group ${groupDid}`,
    role,
    accepted: true,
  }
}

beforeEach(() => {
  cleanup()
  mockDid = "did:plc:viewer"
  mockGroups = []
  mockAuthLoading = false
  mockOrgLoading = false
})

describe("useManagedAuthors — author set", () => {
  it("is [viewer, ...owner/admin group DIDs] and excludes member-role groups", () => {
    mockGroups = [
      group("did:plc:owned", "owner"),
      group("did:plc:admined", "admin"),
      group("did:plc:joined", "member"),
    ]

    const { result } = renderHook(() => useManagedAuthors())

    expect(result.current.authors).toEqual([
      "did:plc:viewer",
      "did:plc:owned",
      "did:plc:admined",
    ])
    // member-role group is not an author
    expect(result.current.authors).not.toContain("did:plc:joined")
  })

  it("puts the viewer first", () => {
    mockGroups = [group("did:plc:owned", "owner")]
    const { result } = renderHook(() => useManagedAuthors())
    expect(result.current.authors[0]).toBe("did:plc:viewer")
  })

  it("labels the personal identity 'You' and groups by displayName||handle", () => {
    mockGroups = [group("did:plc:owned", "owner")]
    const { result } = renderHook(() => useManagedAuthors())

    const personal = result.current.byDid.get("did:plc:viewer")
    expect(personal?.kind).toBe("personal")
    expect(personal?.label).toBe("You")

    const grp = result.current.byDid.get("did:plc:owned")
    expect(grp?.kind).toBe("group")
    expect(grp?.role).toBe("owner")
    expect(grp?.label).toBe("Group did:plc:owned")
  })

  it("dedupes and yields an empty author set when there's no viewer", () => {
    mockDid = null
    mockGroups = [group("did:plc:owned", "owner")]
    const { result } = renderHook(() => useManagedAuthors())
    expect(result.current.authors).toEqual([])
    expect(result.current.identities).toEqual([])
  })

  it("drops a downgraded admin (now member) from the author set", () => {
    mockGroups = [group("did:plc:x", "member")]
    const { result } = renderHook(() => useManagedAuthors())
    expect(result.current.authors).toEqual(["did:plc:viewer"])
  })
})
