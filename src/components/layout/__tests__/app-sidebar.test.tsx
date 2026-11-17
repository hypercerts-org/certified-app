import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react"

const state = vi.hoisted(() => ({
  pathname: "/feed",
  search: "",
  isAuthenticated: true,
  isLoading: false,
  openSignIn: vi.fn(),
  pageTitle: null as string | null,
  hasPageHeader: true,
  activeOrg: null as { groupDid: string } | null,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    openSignIn: state.openSignIn,
  }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: state.activeOrg }),
}))

vi.mock("@/hooks/use-mounted", () => ({ useMounted: () => true }))

vi.mock("@/lib/navbar-context", () => ({
  useNavbarValues: () => ({ pageTitle: state.pageTitle, desktopTitle: null, breadcrumb: null }),
  useHasPageHeader: () => state.hasPageHeader,
}))

// The search has its own tests; here it only needs to take its place.
vi.mock("@/components/search/global-search", () => ({
  default: () => <input type="search" aria-label="Search" />,
}))

// The account control has its own tests (account-switcher.test.tsx).
vi.mock("../account-switcher", () => ({
  DesktopAccountSwitcher: () => <button type="button">Maya Lin, account menu</button>,
}))

import AppSidebar from "../app-sidebar"

beforeEach(() => {
  state.pathname = "/feed"
  state.search = ""
  state.isAuthenticated = true
  state.isLoading = false
  state.pageTitle = null
  state.hasPageHeader = true
  state.activeOrg = null
  state.openSignIn.mockReset()
  delete document.documentElement.dataset.sidebar
  localStorage.clear()
})

afterEach(() => cleanup())

function full(container: HTMLElement) {
  return container.querySelector<HTMLElement>(".app-sidebar__full")!
}
function rail(container: HTMLElement) {
  return container.querySelector<HTMLElement>(".app-sidebar__rail")!
}
function labels(el: HTMLElement) {
  return Array.from(el.querySelectorAll(".app-sidebar__item")).map((i) => i.textContent)
}

