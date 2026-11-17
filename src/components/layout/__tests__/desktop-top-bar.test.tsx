import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, cleanup, screen } from "@testing-library/react"

// The desktop content strip: search and New, beside the sidebar. On
// /explore, which has its own search box, the global search steps aside but
// its slot stays (an empty, aria-hidden placeholder of the same size), so
// New sits where it does on Feed, Graph and Map.

const state = vi.hoisted(() => ({ pathname: "/feed", isAuthenticated: true }))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isLoading: false, isAuthenticated: state.isAuthenticated, openSignIn: vi.fn() }),
}))

vi.mock("@/lib/navbar-context", () => ({
  useHasPageHeader: () => true,
  useNavbarValues: () => ({ pageTitle: null, desktopTitle: null, breadcrumb: null }),
}))

// The menu and the search have their own tests; here they only need to
// take their place in the row.
vi.mock("@/components/search/global-search", () => ({
  default: () => <input type="search" aria-label="Search" />,
}))
vi.mock("../new-menu", () => ({ DesktopNewMenu: () => <button type="button">New</button> }))

import DesktopTopBar from "../desktop-top-bar"

beforeEach(() => {
  state.pathname = "/feed"
  state.isAuthenticated = true
})

afterEach(() => {
  cleanup()
})

function row(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".desktop-top-bar__row")
  if (!el) throw new Error("no row")
  return el
}

describe("DesktopTopBar (the content strip)", () => {
  it("holds the search, then New", () => {
    const { container } = render(<DesktopTopBar />)
    const children = Array.from(row(container).children)
    expect(children).toHaveLength(2)
    expect(children[0]).toContainElement(screen.getByRole("searchbox", { name: "Search" }))
    expect(children[1]).toHaveTextContent("New")
    // The sidebar is the banner; the strip is a plain block.
    expect(container.querySelector("header")).toBeNull()
  })

  it("keeps the slot, empty and hidden from assistive tech, on Explore", () => {
    state.pathname = "/explore"
    const { container } = render(<DesktopTopBar />)
    const slot = row(container).children[0]
    expect(slot).toHaveAttribute("aria-hidden", "true")
    expect(slot).toBeEmptyDOMElement()
    expect(row(container).children[1]).toHaveTextContent("New")
  })

  it("keeps the slot on Explore's sub-routes too", () => {
    state.pathname = "/explore/projects"
    const { container } = render(<DesktopTopBar />)
    expect(row(container).children[0]).toHaveAttribute("aria-hidden", "true")
  })

  it("offers only the search to signed-out visitors (Sign in is in the sidebar)", () => {
    state.isAuthenticated = false
    render(<DesktopTopBar />)
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument()
  })

  it("is absent on routes without the app chrome", () => {
    for (const path of ["/welcome", "/terms", "/embed/board"]) {
      state.pathname = path
      const { container } = render(<DesktopTopBar />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })
})
