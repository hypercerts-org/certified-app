import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"

// Signed-in state, who the viewer acts as, the breakpoint and the switch:
// hoisted latches so each test can set them before rendering.
const state = vi.hoisted(() => ({
  isAuthenticated: true,
  isDesktop: true,
  activeOrg: null as Group | null,
  groups: [] as Group[],
  selfGroup: null as Group | null,
  switchActor: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/feed",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: state.isAuthenticated, isLoading: false }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: state.activeOrg,
    groups: state.groups,
    selfGroup: state.selfGroup,
    switchOrg: vi.fn(),
  }),
}))
vi.mock("@/lib/groups/use-switch-actor", () => ({ useSwitchActor: () => state.switchActor }))
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: state.isDesktop, isStandalone: false }),
}))
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ handle: "maya.certified.app" }) }))
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { displayName: "Maya Lin" }, avatarUrl: null }),
}))
vi.mock("@/hooks/use-org-profile", () => ({ useOrgProfile: () => ({ orgAvatarUrl: null }) }))

import SeenAsSwitcher from "../seen-as-switcher"

const EARTH: Group = {
  groupDid: "did:plc:earth",
  handle: "earth.example",
  displayName: "Ma Earth",
  role: "admin",
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
  state.isAuthenticated = true
  state.isDesktop = true
  state.activeOrg = null
  state.groups = [EARTH]
  state.selfGroup = null
  state.switchActor.mockReset()
})

describe("SeenAsSwitcher", () => {
  it("says the network is seen as you, and lists you and your groups", () => {
    render(<SeenAsSwitcher />)
    const trigger = screen.getByRole("button", { name: /^Seen as\s*Me$/ })
    fireEvent.click(trigger)
    const rows = screen.getAllByRole("menuitemradio")
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Me"),
      expect.stringContaining("Ma Earth"),
    ])
    expect(rows[0]).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("Also switches your workspace.")).toBeInTheDocument()
  })

  it("switches who you act as, and not when picking the current one", () => {
    render(<SeenAsSwitcher />)
    fireEvent.click(screen.getByRole("button", { name: /Seen as/ }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Me/ }))
    expect(state.switchActor).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Seen as/ }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ma Earth/ }))
    expect(state.switchActor).toHaveBeenCalledWith(EARTH)
  })

  it("names the group while seen as it", () => {
    state.activeOrg = EARTH
    render(<SeenAsSwitcher />)
    expect(screen.getByRole("button", { name: /^Seen as\s*Ma Earth$/ })).toBeInTheDocument()
  })

  it("opens a sheet on phones", () => {
    state.isDesktop = false
    render(<SeenAsSwitcher />)
    fireEvent.click(screen.getByRole("button", { name: /Seen as/ }))
    const sheet = screen.getByRole("dialog", { name: "Seen as" })
    fireEvent.click(within(sheet).getByRole("button", { name: /Ma Earth/ }))
    expect(state.switchActor).toHaveBeenCalledWith(EARTH)
  })

  it("is absent with nothing to pick: signed out, no groups, or a group account", () => {
    state.groups = []
    const { unmount } = render(<SeenAsSwitcher />)
    expect(screen.queryByRole("button")).toBeNull()
    unmount()

    state.groups = [EARTH]
    state.isAuthenticated = false
    const second = render(<SeenAsSwitcher />)
    expect(screen.queryByRole("button")).toBeNull()
    second.unmount()

    state.isAuthenticated = true
    state.selfGroup = { ...EARTH, groupDid: "did:plc:me" }
    render(<SeenAsSwitcher />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
