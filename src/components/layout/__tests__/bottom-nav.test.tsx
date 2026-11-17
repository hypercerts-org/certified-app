import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"

const state = vi.hoisted(() => ({
  pathname: "/feed",
  isAuthenticated: true,
  isLoading: false,
  isDesktop: false,
  openFeedback: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
  state.isAuthenticated = true
  state.isLoading = false
  state.isDesktop = false
})

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

describe("BottomNav (the phone pill)", () => {
  it("shows Workspace, Network, Apps and More, labelled, in a phone browser tab", () => {
    render(<BottomNav />)
    const nav = screen.getByRole("navigation", { name: "Main navigation" })
    const labels = Array.from(nav.querySelectorAll(".bottom-nav__item .bottom-nav__label"))
    expect(labels.map((t) => t.textContent)).toEqual(["Workspace", "Network", "Apps", "More"])
    expect(screen.getByRole("button", { name: "Network" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Workspace" })).not.toHaveAttribute("aria-current")
  })

  it("keeps Workspace current on the Records sections", () => {
    state.pathname = "/records"
    render(<BottomNav />)
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("aria-current", "page")
  })

  it("never shows an avatar: who you act as is the top bar's account control", () => {
    const { container } = render(<BottomNav />)
    expect(container.querySelector(".acting-avatar")).toBeNull()
  })

  it("opens More with Help, Settings, feedback and the legal links", async () => {
    polyfillDialog()
    render(<BottomNav />)
    const more = screen.getByRole("button", { name: "More" })
    expect(more).toHaveAttribute("aria-haspopup", "dialog")
    await act(async () => {
      fireEvent.click(more)
    })
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help")
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }))
    expect(state.openFeedback).toHaveBeenCalled()
    const legal = screen.getByRole("navigation", { name: "Legal" })
    expect(legal).toHaveTextContent("Terms")
  })

  it("shows only the public destinations to signed-out visitors", () => {
    state.isAuthenticated = false
    state.pathname = "/explore"
    render(<BottomNav />)
    const nav = screen.getByRole("navigation", { name: "Main navigation" })
    expect(Array.from(nav.querySelectorAll(".bottom-nav__item")).map((t) => t.textContent)).toEqual([
      "Network",
      "Apps",
      "More",
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
