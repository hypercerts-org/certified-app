import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

// The Explore list navigation (SideNav): "Whole network" is listed first and is
// current by default, the featured Ma Earth set counts as it, and
// "Recently viewed" only appears once this browser has viewed something.
//
// Explore pulls in auth, navbar, navigation, and the explore-data hook;
// none of those are under test, so they're stubbed to inert defaults.

let search = ""

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false, isLoading: false }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
  useRegisterPageHeader: () => {},
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

vi.mock("@/hooks/use-explore", () => ({
  useExploreData: () => ({
    users: [],
    projects: [],
    certs: [],
    certDids: new Map(),
    fundingReceipts: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    error: false,
    refetch: vi.fn(),
    endorsementClosure: null,
  }),
}))

beforeEach(() => {
  search = ""
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

async function renderExplore() {
  const { default: Explore } = await import("../explore")
  render(<Explore />)
  return screen.getByRole("navigation", { name: "Explore lists" })
}

describe("Explore list navigation", () => {
  it("lists Whole network first and marks it current by default", async () => {
    const nav = await renderExplore()
    const links = within(nav).getAllByRole("link")
    expect(links.map((l) => l.textContent)).toEqual([
      "Whole network",
      "Accounts I follow",
      "Endorsed accounts",
    ])
    expect(links[0].getAttribute("aria-current")).toBe("page")
  })

  it("keeps Whole network current while the featured set is shown", async () => {
    search = "filter=ma-earth&show=activities"
    const nav = await renderExplore()
    expect(
      within(nav).getByRole("link", { name: "Whole network" }).getAttribute("aria-current"),
    ).toBe("page")
  })

  it("shows Recently viewed once something has been viewed", async () => {
    localStorage.setItem(
      "recently-viewed",
      JSON.stringify({ user: ["did:plc:someone"], project: [], cert: [] }),
    )
    const nav = await renderExplore()
    expect(within(nav).getByRole("link", { name: "Recently viewed" })).toBeTruthy()
  })

  it("asks signed-out visitors to sign in for Accounts I follow", async () => {
    search = "filter=follows"
    await renderExplore()
    expect(
      screen.getByRole("heading", { name: "Sign in to see the accounts you follow" }),
    ).toBeTruthy()
  })
})
