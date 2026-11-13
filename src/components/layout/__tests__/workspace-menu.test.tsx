import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"

// Who is signed in (auth, session, profile), who they act as (org context)
// and where they are (pathname, router). Hoisted latches so each test can
// set the state before rendering.
const state = vi.hoisted(() => ({
  pathname: "/feed",
  activeOrg: null as Group | null,
  groups: [] as Group[],
  selfGroup: null as Group | null,
  switchOrg: vi.fn(),
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: true, isLoading: false }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: state.activeOrg,
    groups: state.groups,
    selfGroup: state.selfGroup,
    switchOrg: state.switchOrg,
  }),
}))

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: "maya.certified.app" }),
}))

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { displayName: "Maya Lin" }, avatarUrl: null }),
}))

vi.mock("@/hooks/use-org-profile", () => ({
  useOrgProfile: () => ({ orgAvatarUrl: null }),
}))

import { DesktopWorkspaceMenu, PhoneWorkspaceTab } from "../workspace-menu"

const EARTH: Group = {
  groupDid: "did:plc:earth",
  handle: "earth.example",
  displayName: "Ma Earth",
  role: "admin",
  accepted: true,
}
const RIVER: Group = {
  groupDid: "did:plc:river",
  handle: "river.example",
  displayName: "River Trust",
  role: "owner",
  accepted: true,
}

function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
    __polyfilled?: boolean
  }
  if (proto.__polyfilled) return
  proto.__polyfilled = true
  proto.showModal = function () {
    ;(this as unknown as { open: boolean }).open = true
  }
  proto.close = function () {
    ;(this as unknown as { open: boolean }).open = false
    ;(this as unknown as HTMLDialogElement).dispatchEvent(new Event("close"))
  }
}

beforeEach(() => {
  polyfillDialog()
  state.pathname = "/feed"
  state.activeOrg = null
  state.groups = [EARTH, RIVER]
  state.selfGroup = null
  state.switchOrg.mockReset()
  state.push.mockReset()
})

function openDesktopMenu() {
  render(<DesktopWorkspaceMenu />)
  fireEvent.click(screen.getByRole("button", { name: /switch workspace/ }))
}

