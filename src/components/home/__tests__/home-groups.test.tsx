import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

import type { Group } from "@/lib/groups/types"
import { HomeGroups, groupProfileHref } from "../home-sections"

const GROUPS: Group[] = [
  {
    groupDid: "did:plc:estuary",
    handle: "estuary.certified.app",
    displayName: "Estuary Alliance",
    role: "admin",
    accepted: true,
  },
  {
    // Handle not resolved yet: it is the DID.
    groupDid: "did:plc:guild",
    handle: "did:plc:guild",
    displayName: "Watershed Guild",
    role: "owner",
    accepted: true,
  },
]

const orgMock = vi.fn(() => ({ groups: GROUPS, isLoading: false }))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => orgMock(),
}))

afterEach(() => {
  cleanup()
})

describe("groupProfileHref", () => {
  it("links to the group's profile by handle, or by DID until the handle resolves", () => {
    expect(groupProfileHref(GROUPS[0])).toBe("/estuary.certified.app")
    expect(groupProfileHref(GROUPS[1])).toBe("/did:plc:guild")
    expect(groupProfileHref({ groupDid: "did:plc:x", handle: "" })).toBe("/did:plc:x")
  })
})

describe("Home: Your groups", () => {
  it("makes each row a link to the group's profile, with no Act as button", () => {
    render(<HomeGroups profileBase="/me.test" />)
    const estuary = screen.getByRole("link", { name: /Estuary Alliance/ })
    expect(estuary.getAttribute("href")).toBe("/estuary.certified.app")
    // The row carries the full name and the role and handle line.
    expect(estuary.textContent).toContain("Admin")
    expect(estuary.textContent).toContain("@estuary.certified.app")
    expect(screen.getByRole("link", { name: /Watershed Guild/ }).getAttribute("href")).toBe(
      "/did:plc:guild",
    )
    expect(screen.queryByRole("button", { name: /Act as/ })).toBeNull()
  })

  it("links to every group on your profile once there are more than it shows", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...GROUPS[0],
      groupDid: `did:plc:g${i}`,
      handle: `g${i}.certified.app`,
      displayName: `Group ${i}`,
    }))
    orgMock.mockImplementation(() => ({ groups: many, isLoading: false }))
    render(<HomeGroups profileBase="/me.test" />)
    expect(screen.getByRole("link", { name: "All 6 groups" })).toHaveAttribute("href", "/me.test?tab=groups")
    orgMock.mockImplementation(() => ({ groups: GROUPS, isLoading: false }))
  })

  it("keeps New group in the header", () => {
    render(<HomeGroups profileBase="/me.test" />)
    expect(screen.getByRole("link", { name: /New group/ }).getAttribute("href")).toBe(
      "/groups/create",
    )
  })
})
