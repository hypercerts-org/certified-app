import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, cleanup, fireEvent, act } from "@testing-library/react"
import {
  useScrollRestoration,
  savedScrollPosition,
  clearSavedScrollPositions,
} from "../use-scroll-restoration"

// Back from a record lands the reader where they left the list: the
// offset is saved when they click a link out (not on unmount, when the
// router has already scrolled the next page to the top), and restored
// once the list's first rows are there.

function List({ k, ready }: { k: string; ready: boolean }) {
  useScrollRestoration(k, ready)
  // The router takes the click in the app (jsdom can't navigate); the
  // hook listens in the capture phase, before it.
  return (
    <a href="https://certified.app/activity/x" data-testid="row" onClick={(e) => e.preventDefault()}>
      Row
    </a>
  )
}

let scrollY = 0
const scrollTo = vi.fn((_x: number, y: number) => {
  scrollY = y
})

beforeEach(() => {
  clearSavedScrollPositions()
  scrollY = 0
  scrollTo.mockClear()
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY })
  vi.stubGlobal("scrollTo", scrollTo)
  // Frames run at once, so the restore is synchronous here.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useScrollRestoration", () => {
  it("saves the offset when a link out is clicked", () => {
    const { getByTestId } = render(<List k="/explore" ready />)
    scrollY = 1200
    fireEvent.click(getByTestId("row"))
    expect(savedScrollPosition("/explore")).toBe(1200)
  })

  it("keeps that offset when the router then scrolls to the top", () => {
    const { getByTestId, unmount } = render(<List k="/explore" ready />)
    scrollY = 1200
    fireEvent.click(getByTestId("row"))
    scrollY = 0
    act(() => {
      window.dispatchEvent(new Event("scroll"))
    })
    unmount()
    expect(savedScrollPosition("/explore")).toBe(1200)
  })

  it("ignores a modified click (a new tab keeps this one where it is)", () => {
    const { getByTestId } = render(<List k="/explore" ready />)
    scrollY = 900
    fireEvent.click(getByTestId("row"), { metaKey: true })
    expect(savedScrollPosition("/explore")).toBeUndefined()
  })

  it("restores only once the first rows are ready", () => {
    const first = render(<List k="/explore?show=projects" ready />)
    scrollY = 1500
    fireEvent.click(first.getByTestId("row"))
    first.unmount()

    // Back: the page starts at the top, the rows are still loading.
    scrollY = 0
    const back = render(<List k="/explore?show=projects" ready={false} />)
    expect(scrollTo).not.toHaveBeenCalled()
    back.rerender(<List k="/explore?show=projects" ready />)
    expect(scrollTo).toHaveBeenLastCalledWith(0, 1500)
  })

  it("does not restore another list's offset", () => {
    const first = render(<List k="/explore?show=projects" ready />)
    scrollY = 1500
    fireEvent.click(first.getByTestId("row"))
    first.unmount()
    scrollY = 0
    render(<List k="/explore?show=accounts" ready />)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