describe("DesktopWorkspaceMenu", () => {
  it("calls yours My workspace (not your name, which the account button shows)", () => {
    state.pathname = "/home"
    render(<DesktopWorkspaceMenu />)
    const trigger = screen.getByRole("button", { name: "My workspace, switch workspace" })
    expect(trigger).toHaveTextContent("My workspace")
    expect(trigger).not.toHaveTextContent("Maya Lin")
    expect(trigger).toHaveAttribute("data-current")
    fireEvent.click(trigger)

    const rows = screen.getAllByRole("menuitemradio")
    // Yours first, then the groups you run before the ones you're in.
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("My workspace"),
      expect.stringContaining("River Trust"),
      expect.stringContaining("Ma Earth"),
    ])
    expect(rows[0]).toHaveAttribute("aria-checked", "true")
    expect(within(rows[0]).getByText("@maya.certified.app")).toBeInTheDocument()
    // The role is quiet text in the secondary line, not a badge.
    expect(within(rows[2]).getByText("@earth.example · Admin")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "New group" })).toHaveAttribute(
      "href",
      "/groups/create",
    )
  })

  it("isn't current outside the Workspace", () => {
    render(<DesktopWorkspaceMenu />)
    expect(screen.getByRole("button", { name: /switch workspace/ })).not.toHaveAttribute(
      "data-current",
    )
  })

  it("from outside the Workspace, switches and opens that workspace's Overview", () => {
    openDesktopMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ma Earth/ }))
    expect(state.switchOrg).toHaveBeenCalledWith(EARTH)
    expect(state.push).toHaveBeenCalledWith("/home")
  })

  it("picking the current workspace from outside just opens it", () => {
    openDesktopMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /My workspace/ }))
    expect(state.switchOrg).not.toHaveBeenCalled()
    expect(state.push).toHaveBeenCalledWith("/home")
  })

  it("inside the Workspace, stays on the section when it works for the new account", () => {
    state.pathname = "/records"
    state.activeOrg = EARTH
    openDesktopMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /My workspace/ }))
    expect(state.switchOrg).toHaveBeenCalledWith(null)
    expect(state.push).not.toHaveBeenCalled()
  })

  it("picking a group on a Records section goes to its Overview (Records are personal)", () => {
    state.pathname = "/records"
    openDesktopMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /River Trust/ }))
    expect(state.switchOrg).toHaveBeenCalledWith(RIVER)
    expect(state.push).toHaveBeenCalledWith("/home")
  })

  it("shows the group while acting as it", () => {
    state.activeOrg = EARTH
    render(<DesktopWorkspaceMenu />)
    expect(
      screen.getByRole("button", { name: "Ma Earth, workspace, switch workspace" }),
    ).toHaveTextContent("Ma Earth")
  })

  it("puts a settings gear on every workspace, apart from the row that switches", () => {
    openDesktopMenu()
    expect(screen.getByRole("menuitem", { name: "Your settings" })).toHaveAttribute(
      "href",
      "/settings",
    )
    expect(screen.getByRole("menuitem", { name: "Ma Earth settings" })).toHaveAttribute(
      "href",
      "/groups/did%3Aplc%3Aearth/settings",
    )
    expect(screen.getByRole("menuitem", { name: "River Trust settings" })).toBeInTheDocument()
    // The row itself still just switches; no separate "Group settings".
    expect(screen.queryByRole("menuitem", { name: "Group settings" })).toBeNull()
    fireEvent.click(screen.getByRole("menuitem", { name: "Ma Earth settings" }))
    expect(state.switchOrg).not.toHaveBeenCalled()
  })

  it("is a plain link to the Overview with only one workspace", () => {
    state.groups = []
    state.pathname = "/home"
    render(<DesktopWorkspaceMenu />)
    expect(screen.queryByRole("button")).toBeNull()
    const link = screen.getByRole("link", { name: "My workspace" })
    expect(link).toHaveAttribute("href", "/home")
    expect(link).toHaveAttribute("aria-current", "page")
  })

  it("has no menu for an account that is itself a group", () => {
    state.selfGroup = { ...RIVER, groupDid: "did:plc:me" }
    state.groups = []
    render(<DesktopWorkspaceMenu />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/home")
  })
})

describe("PhoneWorkspaceTab", () => {
  it("names the group in a group's workspace", () => {
    state.activeOrg = EARTH
    render(<PhoneWorkspaceTab />)
    expect(screen.getByRole("button", { name: "Workspace, Ma Earth" })).toBeInTheDocument()
  })

  it("opens your workspaces as a sheet, and switches from it", () => {
    render(<PhoneWorkspaceTab />)
    const tab = screen.getByRole("button", { name: "Workspace" })
    expect(tab).not.toHaveAttribute("aria-current")
    fireEvent.click(tab)
    const sheet = screen.getByRole("dialog", { name: "Workspace" })
    const earth = within(sheet).getByRole("button", { name: /Ma Earth/ })
    expect(within(sheet).getByRole("button", { name: /My workspace/ })).toHaveAttribute(
      "aria-current",
      "true",
    )
    fireEvent.click(earth)
    expect(state.switchOrg).toHaveBeenCalledWith(EARTH)
    expect(state.push).toHaveBeenCalledWith("/home")
  })

  it("goes straight to the Overview with only one workspace", () => {
    state.groups = []
    state.pathname = "/records"
    render(<PhoneWorkspaceTab />)
    const tab = screen.getByRole("link", { name: "Workspace" })
    expect(tab).toHaveAttribute("href", "/home")
    expect(tab).toHaveAttribute("aria-current", "page")
  })
})
