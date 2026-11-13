import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { hydrateRoot } from "react-dom/client"
import Avatar, { INITIALS_DELAY_MS } from "../avatar"

/**
 * Audit X13: the account button and page headers showed the initials
 * ("HO") for a second or two while the picture loaded, then switched. Now
 * an avatar with a picture is the neutral fill without letters for the
 * first INITIALS_DELAY_MS; the initials show only if the picture is still
 * missing then. No picture, or a failed one, shows the initials at once.
 * `data-fallback` (read by the styles, looks.css) marks exactly the
 * states that show initials.
 */

const SRC = "https://example.com/a.png"

function box(container: HTMLElement) {
  return container.firstElementChild as HTMLElement
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe("Avatar initials delay", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the initials at once when there is no picture", () => {
    const { container } = render(<Avatar fallbackInitials="HO" />)
    expect(screen.getByText("HO")).toBeTruthy()
    expect(box(container)).toHaveAttribute("data-fallback")
    expect(box(container)).toHaveAttribute("data-centerpiece", "avatar")
    expect(box(container)).toHaveAttribute("data-shape", "circle")
  })

  it("is the blank neutral fill while the picture is on time", () => {
    const { container } = render(<Avatar src={SRC} fallbackInitials="HO" size="sm" />)
    expect(screen.queryByText("HO")).toBeNull()
    expect(box(container)).not.toHaveAttribute("data-fallback")
    const fill = box(container).querySelector('span[aria-hidden="true"]') as HTMLElement
    expect(fill.className).toContain("bg-[var(--color-surface-container-high)]")
    expect(fill.className).toContain("absolute inset-0")
    expect(fill.textContent).toBe("")

    advance(INITIALS_DELAY_MS - 1)
    expect(screen.queryByText("HO")).toBeNull()
  })

  it("shows the initials once the picture is late, in the same box", () => {
    const { container } = render(<Avatar src={SRC} fallbackInitials="HO" size="sm" shape="square" />)
    const before = box(container).className

    advance(INITIALS_DELAY_MS)
    expect(screen.getByText("HO")).toBeTruthy()
    expect(box(container)).toHaveAttribute("data-fallback")
    expect(box(container)).toHaveAttribute("data-shape", "square")
    // Same element and classes: nothing shifts.
    expect(box(container).className).toBe(before)
    expect(box(container).className).toContain("h-8 w-8")
  })

  it("never shows the initials when the picture loads in time", async () => {
    const { container } = render(<Avatar src={SRC} fallbackInitials="HO" />)
    await act(async () => {
      fireEvent.load(container.querySelector("img") as HTMLImageElement)
    })
    advance(INITIALS_DELAY_MS * 3)
    expect(screen.queryByText("HO")).toBeNull()
    expect(box(container)).not.toHaveAttribute("data-fallback")
    expect(container.querySelector("img")).not.toBeNull()
    // The fill is gone too, so a transparent logo shows no letters or fill.
    expect(box(container).querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  it("drops the late initials when the picture arrives", async () => {
    const { container } = render(<Avatar src={SRC} fallbackInitials="HO" />)
    advance(INITIALS_DELAY_MS)
    expect(screen.getByText("HO")).toBeTruthy()

    await act(async () => {
      fireEvent.load(container.querySelector("img") as HTMLImageElement)
    })
    expect(screen.queryByText("HO")).toBeNull()
    expect(box(container)).not.toHaveAttribute("data-fallback")
  })

  it("shows the ringed initials at once when the picture fails", () => {
    const { container } = render(<Avatar src={SRC} fallbackInitials="HO" />)
    act(() => {
      fireEvent.error(container.querySelector("img") as HTMLImageElement)
    })
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("HO")).toBeTruthy()
    expect(box(container)).toHaveAttribute("data-fallback")
  })

  it("starts the wait over for a new picture", () => {
    const { container, rerender } = render(<Avatar src={SRC} fallbackInitials="HO" />)
    advance(INITIALS_DELAY_MS)
    expect(screen.getByText("HO")).toBeTruthy()

    rerender(<Avatar src="https://example.com/b.png" fallbackInitials="HO" />)
    expect(screen.queryByText("HO")).toBeNull()
    expect(box(container)).not.toHaveAttribute("data-fallback")
    advance(INITIALS_DELAY_MS)
    expect(screen.getByText("HO")).toBeTruthy()
  })

  it("clears its timer on unmount", () => {
    const { unmount } = render(<Avatar src={SRC} fallbackInitials="HO" />)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("Avatar initials delay, server render", () => {
  it("renders a picture avatar as the blank fill on the server, and no picture as initials", () => {
    const withPicture = renderToString(<Avatar src={SRC} fallbackInitials="HO" />)
    expect(withPicture).not.toContain("HO")
    expect(withPicture).not.toContain("data-fallback")

    const without = renderToString(<Avatar fallbackInitials="HO" />)
    expect(without).toContain("HO")
    expect(without).toContain("data-fallback")
  })

  it("hydrates without a mismatch", async () => {
    const html = renderToString(<Avatar src={SRC} fallbackInitials="HO" />)
    const host = document.createElement("div")
    host.innerHTML = html
    document.body.appendChild(host)
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const recoverable = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(host, <Avatar src={SRC} fallbackInitials="HO" />, {
        onRecoverableError: recoverable,
      })
    })
    expect(recoverable).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    await act(async () => root?.unmount())
    errors.mockRestore()
    host.remove()
  })
})
