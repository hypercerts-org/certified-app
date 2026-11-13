import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import SideNav from "../side-nav"

describe("SideNav", () => {
  it("renders a labelled nav with aria-current on the current link only", () => {
    render(
      <SideNav
        aria-label="Kinds of records"
        items={[
          { key: "activities", label: "Activities", href: "/records?kind=activities", current: true },
          { key: "following", label: "Following", href: "/records?kind=following", count: 12 },
        ]}
      />,
    )

    expect(screen.getByRole("navigation", { name: "Kinds of records" })).toBeInTheDocument()
    const current = screen.getByRole("link", { name: "Activities" })
    expect(current).toHaveAttribute("aria-current", "page")
    expect(current).toHaveAttribute("href", "/records?kind=activities")

    const other = screen.getByRole("link", { name: /Following/ })
    expect(other).not.toHaveAttribute("aria-current")
    expect(other).toHaveTextContent("12")
  })

  it("renders buttons for onClick items and marks the current one", () => {
    const onClick = vi.fn()
    render(
      <SideNav
        aria-label="Settings sections"
        items={[
          { key: "account", label: "Account", onClick, current: true },
          { key: "profile", label: "Profile", onClick },
        ]}
      />,
    )

    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "true")
    const profile = screen.getByRole("button", { name: "Profile" })
    expect(profile).not.toHaveAttribute("aria-current")
    fireEvent.click(profile)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
