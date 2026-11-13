import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

// The /feed page header's Filters button: it opens the filters below
// 1100px, and once any filter differs from its default it says how many
// ("Filters · 2"). While the page is still loading it renders disabled.

vi.mock("@/lib/navbar-context", () => ({
  useRegisterPageHeader: () => {},
}))

afterEach(() => {
  cleanup()
})

describe("FeedPageHeader", () => {
  it("renders the page h1 and a plain Filters button by default", async () => {
    const { FeedPageHeader } = await import("../home-feed")
    const onOpen = vi.fn()
    render(<FeedPageHeader onOpenFilters={onOpen} />)
    expect(screen.getByRole("heading", { level: 1, name: "Feed" })).toBeTruthy()
    const button = screen.getByRole("button", { name: "Filters" })
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("counts changed filters on the button", async () => {
    const { FeedPageHeader } = await import("../home-feed")
    render(<FeedPageHeader changedCount={2} onOpenFilters={() => {}} />)
    const button = screen.getByRole("button", { name: "Filters, 2 changed" })
    expect(button.textContent).toContain("Filters · 2")
  })

  it("is disabled until the feed can open its filters", async () => {
    const { FeedPageHeader } = await import("../home-feed")
    render(<FeedPageHeader />)
    const button = screen.getByRole("button", { name: "Filters" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})
