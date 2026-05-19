import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import AppDialog from "../app-dialog"

/**
 * jsdom's `HTMLDialogElement` doesn't ship `showModal`/`close` by
 * default (it's a stub). Polyfill enough for the lifecycle tests
 * below to drive the component through its real code paths.
 */
function polyfillDialog() {
  // Only install once — the polyfill closes over the prototype.
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
    __polyfilled?: boolean
  }
  if (proto.__polyfilled) return
  proto.__polyfilled = true
  proto.showModal = function () {
    ;(this as unknown as { open: boolean }).open = true
  }
  proto.close = function () {
    ;(this as unknown as { open: boolean }).open = false
    this.dispatchEvent(new Event("close"))
  }
}

beforeEach(() => {
  polyfillDialog()
  cleanup()
})

describe("AppDialog", () => {
  it("renders with the base signin-modal app-modal classes + aria-label", () => {
    render(
      <AppDialog ariaLabel="Test" onClose={() => undefined}>
        <span>body</span>
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", { hidden: true })
    expect(dialog.className).toContain("signin-modal")
    expect(dialog.className).toContain("app-modal")
    expect(dialog.getAttribute("aria-label")).toBe("Test")
  })

  it("appends a custom className to the base pair", () => {
    render(
      <AppDialog
        ariaLabel="X"
        className="endorse-people-modal"
        onClose={() => undefined}
      >
        <span>body</span>
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", { hidden: true })
    expect(dialog.className).toBe("signin-modal app-modal endorse-people-modal")
  })

  it("renders an alertdialog when role='alertdialog'", () => {
    render(
      <AppDialog ariaLabel="Confirm" role="alertdialog" onClose={() => undefined}>
        body
      </AppDialog>,
    )
    expect(screen.getByRole("alertdialog", { hidden: true })).toBeTruthy()
  })

  it("applies maxWidth style when provided", () => {
    render(
      <AppDialog ariaLabel="X" maxWidth={440} onClose={() => undefined}>
        body
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement
    expect(dialog.style.maxWidth).toBe("440px")
  })

  it("calls onClose when the dialog fires a close event (Esc / native close)", () => {
    const onClose = vi.fn()
    render(
      <AppDialog ariaLabel="X" onClose={onClose}>
        body
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement
    dialog.close()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("calls onClose when the user clicks the backdrop (target === dialog)", () => {
    const onClose = vi.fn()
    render(
      <AppDialog ariaLabel="X" onClose={onClose}>
        <span data-testid="inner">body</span>
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("does NOT call onClose when the click target is content (event.target !== dialog)", () => {
    const onClose = vi.fn()
    render(
      <AppDialog ariaLabel="X" onClose={onClose}>
        <button data-testid="inner-button">click me</button>
      </AppDialog>,
    )
    fireEvent.click(screen.getByTestId("inner-button"))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("suppresses backdrop close when disableBackdropClose is true", () => {
    const onClose = vi.fn()
    render(
      <AppDialog ariaLabel="X" onClose={onClose} disableBackdropClose>
        body
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("still fires onClose on a native close event when disableBackdropClose is true (Esc)", () => {
    // Backdrop is suppressed but the browser's Esc → close event must
    // still close the dialog — that's how users get out.
    const onClose = vi.fn()
    render(
      <AppDialog ariaLabel="X" onClose={onClose} disableBackdropClose>
        body
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement
    dialog.close()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("renders children inside the stop-propagation wrapper", () => {
    render(
      <AppDialog ariaLabel="X" onClose={() => undefined}>
        <span data-testid="child-content">hello</span>
      </AppDialog>,
    )
    expect(screen.getByTestId("child-content").textContent).toBe("hello")
  })

  it("cleans up its close listener on unmount (no stale callbacks)", () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <AppDialog ariaLabel="X" onClose={onClose}>
        body
      </AppDialog>,
    )
    const dialog = screen.getByRole("dialog", {
      hidden: true,
    }) as HTMLDialogElement
    unmount()
    // Firing close after unmount should NOT call onClose — the
    // listener was removed in the effect's cleanup.
    dialog.dispatchEvent(new Event("close"))
    expect(onClose).not.toHaveBeenCalled()
  })
})
