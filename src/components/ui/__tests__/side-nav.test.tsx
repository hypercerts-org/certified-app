import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import SideNav, { SIDE_NAV_WRAP_MAX } from "../side-nav"

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

  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      key: `s${i}`,
      label: `Section ${i}`,
      href: `#s${i}`,
      current: i === n - 1,
    }))

  it("wraps a short list on phones instead of scrolling it", () => {
    render(<SideNav aria-label="Short" items={many(SIDE_NAV_WRAP_MAX)} />)
    const list = screen.getByRole("list")
    expect(list.className).toContain("flex-wrap")
    expect(list.className).not.toContain("overflow-x-auto")
  })

  it("scrolls a long list sideways, with the current item scrolled into view", () => {
    const scrollTo = vi.fn()
    const proto = HTMLElement.prototype as unknown as { scrollTo?: unknown }
    const original = proto.scrollTo
    proto.scrollTo = scrollTo
    const widths = [
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900),
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360),
    ]
    try {
      render(<SideNav aria-label="Long" items={many(SIDE_NAV_WRAP_MAX + 2)} />)
      const list = screen.getByRole("list")
      expect(list.className).toContain("overflow-x-auto")
      expect(scrollTo).toHaveBeenCalledTimes(1)
    } finally {
      widths.forEach((w) => w.mockRestore())
      proto.scrollTo = original
    }
  })
})
