import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act, cleanup, waitFor } from "@testing-library/react"
import { useLayoutBreakpoints } from "../use-layout-breakpoints"

/**
 * Tests for the resize equality guard in `useLayoutBreakpoints`
 * (perf-use-layout-breakpoints-resize-storm). The setter must bail when
 * a resize keeps every breakpoint boolean identical, so a drag that
 * doesn't cross 800/1100/1300 doesn't re-render consumers.
 *
 * `window.matchMedia` is stubbed by test-setup (matches:false), so
 * `isStandalone` stays false throughout.
 */

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: w,
  })
}

beforeEach(() => {
  cleanup()
})

describe("useLayoutBreakpoints", () => {
  it("reconciles against the real viewport on mount", async () => {
    setWidth(1400)
    const { result } = renderHook(() => useLayoutBreakpoints())
    await waitFor(() => expect(result.current.isDesktop).toBe(true))
    expect(result.current.hasRightRail).toBe(true)
    expect(result.current.isFullDesktop).toBe(true)
    expect(result.current.isStandalone).toBe(false)
  })

  it("keeps the same snapshot reference when a resize flips no breakpoint", async () => {
    setWidth(1400)
    const { result } = renderHook(() => useLayoutBreakpoints())
    await waitFor(() => expect(result.current.isFullDesktop).toBe(true))

    const before = result.current
    act(() => {
      setWidth(1500)
      window.dispatchEvent(new Event("resize"))
    })
    // 1400 -> 1500 keeps all three thresholds satisfied: no re-render.
    expect(result.current).toBe(before)
  })

  it("commits a new snapshot when a resize crosses a breakpoint", async () => {
    setWidth(1400)
    const { result } = renderHook(() => useLayoutBreakpoints())
    await waitFor(() => expect(result.current.isFullDesktop).toBe(true))

    const before = result.current
    act(() => {
      setWidth(900)
      window.dispatchEvent(new Event("resize"))
    })
    expect(result.current).not.toBe(before)
    expect(result.current.isDesktop).toBe(true)
    expect(result.current.hasRightRail).toBe(false)
    expect(result.current.isFullDesktop).toBe(false)
  })

  it("returns mobile defaults below 800px", async () => {
    setWidth(500)
    const { result } = renderHook(() => useLayoutBreakpoints())
    await waitFor(() => expect(result.current.isDesktop).toBe(false))
    expect(result.current.hasRightRail).toBe(false)
    expect(result.current.isFullDesktop).toBe(false)
  })
})
