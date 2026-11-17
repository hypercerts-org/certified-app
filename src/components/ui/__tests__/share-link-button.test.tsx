import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react"
import ShareLinkButton from "../share-link-button"

/**
 * Share opens the system share sheet on a touch device that has one, and
 * copies the link everywhere else (or when the sheet can't open).
 */

const writeText = vi.fn(async () => {})
let share: ReturnType<typeof vi.fn> | undefined
let coarse = false

beforeEach(() => {
  writeText.mockClear()
  share = undefined
  coarse = false
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  Object.defineProperty(navigator, "share", {
    configurable: true,
    get: () => share,
  })
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
})

describe("ShareLinkButton", () => {
  it("copies the link on a desktop, even where the browser could share", async () => {
    share = vi.fn(async () => {})
    render(<ShareLinkButton path="/ada.test" what="Profile link" title="Ada" />)
    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/ada.test`))
    expect(share).not.toHaveBeenCalled()
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeTruthy()
  })

  it("opens the share sheet on a touch device, with the title and link", async () => {
    coarse = true
    share = vi.fn(async () => {})
    render(<ShareLinkButton path="/ada.test" what="Profile link" title="Ada" />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }))
    })
    expect(share).toHaveBeenCalledWith({ title: "Ada", url: `${window.location.origin}/ada.test` })
    expect(writeText).not.toHaveBeenCalled()
  })

  it("does nothing more when the sheet is closed", async () => {
    coarse = true
    share = vi.fn(async () => {
      throw new DOMException("Share canceled", "AbortError")
    })
    render(<ShareLinkButton path="/ada.test" />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }))
    })
    expect(share).toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it("copies the link when the sheet can't open", async () => {
    coarse = true
    share = vi.fn(async () => {
      throw new DOMException("Not allowed", "NotAllowedError")
    })
    render(<ShareLinkButton path="/ada.test" />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }))
    })
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/ada.test`)
  })

  it("copies on a touch device without a share sheet", async () => {
    coarse = true
    render(<ShareLinkButton path="/ada.test" />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }))
    })
    expect(writeText).toHaveBeenCalled()
  })
})
