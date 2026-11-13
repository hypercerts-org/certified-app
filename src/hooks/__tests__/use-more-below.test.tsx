import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { useMoreBelow } from "../use-more-below"

/**
 * `useMoreBelow` drives the fade at the bottom of the /feed filters
 * column (`data-more-below` on `.feed-layout__filters`, feed.css): the
 * fade shows while the column can scroll further down and goes once it
 * is scrolled to the end. jsdom does no layout, so the scroller's
 * metrics are stubbed per element and ResizeObserver is a fake whose
 * callback the tests fire by hand.
 */

type Metrics = { scrollHeight: number; clientHeight: number; scrollTop: number }

/** Give `el` fixed scroll metrics that the test can change later. */
function stubMetrics(el: HTMLElement, metrics: Metrics): Metrics {
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight,
  })
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  })
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => metrics.scrollTop,
  })
  return metrics
}

let resizeCallbacks: Array<() => void> = []

class FakeResizeObserver {
  private readonly cb: () => void
  constructor(cb: () => void) {
    this.cb = cb
    resizeCallbacks.push(cb)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((c) => c !== this.cb)
  }
}

/** Renders the hook's answer the way the filters column does. */
function Scroller({ metrics }: { metrics: Metrics }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const moreBelow = useMoreBelow(ref)
  return (
    <div
      ref={(el) => {
        // Stub before the hook's effect reads the metrics.
        if (el && ref.current !== el) stubMetrics(el, metrics)
        ref.current = el
      }}
      data-testid="scroller"
      data-more-below={moreBelow ? "" : undefined}
    >
      <div />
    </div>
  )
}

beforeEach(() => {
  resizeCallbacks = []
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useMoreBelow", () => {
  it("is true on mount when the content runs past the bottom", () => {
    render(<Scroller metrics={{ scrollHeight: 900, clientHeight: 600, scrollTop: 0 }} />)
    expect(screen.getByTestId("scroller")).toHaveAttribute("data-more-below")
  })

  it("is false when the content fits", () => {
    render(<Scroller metrics={{ scrollHeight: 600, clientHeight: 600, scrollTop: 0 }} />)
    expect(screen.getByTestId("scroller")).not.toHaveAttribute("data-more-below")
  })

  it("goes false at the end of the scroll and comes back when scrolled up", () => {
    const metrics = { scrollHeight: 900, clientHeight: 600, scrollTop: 0 }
    render(<Scroller metrics={metrics} />)
    const scroller = screen.getByTestId("scroller")

    metrics.scrollTop = 300
    fireEvent.scroll(scroller)
    expect(scroller).not.toHaveAttribute("data-more-below")

    metrics.scrollTop = 120
    fireEvent.scroll(scroller)
    expect(scroller).toHaveAttribute("data-more-below")
  })

  it("treats a sub-pixel shortfall at the end as the end", () => {
    const metrics = { scrollHeight: 900, clientHeight: 600, scrollTop: 299.5 }
    render(<Scroller metrics={metrics} />)
    expect(screen.getByTestId("scroller")).not.toHaveAttribute("data-more-below")
  })

  it("re-checks when the container or its content resizes", () => {
    const metrics = { scrollHeight: 600, clientHeight: 600, scrollTop: 0 }
    render(<Scroller metrics={metrics} />)
    const scroller = screen.getByTestId("scroller")
    expect(scroller).not.toHaveAttribute("data-more-below")

    // Rows load late and the content grows past the bottom.
    metrics.scrollHeight = 840
    act(() => resizeCallbacks.forEach((cb) => cb()))
    expect(scroller).toHaveAttribute("data-more-below")

    // The window grows tall enough to show everything.
    metrics.clientHeight = 840
    act(() => resizeCallbacks.forEach((cb) => cb()))
    expect(scroller).not.toHaveAttribute("data-more-below")
  })

  it("stops listening on unmount", () => {
    const { unmount } = render(
      <Scroller metrics={{ scrollHeight: 900, clientHeight: 600, scrollTop: 0 }} />,
    )
    expect(resizeCallbacks).toHaveLength(1)
    unmount()
    expect(resizeCallbacks).toHaveLength(0)
  })
})
