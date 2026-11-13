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
  isAuthenticated: true,
  transitionBack: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: state.isAuthenticated,
    did: "did:plc:me",
    openSignIn: vi.fn(),
  }),
}))

vi.mock("@/lib/navbar-context", () => ({
  useNavbarValues: () => ({ pageTitle: state.pageTitle, breadcrumb: null, recordMenu: null }),
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
  useOrg: () => ({ activeOrg: null }),
}))

vi.mock("@/hooks/use-scroll-hide-navbar", () => ({
  useScrollHideNavbar: () => ({ scrolled: false, navHidden: false }),
}))

vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: false }),
}))

vi.mock("../account-menu", () => ({
  PhoneAccountMenu: () => <button type="button">Account</button>,
}))

vi.mock("../new-menu", () => ({
  PhoneNewMenu: () => <button type="button">New</button>,
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
  state.isAuthenticated = true
  state.transitionBack.mockReset()
})

describe("Navbar (phone)", () => {
  it("shows the brandmark, New and account on a top-level page", () => {
    state.hasPageHeader = true
    render(<Navbar />)
    expect(screen.getByRole("link", { name: "Certified home" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull()
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument()
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
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })
})
