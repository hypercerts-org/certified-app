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
  it("opens the five pages as a sheet, current on any Network page", () => {
    render(<PhoneNetworkTab isAuthenticated />)
    const tab = screen.getByRole("button", { name: "Network" })
    expect(tab).toHaveAttribute("aria-current", "page")
    fireEvent.click(tab)
    const sheet = screen.getByRole("dialog", { name: "Network" })
    expect(sheet).toBeInTheDocument()
    for (const label of ["Feed", "Explore", "Graph", "Map", "Funding"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument()
    }
  })
})
