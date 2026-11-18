import { describe, it, expect, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { keepNavbarShown, useScrollHideNavbar } from "../use-scroll-hide-navbar"

// The phone top bar hides when the reader scrolls down, but not when the
// app moves the page itself (Back to a list restoring the reader's place).

let y = 0
Object.defineProperty(window, "scrollY", { configurable: true, get: () => y })

function scrollTo(next: number) {
  y = next
  act(() => {
    window.dispatchEvent(new Event("scroll"))
  })
}

afterEach(() => {
  y = 0
})

describe("useScrollHideNavbar", () => {
  it("hides on a scroll down by the reader", () => {
    const { result } = renderHook(() => useScrollHideNavbar())
    scrollTo(400)
    expect(result.current.navHidden).toBe(true)
    scrollTo(300)
    expect(result.current.navHidden).toBe(false)
  })

  it("stays shown through a scroll the app does (keepNavbarShown)", () => {
    const { result } = renderHook(() => useScrollHideNavbar())
    keepNavbarShown(1000)
    scrollTo(1500)
    expect(result.current.navHidden).toBe(false)
    expect(result.current.scrolled).toBe(true)
  })
})
