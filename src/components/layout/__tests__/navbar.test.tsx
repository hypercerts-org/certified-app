import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// The phone top bar: wordmark + Beta on top-level pages, a back chevron on every
// other page (PageHeader or not), and the compact title only when no
// PageHeader owns the h1.

const state = vi.hoisted(() => ({
  pathname: "/home",
  hasPageHeader: false,
  hasPageHeaderBack: false,
  pageTitle: null as string | null,
  barTitle: null as string | null,
  isAuthenticated: true,
  isLoading: false,
  groups: [] as { groupDid: string }[],
  navHidden: false,
  transitionBack: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    did: "did:plc:me",
    openSignIn: vi.fn(),
  }),
}))

vi.mock("@/lib/navbar-context", () => ({
  useNavbarValues: () => ({
    pageTitle: state.pageTitle,
    breadcrumb: null,
    recordMenu: null,
    barTitle: state.barTitle,
  }),
  useHasPageHeader: () => state.hasPageHeader,
  useHasPageHeaderBack: () => state.hasPageHeaderBack,
}))

vi.mock("@/lib/view-transitions", () => ({
  useViewTransition: () => ({ transitionBack: state.transitionBack }),
}))

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: "maya.certified.app" }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, groups: state.groups, selfGroup: null }),
}))

vi.mock("@/hooks/use-scroll-hide-navbar", () => ({
  useScrollHideNavbar: () => ({ scrolled: false, navHidden: state.navHidden }),
}))

vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: false }),
}))

vi.mock("../account-switcher", () => ({
  PhoneAccountSwitcher: () => <button type="button">Account</button>,
}))

// The search panel has its own tests (phone-search.test.tsx).
vi.mock("../phone-search", () => ({
  default: () => <button type="button">Search</button>,
}))


vi.mock("@/components/lists/add-to-list-menu", () => ({
  default: () => null,
}))

import Navbar from "../navbar"

beforeEach(() => {
  state.pathname = "/home"
  state.hasPageHeader = false
  state.hasPageHeaderBack = false
  state.pageTitle = null
  state.barTitle = null
  state.isAuthenticated = true
  state.isLoading = false
  state.groups = []
  state.navHidden = false
  state.transitionBack.mockReset()
})

