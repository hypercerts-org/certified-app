import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HomeFeedBody } from "../home-feed"

const observerConstructed = vi.fn()

class FakeIntersectionObserver {
  constructor() {
    observerConstructed()
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  observerConstructed.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("empty home-feed pagination", () => {
  it("keeps an accessible manual control after the 25-attempt auto budget", async () => {
    const loadMore = vi.fn()
    const props = {
      events: [],
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      cursor: "cursor-a",
      error: null,
      continuationError: null,
      retryAt: null,
      canAutoLoad: true,
      requestKey: "request-a",
      retryInitial: vi.fn(),
      loadMore,
    }
    const { rerender } = render(<HomeFeedBody {...props} />)
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1))

    for (let attempt = 1; attempt < 25; attempt++) {
      rerender(<HomeFeedBody {...props} isLoadingMore />)
      rerender(<HomeFeedBody {...props} isLoadingMore={false} />)
      await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(attempt + 1))
    }

    const manualButton = screen.getByRole("button", { name: "Load more" })
    expect(manualButton).toBeTruthy()
    expect(observerConstructed).not.toHaveBeenCalled()
    fireEvent.click(manualButton)
    expect(loadMore).toHaveBeenCalledTimes(26)
  })
})
