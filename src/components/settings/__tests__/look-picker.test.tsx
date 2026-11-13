import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import LookPicker from "../look-picker"

beforeEach(() => {
  document.documentElement.removeAttribute("data-look")
  window.localStorage.clear()
})

describe("LookPicker", () => {
  it("offers every style, Neutral picked by default, each with a live preview", () => {
    const { container } = render(<LookPicker />)
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Neutral",
      "Almanac",
      "Linen",
      "Banknote",
      "Wallet",
      "Dot matrix",
      "Glass",
      "Shapes",
      "Stamp",
    ])
    expect(screen.getByRole("radio", { name: "Neutral" })).toHaveAttribute("aria-checked", "true")
    expect(container.querySelectorAll("[data-look-preview]")).toHaveLength(9)
    expect(screen.getByRole("radio", { name: "Linen" })).toHaveAccessibleDescription(
      /private bank/,
    )
  })

  it("applies a style at once, and Neutral takes it off", () => {
    render(<LookPicker />)
    fireEvent.click(screen.getByRole("radio", { name: "Banknote" }))
    expect(document.documentElement.getAttribute("data-look")).toBe("banknote")
    expect(screen.getByRole("radio", { name: "Banknote" })).toHaveAttribute("aria-checked", "true")

    fireEvent.click(screen.getByRole("radio", { name: "Neutral" }))
    expect(document.documentElement.hasAttribute("data-look")).toBe(false)
  })
})
