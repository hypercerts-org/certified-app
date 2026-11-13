import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, renderHook } from "@testing-library/react"

// /groups/{did}/settings and /edit-profile gate on useGroupAccess. A
// signed-in visitor who isn't a member must get an explanation, not the
// endless spinner the settings page used to show.

const auth = { isAuthenticated: true, isLoading: false, did: "did:plc:me" }
const org = {
  groups: [] as Array<{ groupDid: string; role: string; handle: string }>,
  selfGroup: null as null | { groupDid: string; role: string; handle: string },
  isLoading: false,
}

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ ...auth, openSignIn: vi.fn() }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => org,
}))
vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => {},
  useRegisterPageHeader: () => {},
}))

import { GroupAccessPage, useGroupAccess } from "../group-access"

const GROUP = "did:plc:group"

beforeEach(() => {
  auth.isAuthenticated = true
  auth.isLoading = false
  org.groups = []
  org.selfGroup = null
  org.isLoading = false
})

afterEach(() => cleanup())

describe("useGroupAccess", () => {
  it("is loading while the session resolves", () => {
    auth.isLoading = true
    const { result } = renderHook(() => useGroupAccess(GROUP))
    expect(result.current.status).toBe("loading")
  })

  it("is loading while the group list loads for a signed-in viewer", () => {
    org.isLoading = true
    const { result } = renderHook(() => useGroupAccess(GROUP))
    expect(result.current.status).toBe("loading")
  })

  it("is signed-out when there is no session", () => {
    auth.isAuthenticated = false
    const { result } = renderHook(() => useGroupAccess(GROUP))
    expect(result.current.status).toBe("signed-out")
  })

  it("is not-member once the list settles without the group", () => {
    org.groups = [{ groupDid: "did:plc:other", role: "member", handle: "other.test" }]
    const { result } = renderHook(() => useGroupAccess(GROUP))
    expect(result.current.status).toBe("not-member")
  })

  it("is member for a listed group, or when the account is the group", () => {
    org.groups = [{ groupDid: GROUP, role: "admin", handle: "group.test" }]
    expect(renderHook(() => useGroupAccess(GROUP)).result.current.status).toBe("member")

    org.groups = []
    org.selfGroup = { groupDid: GROUP, role: "owner", handle: "group.test" }
    expect(renderHook(() => useGroupAccess(GROUP)).result.current.status).toBe("member")
  })
})

describe("GroupAccessPage", () => {
  it("explains a non-member visit and links to the group's profile", () => {
    render(
      <GroupAccessPage
        access={{ status: "not-member" }}
        groupDid={GROUP}
        title="Group settings"
        signedOutTitle="Sign in"
        signedOutDescription="Sign in to continue."
      />,
    )
    expect(screen.getByRole("heading", { level: 1, name: "Group settings" })).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "You're not a member of this group" }),
    ).toBeTruthy()
    const link = screen.getByRole("link", { name: "View group profile" })
    expect(link.getAttribute("href")).toBe(`/${GROUP}`)
  })
})
