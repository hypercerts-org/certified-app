import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const state = vi.hoisted(() => ({ pathname: "/graph" }))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { NetworkMenuItems, PhoneNetworkTab } from "../network-menu"

beforeEach(() => {
  state.pathname = "/graph"
})

describe("NetworkMenuItems", () => {
  function renderItems(isAuthenticated: boolean) {
    render(
      <div role="menu">
        <NetworkMenuItems mode="menu" isAuthenticated={isAuthenticated} current="graph" onSelect={vi.fn()} />
      </div>,
    )
  }

  it("lists the five Network pages, the current one marked", () => {
    renderItems(true)
    const items = screen.getAllByRole("menuitem")
    expect(items.map((i) => i.textContent)).toEqual(["Feed", "Explore", "Graph", "Map", "Funding"])
    expect(items.map((i) => i.getAttribute("href"))).toEqual(["/feed", "/explore", "/graph", "/map", "/funding"])
    expect(screen.getByRole("menuitem", { name: "Graph" })).toHaveAttribute("aria-current", "page")
  })

  it("leaves Feed out for signed-out visitors", () => {
    renderItems(false)
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Explore", "Graph", "Map", "Funding"])
  })
})

describe("PhoneNetworkTab", () => {
  it("opens the five pages as a menu above the pill, current on any Network page", () => {
    render(<PhoneNetworkTab isAuthenticated />)
    const tab = screen.getByRole("button", { name: "Network" })
    expect(tab).toHaveAttribute("aria-current", "page")
    expect(tab).toHaveAttribute("aria-haspopup", "menu")
    fireEvent.click(tab)
    const menu = screen.getByRole("menu", { name: "Network" })
    expect(menu).toHaveAttribute("data-side", "top")
    const items = screen.getAllByRole("menuitem")
    expect(items.map((i) => i.textContent)).toEqual(["Feed", "Explore", "Graph", "Map", "Funding"])
    // Touch-sized rows (44px), unlike the desktop menu's 36px.
    expect(items[0].className).toContain("min-h-control-md")
  })
})
