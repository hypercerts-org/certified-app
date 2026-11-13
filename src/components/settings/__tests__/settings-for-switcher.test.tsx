import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"

// Signed-in state, groups, breakpoint and router: hoisted latches.
const state = vi.hoisted(() => ({
  groups: [] as Group[],
  selfGroup: null as Group | null,
  push: vi.fn(),
  switchOrg: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: true, isLoading: false }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: null,
    groups: state.groups,
    selfGroup: state.selfGroup,
    isLoading: false,
    switchOrg: state.switchOrg,
  }),
}))
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: true, isStandalone: false }),
}))
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ handle: "maya.certified.app" }) }))
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { displayName: "Maya Lin" }, avatarUrl: null }),
}))
vi.mock("@/hooks/use-org-profile", () => ({ useOrgProfile: () => ({ orgAvatarUrl: null }) }))

import SettingsForSwitcher from "../settings-for-switcher"

const EARTH: Group = {
  groupDid: "did:plc:earth",
  handle: "earth.example",
  displayName: "Ma Earth",
  role: "admin",
  accepted: true,
}

beforeEach(() => {
  state.groups = [EARTH]
  state.selfGroup = null
  state.push.mockReset()
  state.switchOrg.mockReset()
  window.location.hash = ""
})

describe("SettingsForSwitcher", () => {
  it("reads 'for Me' on your settings and opens a group's settings", () => {
    render(<SettingsForSwitcher current={null} />)
    fireEvent.click(screen.getByRole("button", { name: /^for\s*Me$/ }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ma Earth/ }))
    expect(state.push).toHaveBeenCalledWith("/groups/did%3Aplc%3Aearth/settings")
    // Whose settings you look at never changes the workspace.
    expect(state.switchOrg).not.toHaveBeenCalled()
  })

  it("names the group on its settings, goes back to yours, and keeps the section", () => {
    window.location.hash = "#account"
    render(<SettingsForSwitcher current={EARTH} />)
    fireEvent.click(screen.getByRole("button", { name: /^for\s*Ma Earth$/ }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Me/ }))
    expect(state.push).toHaveBeenCalledWith("/settings#account")
  })

  it("is absent with nothing to pick", () => {
    state.groups = []
    render(<SettingsForSwitcher current={null} />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
