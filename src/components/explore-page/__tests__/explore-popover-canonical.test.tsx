import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react"

// judgment-008: the Explore Sort dropdown and Sub-category dropdown were
// migrated from a local hand-rolled <Popover> onto the canonical
// <Popover>/<PopoverTrigger>/<PopoverContent>/<PopoverItem> primitive
// (src/components/ui/popover.tsx). These tests pin the canonical
// behaviour the migration must preserve: the trigger wires
// aria-controls to the menu, the menu renders role="menuitem"
// children, click opens / re-click and Escape close.
//
// Explore pulls in auth, navbar, navigation, and the explore-data hook;
// none of those are under test, so they're stubbed to inert defaults
// just enough for the component to mount on its default kind=certs
// state (where both the Sort and Sub-category triggers render).

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/hooks/use-explore", () => ({
  useExploreData: () => ({
    users: [],
    projects: [],
    certs: [],
    certDids: new Map(),
    cursor: null,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    endorsementClosure: null,
  }),
}))

afterEach(() => {
  cleanup()
})

describe("Explore Sort dropdown uses the canonical Popover", () => {
  it("opens a role=menu wired to the trigger via aria-controls", async () => {
    const { default: Explore } = await import("../explore")
    render(<Explore />)
    const trigger = screen.getByRole("button", { name: /^Sort:/ })
    // Closed initially.
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(trigger)

    const menu = screen.getByRole("menu")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    // Canonical primitive wires aria-controls -> the menu's id.
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id)
    expect(menu.id).toBeTruthy()
  })

  it("renders the sort options as role=menuitem", async () => {
    const { default: Explore } = await import("../explore")
    render(<Explore />)
    const trigger = screen.getByRole("button", { name: /^Sort:/ })
    fireEvent.click(trigger)
    const menu = screen.getByRole("menu")
    const items = within(menu).getAllByRole("menuitem")
    const labels = items.map((el) => el.textContent)
    expect(labels).toContain("Newest first")
    expect(labels).toContain("Oldest first")
    expect(labels).toContain("Alphabetical")
  })

  it("closes on Escape", async () => {
    const { default: Explore } = await import("../explore")
    render(<Explore />)
    const trigger = screen.getByRole("button", { name: /^Sort:/ })
    fireEvent.click(trigger)
    expect(screen.getByRole("menu")).toBeTruthy()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })
})

describe("Explore Sub-category dropdown uses the canonical Popover", () => {
  it("opens a role=menu of single-select options and closes on Escape", async () => {
    const { default: Explore } = await import("../explore")
    render(<Explore />)
    // The sub-prefix trigger on kind=certs shows the active option,
    // whose accessible name is exactly "All" (the chevron is aria-hidden).
    // The sidebar's "All certs" filter has a different name, so an exact
    // match disambiguates while the menu is still closed.
    const trigger = screen.getByRole("button", { name: "All" })
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu")
    expect(screen.queryByRole("menu")).toBeNull()

    fireEvent.click(trigger)
    const menu = screen.getByRole("menu")
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id)
    const items = within(menu).getAllByRole("menuitem")
    const labels = items.map((el) => el.textContent)
    expect(labels).toContain("Created")
    expect(labels).toContain("Contributed")

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
