import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react"
import ExploreSearchField from "../explore-search-field"

// The search field owns the keystroke state so typing never re-renders
// the explore chrome + results tree (perf finding: keystroke state was
// hoisted into ExploreMain/ExploreAllBlocks). These tests pin the
// debounce contract the extraction must preserve: one commit 350ms
// after typing stops, `null` for a cleared input, external `?q=`
// changes synced in, and the component's own committed write NOT
// bounced back into the input.

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ExploreSearchField", () => {
  it("commits the debounced query once typing stops", () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    render(
      <ExploreSearchField search="" placeholder="Search…" onCommit={onCommit} />,
    )
    const input = screen.getByRole("searchbox", { name: "Search…" })
    fireEvent.change(input, { target: { value: "so" } })
    fireEvent.change(input, { target: { value: "soil" } })
    // Mid-debounce: nothing committed yet.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onCommit).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith("soil")
  })

  it("commits null when the input is cleared", () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    render(
      <ExploreSearchField
        search="soil"
        placeholder="Search…"
        onCommit={onCommit}
      />,
    )
    const input = screen.getByRole("searchbox", { name: "Search…" })
    fireEvent.change(input, { target: { value: "" } })
    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(onCommit).toHaveBeenCalledWith(null)
  })

  it("syncs an external URL change into the input", () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <ExploreSearchField search="" placeholder="Search…" onCommit={onCommit} />,
    )
    // e.g. back/forward or a filter switch that rewrites `?q=`.
    rerender(
      <ExploreSearchField
        search="mangrove"
        placeholder="Search…"
        onCommit={onCommit}
      />,
    )
    const input = screen.getByRole<HTMLInputElement>("searchbox", {
      name: "Search…",
    })
    expect(input.value).toBe("mangrove")
  })

  it("commits through the latest onCommit when the prop changes mid-debounce", () => {
    vi.useFakeTimers()
    const staleCommit = vi.fn()
    const freshCommit = vi.fn()
    const { rerender } = render(
      <ExploreSearchField
        search=""
        placeholder="Search…"
        onCommit={staleCommit}
      />,
    )
    const input = screen.getByRole("searchbox", { name: "Search…" })
    fireEvent.change(input, { target: { value: "coral" } })
    // A sort / filter / view click during the 350ms window re-renders
    // the parent with a NEW onCommit whose setUrl closes over the fresh
    // URLSearchParams. The pending timer must commit through that one —
    // the stale closure would rebuild the URL from the pre-click
    // snapshot and revert the click.
    rerender(
      <ExploreSearchField
        search=""
        placeholder="Search…"
        onCommit={freshCommit}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(staleCommit).not.toHaveBeenCalled()
    expect(freshCommit).toHaveBeenCalledTimes(1)
    expect(freshCommit).toHaveBeenCalledWith("coral")
  })

  it("does not stomp a newer keystroke when its own write echoes back", () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { rerender } = render(
      <ExploreSearchField search="" placeholder="Search…" onCommit={onCommit} />,
    )
    const input = screen.getByRole<HTMLInputElement>("searchbox", {
      name: "Search…",
    })
    fireEvent.change(input, { target: { value: "kelp" } })
    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(onCommit).toHaveBeenCalledWith("kelp")
    // Extra keystroke lands before the URL round-trip completes…
    fireEvent.change(input, { target: { value: "kelp f" } })
    // …then the committed value echoes back via the `search` prop. The
    // lastWroteToUrl guard must keep the newer keystroke on screen.
    rerender(
      <ExploreSearchField
        search="kelp"
        placeholder="Search…"
        onCommit={onCommit}
      />,
    )
    expect(input.value).toBe("kelp f")
  })
})