describe("Navbar (phone)", () => {
  it("hides on scroll for an account with nothing to switch", () => {
    state.navHidden = true
    const { container } = render(<Navbar />)
    expect(container.querySelector("header")).toHaveClass("navbar--hidden")
  })

  it("stays put for someone who can act as a group: it shows who they act as", () => {
    state.navHidden = true
    state.groups = [{ groupDid: "did:plc:earth" }]
    const { container } = render(<Navbar />)
    expect(container.querySelector("header")).not.toHaveClass("navbar--hidden")
  })

  it("shows the brandmark and the account control on a top-level page, and no +", () => {
    state.hasPageHeader = true
    render(<Navbar />)
    expect(screen.getByRole("link", { name: "Certified home" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull()
    // You create from the Workspace; the bar has no New.
    expect(screen.queryByRole("button", { name: "New" })).toBeNull()
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument()
  })

  it("shows the Certified.app wordmark (with its Beta pill) on a top-level page", () => {
    state.hasPageHeader = true
    const { container } = render(<Navbar />)
    expect(container.querySelector(".navbar__logo--wordmark svg")).not.toBeNull()
  })

  it("keeps the square brandmark, not the wordmark, while the compact title shows", () => {
    state.pageTitle = "Home"
    const { container } = render(<Navbar />)
    expect(screen.getByRole("link", { name: "Certified home" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument()
    expect(container.querySelector(".navbar__logo--wordmark")).toBeNull()
  })

  it("on a top-level page, shows the page header's title beside the brandmark", () => {
    state.pathname = "/feed"
    state.hasPageHeader = true
    state.barTitle = "Feed"
    const { container } = render(<Navbar />)
    expect(screen.getByRole("link", { name: "Certified home" })).toBeInTheDocument()
    expect(container.querySelector(".navbar__logo--wordmark")).toBeNull()
    const title = container.querySelector(".navbar__title")
    expect(title).toHaveTextContent("Feed")
    // The h1 stays the page header's (visually hidden on phones).
    expect(title).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
  })

  it("keeps the wordmark on a top-level page without a title (the Overview)", () => {
    state.pathname = "/home"
    state.hasPageHeader = true
    const { container } = render(<Navbar />)
    expect(container.querySelector(".navbar__logo--wordmark")).not.toBeNull()
    expect(container.querySelector(".navbar__title")).toBeNull()
  })

  it("treats your own profile as top-level", () => {
    state.pathname = "/maya.certified.app"
    state.hasPageHeader = true
    render(<Navbar />)
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull()
  })

  it("keeps a back chevron on a record page that renders a PageHeader, with no second title", () => {
    state.pathname = "/maya.certified.app/activity/3k2"
    state.hasPageHeader = true
    state.pageTitle = "Mangrove replanting"
    render(<Navbar />)
    const back = screen.getByRole("button", { name: "Go back" })
    expect(screen.queryByRole("link", { name: "Certified home" })).toBeNull()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument()
    fireEvent.click(back)
    expect(state.transitionBack).toHaveBeenCalledTimes(1)
  })

  it("shows no second back chevron when the page header has its own back link", () => {
    state.pathname = "/create"
    state.hasPageHeader = true
    state.hasPageHeaderBack = true
    render(<Navbar />)
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull()
    expect(screen.getByRole("link", { name: "Certified home" })).toBeInTheDocument()
  })

  it("keeps a back chevron on someone else's profile", () => {
    state.pathname = "/rosa.example"
    state.hasPageHeader = true
    render(<Navbar />)
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument()
  })

  it("shows the compact title as the h1 on a page without a PageHeader", () => {
    state.pathname = "/endorsement-graph"
    state.pageTitle = "Endorsement graph"
    render(<Navbar />)
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Endorsement graph" })).toBeInTheDocument()
  })

  it("offers Sign in to signed-out visitors on a detail page", () => {
    state.pathname = "/rosa.example/project/3k2"
    state.hasPageHeader = true
    state.isAuthenticated = false
    render(<Navbar />)
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument()
    // On the 16px gutter (layout.css).
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveClass("navbar__sign-in")
  })

  it("puts Search before the account control on a top-level page", () => {
    state.pathname = "/feed"
    state.hasPageHeader = true
    state.barTitle = "Feed"
    const { container } = render(<Navbar />)
    const right = container.querySelector<HTMLElement>(".navbar__right")!
    expect(Array.from(right.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "Search",
      "Account",
    ])
  })

  it("offers Search signed out too, before Sign in", () => {
    state.pathname = "/map"
    state.hasPageHeader = true
    state.isAuthenticated = false
    const { container } = render(<Navbar />)
    const right = container.querySelector<HTMLElement>(".navbar__right")!
    expect(Array.from(right.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "Search",
      "Sign in",
    ])
  })

  it("has no Search on Explore, whose own field is right under the bar", () => {
    state.pathname = "/explore"
    state.hasPageHeader = true
    state.barTitle = "Explore"
    render(<Navbar />)
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull()
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument()
  })

  it("stands while sign-in resolves: the mark and the title, the right side empty", () => {
    state.isLoading = true
    state.pathname = "/feed"
    state.hasPageHeader = true
    state.barTitle = "Feed"
    const { container } = render(<Navbar />)
    expect(container.querySelector("header.navbar")).not.toBeNull()
    expect(container.querySelector(".navbar__logo svg")).not.toBeNull()
    expect(container.querySelector(".navbar__title")?.textContent).toBe("Feed")
    // No Sign in, avatar or Search yet, and no home link that might point
    // the wrong way.
    expect(container.querySelector(".navbar__right")?.children).toHaveLength(0)
    expect(screen.queryByRole("link", { name: "Certified home" })).toBeNull()
  })

  it("keeps the back chevron while sign-in resolves on a detail page", () => {
    state.isLoading = true
    state.pathname = "/rosa.example/project/3k2"
    render(<Navbar />)
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument()
  })

  it("has no Search on a detail page or a form", () => {
    for (const [pathname, hasPageHeaderBack] of [
      ["/maya.certified.app/activity/3k2", false],
      ["/create", true],
    ] as const) {
      state.pathname = pathname
      state.hasPageHeader = true
      state.hasPageHeaderBack = hasPageHeaderBack
      const { unmount } = render(<Navbar />)
      expect(screen.queryByRole("button", { name: "Search" })).toBeNull()
      unmount()
    }
  })
})
