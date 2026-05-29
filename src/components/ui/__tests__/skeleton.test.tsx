import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import Skeleton from "../skeleton"

afterEach(() => {
  cleanup()
})

describe("Skeleton text variant", () => {
  it("marks the text-variant container aria-hidden", () => {
    const { container } = render(<Skeleton variant="text" lines={2} />)
    const root = container.firstElementChild as HTMLElement
    expect(root).not.toBeNull()
    expect(root.getAttribute("aria-hidden")).toBe("true")
  })

  it("honors the documented width prop on non-last lines", () => {
    const { container } = render(
      <Skeleton variant="text" lines={3} width={240} />,
    )
    const lines = container.querySelectorAll(":scope > div > div")
    expect(lines.length).toBe(3)
    // Non-last lines should use the provided width.
    expect((lines[0] as HTMLElement).style.width).toBe("240px")
    expect((lines[1] as HTMLElement).style.width).toBe("240px")
    // The last line keeps its 60% ragged-edge treatment.
    expect((lines[2] as HTMLElement).style.width).toBe("60%")
  })

  it("does not let an external style override the computed width", () => {
    const { container } = render(
      <Skeleton variant="text" lines={2} style={{ opacity: 0.5 }} />,
    )
    const firstLine = container.querySelector(
      ":scope > div > div",
    ) as HTMLElement
    // Computed default width wins; passing style with no width must not
    // blank it out.
    expect(firstLine.style.width).toBe("100%")
    expect(firstLine.style.opacity).toBe("0.5")
  })
})
