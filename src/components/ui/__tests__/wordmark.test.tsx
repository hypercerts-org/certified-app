import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import Wordmark from "../wordmark"

describe("Wordmark", () => {
  it("renders Certified by default, sized by its letter height", () => {
    render(<Wordmark height={30} />)
    const svg = screen.getByRole("img", { name: "Certified" })
    expect(svg).toHaveAttribute("height", "30")
    expect(svg).toHaveAttribute("width", String((30 * 313) / 60))
    expect(svg.style.marginBottom).toBe("")
  })

  it("renders Certified.app with its descenders hanging below the letter box", () => {
    render(<Wordmark variant="certified-app" height={30} />)
    const svg = screen.getByRole("img", { name: "Certified.app" })
    expect(svg.querySelectorAll("path")).toHaveLength(15)
    expect(Number(svg.getAttribute("height"))).toBeCloseTo((30 * 76.31) / 60)
    expect(parseFloat(svg.style.marginBottom)).toBeCloseTo(-((76.31 - 60) * 30) / 60)
  })

  it("adds a Beta pill over \"app\", as wide as \"app\", above the letters", () => {
    const { container } = render(<Wordmark variant="certified-app" beta height={30} decorative />)
    const label = screen.getByText("Beta")
    const pill = label.parentElement as HTMLElement
    expect(pill).toHaveAttribute("aria-hidden", "true")
    expect(parseFloat(pill.style.left)).toBeCloseTo((337.64 * 30) / 60)
    expect(parseFloat(pill.style.width)).toBeCloseTo(((465.15 - 337.64) * 30) / 60)
    expect(parseFloat(pill.style.top)).toBeLessThan(0)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("ignores beta on the plain Certified wordmark", () => {
    render(<Wordmark beta height={30} decorative />)
    expect(screen.queryByText("Beta")).toBeNull()
  })

  it("leaves the accessibility tree when decorative", () => {
    const { container } = render(<Wordmark variant="certified-app" decorative />)
    expect(screen.queryByRole("img")).toBeNull()
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })
})
