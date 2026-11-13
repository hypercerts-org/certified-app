import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react"

// "Seen as" reads the signed-in account and groups; it has its own tests
// (seen-as-switcher.test.tsx), so it stays out of this page's.
vi.mock("@/components/network/seen-as-switcher", () => ({ default: () => null }))

// The Explore lists, picked with the "Show" select in the toolbar (it
// replaced a side list with the same options and URL behaviour): "Whole
// network" is listed first and selected by default, the featured Ma
// Earth set counts as it, "Recently viewed" only appears once this
// browser has viewed something, and picking a list pushes the same URL
// the side list's links did.
//
// Explore pulls in auth, navbar, navigation, and the explore-data hook;
// none of those are under test, so they're stubbed to inert defaults.

const nav = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false, isLoading: false }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
  useRegisterPageHeader: () => {},
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
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
  nav.search = ""
  nav.push.mockClear()
  nav.replace.mockClear()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

async function renderExplore(): Promise<HTMLSelectElement> {
  const { default: Explore } = await import("../explore")
  render(<Explore />)
  return screen.getByRole("combobox", { name: "Show" }) as HTMLSelectElement
}

function optionLabels(select: HTMLSelectElement): (string | null)[] {
  return within(select)
    .getAllByRole("option")
    .map((o) => o.textContent)
}

describe("Explore lists (the Show select)", () => {
  it("replaces the side list: no list navigation beside the results", async () => {
    await renderExplore()
    expect(screen.queryByRole("navigation", { name: "Explore lists" })).toBeNull()
  })

  it("lists Whole network first and selects it by default", async () => {
    const select = await renderExplore()
    expect(optionLabels(select)).toEqual([
      "Whole network",
      "Accounts I follow",
      "Endorsed accounts",
    ])
    expect(select.value).toBe("all")
  })

  it("has a visible label", async () => {
    const select = await renderExplore()
    const label = document.querySelector(`label[for="${select.id}"]`)
    expect(label?.textContent).toBe("Show")
  })

  it("keeps Whole network selected while the featured set is shown", async () => {
    nav.search = "filter=ma-earth&show=activities"
    const select = await renderExplore()
    expect(select.value).toBe("all")
  })

  it("reflects the list in the URL on every type", async () => {
    nav.search = "filter=endorsed&show=projects"
    const select = await renderExplore()
    expect(select.value).toBe("endorsed")
  })

  it("shows Recently viewed once something has been viewed", async () => {
    localStorage.setItem(
      "recently-viewed",
      JSON.stringify({ user: ["did:plc:someone"], project: [], cert: [] }),
    )
    const select = await renderExplore()
    expect(optionLabels(select)).toContain("Recently viewed")
  })

  it("lists Recently viewed when linked to it, even with nothing viewed", async () => {
    nav.search = "filter=recent"
    const select = await renderExplore()
    expect(select.value).toBe("recent")
    expect(optionLabels(select)).toContain("Recently viewed")
  })

  it("pushes the list into the URL, keeping the other params", async () => {
    nav.search = "show=projects&q=mangrove"
    const select = await renderExplore()
    fireEvent.change(select, { target: { value: "follows" } })
    expect(nav.push).toHaveBeenCalledTimes(1)
    expect(nav.push.mock.calls[0][0]).toBe(
      "/explore?show=projects&q=mangrove&filter=follows",
    )
    // A history entry per list, as the side list's links made; the
    // replace-in-place writer (search, sort, …) is not used for it.
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("clears the param for Whole network, the default", async () => {
    nav.search = "filter=endorsed&show=accounts"
    const select = await renderExplore()
    fireEvent.change(select, { target: { value: "all" } })
    expect(nav.push.mock.calls[0][0]).toBe("/explore?show=accounts")
  })

  it("asks signed-out visitors to sign in for Accounts I follow, keeping Show", async () => {
    nav.search = "filter=follows"
    const select = await renderExplore()
    expect(
      screen.getByRole("heading", { name: "Sign in to see the accounts you follow" }),
    ).toBeTruthy()
    // The select stays, so they can go back to a list that works signed out.
    expect(select.value).toBe("follows")
    fireEvent.change(select, { target: { value: "all" } })
    expect(nav.push.mock.calls[0][0]).toBe("/explore")
  })
})