describe("AppSidebar", () => {
  it("is the banner: the brand, the account control and the main navigation", () => {
    render(<AppSidebar />)
    const banner = screen.getByRole("banner")
    expect(within(banner).getByRole("link", { name: "Certified home" })).toHaveAttribute("href", "/home")
    expect(within(banner).getByRole("button", { name: /account menu/ })).toBeInTheDocument()
    expect(within(banner).getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument()
  })

  it("lists every page from 1300px: the Workspace's sections, the Network's pages, Apps", () => {
    const { container } = render(<AppSidebar />)
    expect(labels(full(container))).toEqual([
      "Overview",
      "Projects and activities",
      "Endorsements",
      "Followers",
      "Lists",
      "Groups",
      "Feed",
      "Explore",
      "Graph",
      "Map",
      "Funding",
      "Apps",
    ])
    // Each group under a heading, Apps too.
    expect(
      Array.from(full(container).querySelectorAll(".app-sidebar__group-label")).map((l) => l.textContent),
    ).toEqual(["Workspace", "Network", "Ecosystem"])
    expect(within(full(container)).getByRole("list", { name: "Ecosystem" })).toContainElement(
      within(full(container)).getByRole("link", { name: "Apps" }),
    )
    expect(within(full(container)).getByRole("link", { name: "Feed" })).toHaveAttribute("aria-current", "page")
  })

  it("on the rail, is Workspace, Network and Apps, each labelled", () => {
    const { container } = render(<AppSidebar />)
    expect(labels(rail(container))).toEqual(["Workspace", "Network", "Apps"])
    expect(within(rail(container)).getByRole("button", { name: "Network" })).toHaveAttribute("data-current")
  })

  it("marks the Records section from ?kind=", () => {
    state.pathname = "/records"
    state.search = "kind=lists"
    const { container } = render(<AppSidebar />)
    expect(within(full(container)).getByRole("link", { name: "Lists" })).toHaveAttribute("aria-current", "page")
    expect(within(rail(container)).getByRole("button", { name: "Workspace" })).toHaveAttribute("data-current")
  })

  it("opens the Workspace's sections from the rail as a menu, as Network does its pages", () => {
    state.pathname = "/records"
    state.search = "kind=lists"
    const { container } = render(<AppSidebar />)
    fireEvent.click(within(rail(container)).getByRole("button", { name: "Workspace" }))
    const menu = screen.getByRole("menu", { name: "Workspace" })
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Overview",
      "Projects and activities",
      "Endorsements",
      "Followers",
      "Lists",
      "Groups",
    ])
    expect(within(menu).getByRole("menuitem", { name: "Lists" })).toHaveAttribute("aria-current", "page")
  })

  it("opens the Network's pages from the rail as a menu", () => {
    const { container } = render(<AppSidebar />)
    fireEvent.click(within(rail(container)).getByRole("button", { name: "Network" }))
    const menu = screen.getByRole("menu", { name: "Network" })
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Feed",
      "Explore",
      "Graph",
      "Map",
      "Funding",
    ])
  })

  it("keeps Help and Settings at the bottom, then Collapse", () => {
    const { container } = render(<AppSidebar />)
    const bottom = container.querySelector<HTMLElement>(".app-sidebar__bottom")!
    expect(labels(bottom)).toEqual(["Help", "Settings", "Collapse"])
  })

  it("collapses to the rail and back, remembered in this browser", () => {
    render(<AppSidebar />)
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" })
    // Not aria-expanded: the sidebar styles that as a selected (open) item.
    expect(toggle).not.toHaveAttribute("aria-expanded")
    fireEvent.click(toggle)
    expect(document.documentElement.dataset.sidebar).toBe("rail")
    expect(localStorage.getItem("certified_sidebar")).toBe("rail")
    const expand = screen.getByRole("button", { name: "Expand sidebar" })
    expect(expand).not.toHaveAttribute("aria-expanded")
    fireEvent.click(expand)
    expect(document.documentElement.dataset.sidebar).toBeUndefined()
    expect(localStorage.getItem("certified_sidebar")).toBeNull()
  })

  it("holds the search: the field (from 1300px) and the rail's Search item", () => {
    const { container } = render(<AppSidebar />)
    expect(container.querySelector(".app-sidebar__search")).toContainElement(
      screen.getByRole("searchbox", { name: "Search" }),
    )
    const item = screen.getByRole("button", { name: "Search" })
    fireEvent.click(item)
    expect(screen.getByRole("group", { name: "Search" })).toBeInTheDocument()
  })

  it("gives a page without a PageHeader its h1, visually hidden", () => {
    state.hasPageHeader = false
    state.pageTitle = "Funding"
    render(<AppSidebar />)
    expect(screen.getByRole("heading", { level: 1, name: "Funding" })).toHaveClass("sr-only")
  })

  it("signed out: Sign in in the account slot, the public pages, Help", () => {
    state.isAuthenticated = false
    const { container } = render(<AppSidebar />)
    expect(screen.getByRole("link", { name: "Certified home" })).toHaveAttribute("href", "/welcome")
    // A rail item and, from 1300px, the primary button (CSS shows one).
    const signIns = screen.getAllByRole("button", { name: "Sign in" })
    expect(signIns).toHaveLength(2)
    fireEvent.click(signIns[0])
    expect(state.openSignIn).toHaveBeenCalled()
    expect(labels(full(container))).toEqual(["Explore", "Graph", "Map", "Funding", "Apps"])
    expect(labels(rail(container))).toEqual(["Network", "Apps"])
    expect(labels(container.querySelector<HTMLElement>(".app-sidebar__bottom")!)).toEqual(["Help", "Collapse"])
  })

  it("while sign-in is checked, shows a placeholder and no rows, so nothing is inserted later", () => {
    state.isLoading = true
    const { container } = render(<AppSidebar />)
    expect(container.querySelector(".app-sidebar__account-placeholder")).not.toBeNull()
    expect(screen.queryByRole("navigation")).toBeNull()
  })

  it("is absent on routes without the app chrome", () => {
    for (const path of ["/welcome", "/privacy", "/embed/board"]) {
      state.pathname = path
      const { container } = render(<AppSidebar />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })
})

describe("AppSidebar Settings", () => {
  it("opens the settings of the account you act as, and is current on any account's settings", () => {
    state.activeOrg = { groupDid: "did:plc:earth" }
    state.pathname = "/groups/did%3Aplc%3Aearth/settings"
    render(<AppSidebar />)
    const links = screen.getAllByRole("link", { name: "Settings" })
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/groups/did%3Aplc%3Aearth/settings")
      expect(link).toHaveAttribute("aria-current", "page")
    }
  })

  it("opens yours when you act as yourself", () => {
    render(<AppSidebar />)
    for (const link of screen.getAllByRole("link", { name: "Settings" })) {
      expect(link).toHaveAttribute("href", "/settings")
    }
  })
})
