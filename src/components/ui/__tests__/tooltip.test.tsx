import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"
import Tooltip from "../tooltip"

beforeEach(() => {
  // Tooltips only mount on hover-capable pointers.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Tooltip", () => {
  it("shows on focus", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip label="Create new">
        <button type="button">+</button>
      </Tooltip>,
    )
    fireEvent.focus(getByRole("button"))
    expect(queryByRole("tooltip")).not.toBeNull()
  })

  it("stays hidden while the trigger's own menu is open", () => {
    const { getByRole, queryByRole, rerender } = render(
      <Tooltip label="Create new">
        <button type="button" aria-expanded={true}>+</button>
      </Tooltip>,
    )
    fireEvent.focus(getByRole("button"))
    expect(queryByRole("tooltip")).toBeNull()

    rerender(
      <Tooltip label="Create new">
        <button type="button" aria-expanded={false}>+</button>
      </Tooltip>,
    )
    expect(queryByRole("tooltip")).not.toBeNull()
  })
})

describe("Tooltip side", () => {
  it("sits to the right of the trigger, centred on it", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 8,
      right: 72,
      top: 100,
      bottom: 140,
      width: 64,
      height: 40,
      x: 8,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)
    const { getByRole } = render(
      <Tooltip label="Riverbank Trust" side="right">
        <button type="button">RT</button>
      </Tooltip>,
    )
    fireEvent.focus(getByRole("button"))
    const bubble = getByRole("tooltip")
    // 8px gap after the trigger's right edge; the bubble's own (stubbed)
    // height is 40, so centring keeps its top at the trigger's top.
    expect(bubble.style.left).toBe("80px")
    expect(bubble.style.top).toBe("100px")
    vi.restoreAllMocks()
  })
})
