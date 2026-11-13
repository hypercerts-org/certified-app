import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

// The desktop top bar keeps one layout on every page: on /explore, which
// has its own search box, the global search steps aside but its slot
// stays (an empty, aria-hidden placeholder of the same size), so New and
// the account button sit where they do on Feed, Graph and Map.

const state = vi.hoisted(() => ({ pathname: "/feed" }))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isLoading: false, isAuthenticated: true, openSignIn: vi.fn() }),
}))

vi.mock("@/lib/navbar-context", () => ({
  useHasPageHeader: () => true,
  useNavbarValues: () => ({ pageTitle: null, desktopTitle: null, breadcrumb: null }),
}))

// The menus and the search have their own tests; here they only need to
// take their place in the row.
vi.mock("@/components/search/global-search", () => ({
  default: () => <input type="search" aria-label="Search" />,
}))
vi.mock("../account-menu", () => ({ DesktopAccountMenu: () => <button type="button">Account</button> }))
vi.mock("../new-menu", () => ({ DesktopNewMenu: () => <button type="button">New</button> }))
vi.mock("../network-menu", () => ({ DesktopNetworkMenu: () => <button type="button">Network</button> }))
vi.mock("../workspace-menu", () => ({ DesktopWorkspaceMenu: () => <button type="button">Workspace</button> }))

import DesktopTopBar from "../desktop-top-bar"

beforeEach(() => {
  state.pathname = "/feed"
})

afterEach(() => {
  cleanup()
})

function rightGroup(container: HTMLElement): HTMLElement {
  const right = container.querySelector<HTMLElement>(".desktop-top-bar__right")
  if (!right) throw new Error("no right group")
  return right
}

describe("DesktopTopBar search slot", () => {
  it("shows the search before New on Feed", () => {
    const { container } = render(<DesktopTopBar />)
    const slot = rightGroup(container).firstElementChild as HTMLElement
    expect(slot.className).toBe("desktop-top-bar__search")
    expect(slot.getAttribute("data-tour")).toBe("navbar-search")
    expect(slot.getAttribute("aria-hidden")).toBeNull()
    expect(slot.querySelector('input[type="search"]')).not.toBeNull()
  })

  it("keeps the slot, empty and hidden from assistive tech, on Explore", () => {
    state.pathname = "/explore"
    const { container, queryByRole } = render(<DesktopTopBar />)
    const right = rightGroup(container)
    const slot = right.firstElementChild as HTMLElement
    // Same class, so the same flex size as the search it stands in for.
    expect(slot.className).toBe("desktop-top-bar__search")
    expect(slot.getAttribute("aria-hidden")).toBe("true")
    expect(slot.childElementCount).toBe(0)
    // No second search field and no tour anchor on an empty box.
    expect(queryByRole("searchbox")).toBeNull()
    expect(slot.getAttribute("data-tour")).toBeNull()
    // New and the account button follow it, as on every other page.
    const buttons = Array.from(right.querySelectorAll("button")).map((b) => b.textContent)
    expect(buttons).toEqual(["New", "Account"])
  })

  it("keeps the slot on Explore's sub-routes too", () => {
    state.pathname = "/explore/anything"
    const { container } = render(<DesktopTopBar />)
    const slot = rightGroup(container).firstElementChild as HTMLElement
    expect(slot.className).toBe("desktop-top-bar__search")
    expect(slot.getAttribute("aria-hidden")).toBe("true")
  })
})
