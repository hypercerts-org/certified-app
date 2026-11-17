import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

// /map and /funding: the views are the shared underline tab strip right
// under the page header (not a segmented control further down), they keep
// the `?view=` URL, and while the data loads the page already has its
// final shape: the tabs, then the main box with the loading message inside.

const nav = vi.hoisted(() => ({ search: "", path: "/funding", replace: vi.fn(), push: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
  useRegisterPageHeader: () => {},
}))

vi.mock("@/lib/feedback-context", () => ({
  useFeedback: () => ({ openFeedback: vi.fn() }),
}))

vi.mock("@/hooks/use-funding-dataset", () => ({
  useFundingDataset: () => ({ data: null, error: null, retry: vi.fn() }),
}))

vi.mock("@/hooks/use-map-dataset", () => ({
  useMapDataset: () => ({ data: null, error: null, retry: vi.fn() }),
}))

beforeEach(() => {
  nav.search = ""
  nav.replace.mockClear()
  nav.push.mockClear()
})

describe("Funding views", () => {
  beforeEach(() => {
    nav.path = "/funding"
  })

  it("are tabs under the header, Projects first and selected by default", async () => {
    const { default: FundingPage } = await import("../funding-page")
    render(<FundingPage />)
    const strip = screen.getByRole("tablist", { name: "View" })
    const tabs = within(strip).getAllByRole("tab")
    expect(tabs.map((t) => t.textContent)).toEqual(["Projects", "Flow", "Timeline", "Map", "Receipts"])
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    // No segmented view switch any more.
    expect(screen.queryByRole("radiogroup", { name: "View" })).toBeNull()
  })

  it("selects the view in the URL and writes a picked one to ?view=", async () => {
    nav.search = "view=timeline"
    const { default: FundingPage } = await import("../funding-page")
    render(<FundingPage />)
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }))
    expect(nav.replace).toHaveBeenCalledWith("/funding?view=flow", { scroll: false })
  })

  it("loads inside the main box, under the tabs", async () => {
    const { default: FundingPage } = await import("../funding-page")
    render(<FundingPage />)
    const panel = screen.getByRole("tabpanel")
    const box = panel.querySelector(".funding-loading")
    expect(box).not.toBeNull()
    expect(box).toHaveTextContent("Gathering every funding receipt")
    expect((box as HTMLElement).style.minHeight).toBe("480px")
  })
})

describe("Map views", () => {
  beforeEach(() => {
    nav.path = "/map"
  })

  it("are tabs under the header: Places, Countries, Sites", async () => {
    const { default: MapPage } = await import("../map-page")
    render(<MapPage />)
    const tabs = within(screen.getByRole("tablist", { name: "View" })).getAllByRole("tab")
    expect(tabs.map((t) => t.textContent)).toEqual(["Places", "Countries", "Sites"])
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    fireEvent.click(tabs[1])
    expect(nav.replace).toHaveBeenCalledWith("/map?view=countries", { scroll: false })
  })

  it("keeps the flat / globe switch, a display option, as a segmented control", async () => {
    const { default: MapPage } = await import("../map-page")
    render(<MapPage />)
    expect(screen.getByRole("radiogroup", { name: "Projection" })).toBeInTheDocument()
  })

  it("loads inside a box the map's height, with the totals waiting in place", async () => {
    const { default: MapPage } = await import("../map-page")
    render(<MapPage />)
    const box = screen.getByRole("tabpanel").querySelector(".map-loading") as HTMLElement
    expect(box).toHaveTextContent("Gathering every place on the network")
    expect(box.style.minHeight).toBe("600px")
    expect(screen.getByRole("list", { name: "On the map" })).toBeInTheDocument()
  })
})
