import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const state = vi.hoisted(() => ({
  pathname: "/feed",
  search: "",
  isAuthenticated: true,
  isLoading: false,
  isDesktop: false,
  openFeedback: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    did: "did:plc:me",
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
  }),
}))
vi.mock("@/lib/feedback-context", () => ({
  useFeedback: () => ({ openFeedback: state.openFeedback }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, groups: [], selfGroup: null, switchOrg: vi.fn() }),
}))
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ handle: "maya.certified.app" }) }))
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { displayName: "Maya Lin" }, avatarUrl: null }),
}))
vi.mock("@/hooks/use-org-profile", () => ({ useOrgProfile: () => ({ orgAvatarUrl: null }) }))
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: state.isDesktop, isStandalone: false }),
}))

import BottomNav from "../bottom-nav"

beforeEach(() => {
  state.pathname = "/feed"
  state.search = ""
  state.isAuthenticated = true
  state.isLoading = false
  state.isDesktop = false
})

describe("BottomNav (the phone pill)", () => {
  it("shows Workspace, Network and Apps, labelled, in a phone browser tab", () => {
    render(<BottomNav />)
    const nav = screen.getByRole("navigation", { name: "Main navigation" })
    const labels = Array.from(nav.querySelectorAll(".bottom-nav__item .bottom-nav__label"))
    expect(labels.map((t) => t.textContent)).toEqual(["Workspace", "Network", "Apps"])
    expect(screen.getByRole("button", { name: "Network" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "Workspace" })).not.toHaveAttribute("aria-current")
  })

  it("keeps Workspace current on the Records sections", () => {
    state.pathname = "/records"
    render(<BottomNav />)
    expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute("aria-current", "page")
  })

  it("opens the Workspace's sections as a menu above the pill, the current one checked", () => {
    state.pathname = "/records"
    state.search = "kind=followers"
    render(<BottomNav />)
    fireEvent.click(screen.getByRole("button", { name: "Workspace" }))
    const menu = screen.getByRole("menu", { name: "Workspace" })
    expect(menu).toHaveAttribute("data-side", "top")
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Overview",
      "Projects and activities",
      "Endorsements",
      "Followers",
      "Lists",
      "Groups",
    ])
    expect(screen.getByRole("menuitem", { name: "Followers" })).toHaveAttribute("aria-current", "page")
  })

  it("dims the page behind an open menu, and lifts it when the menu closes", () => {
    render(<BottomNav />)
    const scrims = () => document.querySelectorAll(".pill-scrim[data-open]")
    expect(scrims()).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Network" }))
    expect(scrims()).toHaveLength(1)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(scrims()).toHaveLength(0)
  })

  it("marks the item whose menu is open (the open state in layout.css keys on it)", () => {
    // On the Feed (Network's page), open the Workspace menu.
    render(<BottomNav />)
    const workspace = screen.getByRole("button", { name: "Workspace" })
    const network = screen.getByRole("button", { name: "Network" })
    expect(workspace).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(workspace)
    expect(workspace).toHaveAttribute("aria-expanded", "true")
    expect(network).toHaveAttribute("aria-expanded", "false")
    // The page's own item keeps its class; CSS steps it back while the
    // other menu is open.
    expect(network).toHaveClass("bottom-nav__item--active")
  })

  it("never shows an avatar: who you act as is the top bar's account control", () => {
    const { container } = render(<BottomNav />)
    expect(container.querySelector(".acting-avatar")).toBeNull()
  })

  it("has no More: Settings, Help, feedback and the legal links are in the account sheet", () => {
    render(<BottomNav />)
    expect(screen.queryByRole("button", { name: "More" })).toBeNull()
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Workspace", "Network"])
  })

  it("shows only the public destinations to signed-out visitors", () => {
    state.isAuthenticated = false
    state.pathname = "/explore"
    render(<BottomNav />)
    const nav = screen.getByRole("navigation", { name: "Main navigation" })
    expect(Array.from(nav.querySelectorAll(".bottom-nav__item")).map((t) => t.textContent)).toEqual([
      "Network",
      "Apps",
    ])
  })

  it("keeps its place but shows no items while auth resolves", () => {
    state.isLoading = true
    render(<BottomNav />)
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  it("is absent on desktop, on the landing page and on forms", () => {
    state.isDesktop = true
    const { unmount } = render(<BottomNav />)
    expect(screen.queryByRole("navigation")).toBeNull()
    unmount()
    state.isDesktop = false
    for (const path of ["/welcome", "/create"]) {
      state.pathname = path
      const { unmount: u } = render(<BottomNav />)
      expect(screen.queryByRole("navigation")).toBeNull()
      u()
    }
  })
})
