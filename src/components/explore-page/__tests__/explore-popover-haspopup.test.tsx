import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

// quality-056 / explore-3: the Sort and quality popover *trigger*
// buttons in Explore omitted `aria-haspopup`, unlike the sibling
// sub-prefix dropdown trigger (and the home-feed menu buttons) which
// already announce a popup to assistive tech. This test mounts Explore
// in a single-kind state (`?show=accounts`) — where the Sort and quality
// triggers render — and pins that each advertises a popup via
// `aria-haspopup`. (The default `?show=all` landing renders the
// capped-blocks view, which has no single-kind toolbar.)
//
// Explore pulls in auth, navbar, navigation, and the explore-data hook;
// none of those are under test, so they're stubbed to inert defaults
// just enough for the component to mount with both triggers visible.

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("show=accounts"),
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

describe("Explore popover triggers expose aria-haspopup", () => {
  it("Sort trigger advertises a popup", async () => {
    const { default: Explore } = await import("../explore")
    render(<Explore />)
    // The Sort trigger is labelled by its visible text ("Sort: …").
    const sortTrigger = screen.getByRole("button", { name: /^Sort:/ })
    expect(sortTrigger.getAttribute("aria-haspopup")).not.toBeNull()
  })

  it("quality-filter trigger advertises a popup", async () => {
    const { default: Explore } = await import("../explore")
    render(<Explore />)
    const qualityTrigger = screen.getByRole("button", {
      name: /Filter by quality/,
    })
    expect(qualityTrigger.getAttribute("aria-haspopup")).not.toBeNull()
  })
})
