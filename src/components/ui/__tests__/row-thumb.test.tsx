import { describe, it, expect } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import RowThumb from "../row-thumb"

const icon = <svg data-testid="icon" />

describe("RowThumb", () => {
  it("shows the type icon with no image", () => {
    const { getByTestId, container } = render(<RowThumb src={null} icon={icon} className="t" />)
    expect(getByTestId("icon")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })

  it("keeps the icon under the image while it loads, so the tile is never blank", () => {
    const { getByTestId, container } = render(<RowThumb src="/a.png" icon={icon} className="t" />)
    expect(getByTestId("icon")).toBeInTheDocument()
    expect(container.querySelector("img")?.className).toContain("absolute")
    expect(container.firstElementChild?.className).toContain("relative")
  })

  it("drops an image that fails or turns out empty", () => {
    const { container, rerender } = render(<RowThumb src="/a.png" icon={icon} className="t" />)
    fireEvent.error(container.querySelector("img")!)
    expect(container.querySelector("img")).toBeNull()

    rerender(<RowThumb src="/b.png" icon={icon} className="t" />)
    const img = container.querySelector("img")!
    Object.defineProperty(img, "naturalWidth", { value: 1 })
    fireEvent.load(img)
    expect(container.querySelector("img")).toBeNull()
  })
})
