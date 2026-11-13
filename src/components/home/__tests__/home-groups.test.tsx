import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"

import type { Group } from "@/lib/groups/types"
import { GroupRows, HomeGroups, groupProfileHref } from "../home-sections"

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

const switchActor = vi.fn()
vi.mock("@/lib/groups/use-switch-actor", () => ({
  useSwitchActor: () => switchActor,
}))

afterEach(() => {
  cleanup()
  switchActor.mockReset()
})

describe("groupProfileHref", () => {
  it("links to the group's profile by handle, or by DID until the handle resolves", () => {
    expect(groupProfileHref(GROUPS[0])).toBe("/estuary.certified.app")
    expect(groupProfileHref(GROUPS[1])).toBe("/did:plc:guild")
    expect(groupProfileHref({ groupDid: "did:plc:x", handle: "" })).toBe("/did:plc:x")
  })
})

describe("Home: Your groups", () => {
  it("makes each row a link to the group's profile, with no Switch button", () => {
    render(<HomeGroups />)
    const estuary = screen.getByRole("link", { name: /Estuary Alliance/ })
    expect(estuary.getAttribute("href")).toBe("/estuary.certified.app")
    // The row carries the full name and the role and handle line.
    expect(estuary.textContent).toContain("Admin")
    expect(estuary.textContent).toContain("@estuary.certified.app")
    expect(screen.getByRole("link", { name: /Watershed Guild/ }).getAttribute("href")).toBe(
      "/did:plc:guild",
    )
    expect(screen.queryByRole("button", { name: /Switch to/ })).toBeNull()
  })

  it("keeps New group in the header", () => {
    render(<HomeGroups />)
    expect(screen.getByRole("link", { name: /New group/ }).getAttribute("href")).toBe(
      "/groups/create",
    )
  })
})

describe("Workspace → Groups rows", () => {
  it("keep a Switch button that acts as the group", () => {
    render(<GroupRows groups={GROUPS} size="md" />)
    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("/estuary.certified.app")
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Switch to Estuary Alliance" }))
    expect(switchActor).toHaveBeenCalledWith(GROUPS[0])
  })

  it("use the people size, like Followers (GR1): 40px square avatar, name in body, meta in ui", () => {
    render(<GroupRows groups={GROUPS} size="md" />)
    const row = screen.getAllByRole("listitem")[0]
    expect(row).toHaveClass("records-person")
    const avatar = row.querySelector(".h-10.w-10")
    expect(avatar).not.toBeNull()
    expect(within(row).getByText("Estuary Alliance")).toHaveClass("records-person__name")
    expect(within(row).getByText(/Admin/)).toHaveClass("records-person__handle")
    // The button sits in the people rows' one-width slot.
    expect(within(row).getByRole("button").closest(".records-person__action")).not.toBeNull()
  })

  it("stay compact in Home's Your groups", () => {
    render(<GroupRows groups={GROUPS} size="sm" showSwitch={false} />)
    const row = screen.getAllByRole("listitem")[0]
    expect(row).toHaveClass("home-group")
    expect(row.querySelector(".h-8.w-8")).not.toBeNull()
  })
})
