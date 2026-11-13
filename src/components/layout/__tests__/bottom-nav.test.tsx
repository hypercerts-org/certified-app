import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const state = vi.hoisted(() => ({
  pathname: "/feed",
  isAuthenticated: true,
  isLoading: false,
  isDesktop: false,
}))

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: state.isAuthenticated, isLoading: state.isLoading }),
}))
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: state.isDesktop, isStandalone: false }),
}))

import BottomNav from "../bottom-nav"

beforeEach(() => {
  state.pathname = "/feed"
  state.isAuthenticated = true
  state.isLoading = false
  state.isDesktop = false
})

describe("BottomNav", () => {
  it("shows Workspace and the network, labelled, in a phone browser tab", () => {
    render(<BottomNav />)
    const nav = screen.getByRole("navigation", { name: "Main navigation" })
    const links = Array.from(nav.querySelectorAll("a"))
    expect(links.map((a) => a.textContent)).toEqual(["Workspace", "Feed", "Explore", "Apps"])
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Workspace" })).not.toHaveAttribute("aria-current")
  })

  it("keeps Workspace current on the Records sections", () => {
    state.pathname = "/records"
    render(<BottomNav />)
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("aria-current", "page")
  })

  it("carries no actions: no Create, no Feedback", () => {
    render(<BottomNav />)
    expect(screen.queryByText("Create")).toBeNull()
    expect(screen.queryByText("Feedback")).toBeNull()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  it("shows only the public destinations to signed-out visitors", () => {
    state.isAuthenticated = false
    state.pathname = "/explore"
    render(<BottomNav />)
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Explore", "Apps"])
  })

  it("keeps its place but shows no tabs while auth resolves", () => {
    state.isLoading = true
    render(<BottomNav />)
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
  })

  it("is absent on desktop and on the landing page", () => {
    state.isDesktop = true
    const { unmount } = render(<BottomNav />)
    expect(screen.queryByRole("navigation")).toBeNull()
    unmount()
    state.isDesktop = false
    state.pathname = "/welcome"
    render(<BottomNav />)
    expect(screen.queryByRole("navigation")).toBeNull()
  })
})
