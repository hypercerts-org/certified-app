import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { Popover, PopoverContent, PopoverTrigger } from "../popover"

/**
 * A portaled menu can open beside its trigger ("right" / "left"), as the
 * sidebar's rail menus do: it lines up with the trigger's top
 * (align="start") and flips to the other side when there's no room.
 * jsdom has no layout, so the trigger's rect and the menu's size are
 * stubbed (the window is jsdom's 1024 × 768).
 */
const MENU_W = 200
const MENU_H = 100

function stubLayout(trigger: Partial<DOMRect>) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...trigger,
  } as DOMRect)
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(MENU_W)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(MENU_H)
}

function openMenu(side: "left" | "right") {
  render(
    <Popover>
      <PopoverTrigger>
        <button type="button">Open</button>
      </PopoverTrigger>
      <PopoverContent portal side={side} align="start" offset={8} aria-label="Pages">
        <button type="button" role="menuitem">
          Feed
        </button>
      </PopoverContent>
    </Popover>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Open" }))
  return screen.getByRole("menu", { name: "Pages" })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Popover side", () => {
  it("opens to the right of the trigger, top edges aligned", () => {
    stubLayout({ left: 8, right: 72, top: 120, bottom: 176, width: 64, height: 56 })
    const menu = openMenu("right")
    expect(menu.style.left).toBe("80px")
    expect(menu.style.top).toBe("120px")
    expect(menu).toHaveAttribute("data-side", "right")
  })

  it("flips to the left when there's no room on the right", () => {
    stubLayout({ left: 900, right: 1000, top: 120, bottom: 176, width: 100, height: 56 })
    const menu = openMenu("right")
    expect(menu.style.left).toBe(`${900 - 8 - MENU_W}px`)
  })

  it("stays on screen at the bottom of the viewport", () => {
    stubLayout({ left: 8, right: 72, top: 740, bottom: 760, width: 64, height: 20 })
    const menu = openMenu("right")
    expect(menu.style.top).toBe(`${768 - 8 - MENU_H}px`)
  })
})
