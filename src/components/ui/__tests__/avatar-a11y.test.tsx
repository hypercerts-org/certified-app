import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import Avatar from "../avatar"

/**
 * The initials are a picture of a name that is always written out next to
 * the avatar, so a screen reader shouldn't read "AP Ada Pollen". And an
 * image avatar shows the initials until its image has loaded, never a
 * blank circle.
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

  it("shows the initials until the image loads, then drops them", async () => {
    render(<Avatar src="https://example.com/a.png" fallbackInitials="AP" />)
    const initials = screen.getByText("AP")
    expect(initials.getAttribute("aria-hidden")).toBe("true")

    const img = document.querySelector("img") as HTMLImageElement
    fireEvent.load(img)
    await waitFor(() => expect(screen.queryByText("AP")).toBeNull())
  })

  it("falls back to the ringed initials when the image fails", async () => {
    render(<Avatar src="https://example.com/broken.png" fallbackInitials="AP" />)
    fireEvent.error(document.querySelector("img") as HTMLImageElement)
    await waitFor(() => expect(document.querySelector("img")).toBeNull())
    expect(screen.getByText("AP")).toBeTruthy()
  })
})
