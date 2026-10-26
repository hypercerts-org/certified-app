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
