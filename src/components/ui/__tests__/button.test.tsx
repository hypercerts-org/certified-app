import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import Button from "../button"

afterEach(() => {
  cleanup()
})

describe("Button", () => {
  it("renders only the spinner (hides children) when loading && size=icon", () => {
    const { container } = render(
      <Button size="icon" aria-label="Save" loading>
        <span data-testid="icon-child">icon</span>
      </Button>,
    )
    // The icon child must NOT render alongside the spinner for icon-size.
    expect(container.querySelector('[data-testid="icon-child"]')).toBeNull()
    // The spinner is still present.
    expect(container.querySelector("svg.animate-spin")).not.toBeNull()
  })

  it("keeps children visible alongside the spinner for non-icon sizes", () => {
    const { container } = render(
      <Button loading>
        <span data-testid="label-child">Submit</span>
      </Button>,
    )
    expect(container.querySelector('[data-testid="label-child"]')).not.toBeNull()
    expect(container.querySelector("svg.animate-spin")).not.toBeNull()
  })

  it("defaults to type=button so it does not submit forms implicitly", () => {
    const { container } = render(<Button>Click</Button>)
    const button = container.querySelector("button") as HTMLButtonElement
    expect(button.getAttribute("type")).toBe("button")
  })

  it("lets an explicit type override the default", () => {
    const { container } = render(<Button type="submit">Send</Button>)
    const button = container.querySelector("button") as HTMLButtonElement
    expect(button.getAttribute("type")).toBe("submit")
  })
})
