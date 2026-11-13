import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import Avatar, { INITIALS_DELAY_MS } from "../avatar"

/**
 * The initials are a picture of a name that is always written out next to
 * the avatar, so a screen reader shouldn't read "AP Ada Pollen". An image
 * avatar is the neutral fill while its image loads, with the initials once
 * the image is late (avatar-initials-delay.test.tsx has the timing).
 */
describe("Avatar initials", () => {
  it("hides the fallback initials from assistive tech when there's no alt", () => {
    const { container } = render(<Avatar fallbackInitials="AP" />)
    const initials = screen.getByText("AP")
    expect(initials.getAttribute("aria-hidden")).toBe("true")
    expect(container.querySelector('[role="img"]')).toBeNull()
  })

  it("names the fallback avatar by its alt when one is given", () => {
    render(<Avatar fallbackInitials="AP" alt="Ada Pollen" />)
    expect(screen.getByRole("img", { name: "Ada Pollen" })).toBeTruthy()
  })

  it("shows the initials, hidden from assistive tech, once a slow image is late, then drops them on load", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      render(<Avatar src="https://example.com/a.png" fallbackInitials="AP" />)
      act(() => {
        vi.advanceTimersByTime(INITIALS_DELAY_MS)
      })
      const initials = screen.getByText("AP")
      expect(initials.getAttribute("aria-hidden")).toBe("true")

      const img = document.querySelector("img") as HTMLImageElement
      await act(async () => {
        fireEvent.load(img)
      })
      expect(screen.queryByText("AP")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("falls back to the ringed initials when the image fails", async () => {
    render(<Avatar src="https://example.com/broken.png" fallbackInitials="AP" />)
    fireEvent.error(document.querySelector("img") as HTMLImageElement)
    await waitFor(() => expect(document.querySelector("img")).toBeNull())
    expect(screen.getByText("AP")).toBeTruthy()
  })
})
