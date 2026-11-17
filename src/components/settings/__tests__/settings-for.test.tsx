import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"

const state = vi.hoisted(() => ({
  groups: [] as Group[],
  selfGroup: null as Group | null,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
    switchOrg: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ handle: "maya.certified.app" }) }))
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { displayName: "Maya Lin" }, avatarUrl: null }),
}))
vi.mock("@/hooks/use-org-profile", () => ({ useOrgProfile: () => ({ orgAvatarUrl: null }) }))

import SettingsFor from "../settings-for"

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
})

describe("SettingsFor", () => {
  it("names you on your settings, as a label rather than a picker", () => {
    const { container } = render(<SettingsFor account={null} />)
    expect(container).toHaveTextContent(/for\s*\S*\s*Maya Lin/)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("names the group on its settings", () => {
    const { container } = render(<SettingsFor account={EARTH} />)
    expect(container).toHaveTextContent(/Ma Earth/)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("is absent with nothing to tell apart", () => {
    state.groups = []
    const { container } = render(<SettingsFor account={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
