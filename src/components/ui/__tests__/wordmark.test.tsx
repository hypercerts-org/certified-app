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

  it("adds the artwork's thin Beta pill without growing the wordmark", () => {
    render(<Wordmark variant="certified-app" beta height={30} />)
    const svg = screen.getByRole("img", { name: "Certified.app" })
    expect(svg.querySelectorAll("path")).toHaveLength(16)
    expect(Number(svg.getAttribute("height"))).toBeCloseTo((30 * 76.31) / 60)
  })

  it("fades .app to half opacity, leaving Certified and the pill solid", () => {
    const { container } = render(<Wordmark variant="certified-app" beta faded height={30} decorative />)
    const paths = Array.from(container.querySelectorAll("path"))
    expect(paths.filter((p) => p.getAttribute("fill-opacity") === "0.5")).toHaveLength(4)
    expect(paths[paths.length - 1]).not.toHaveAttribute("fill-opacity")
  })

  it("ignores beta and faded on the plain Certified wordmark", () => {
    const { container } = render(<Wordmark beta faded height={30} decorative />)
    expect(container.querySelectorAll("path")).toHaveLength(11)
  })

  it("leaves the accessibility tree when decorative", () => {
    const { container } = render(<Wordmark variant="certified-app" decorative />)
    expect(screen.queryByRole("img")).toBeNull()
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })
})
