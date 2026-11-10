import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import SignInModal from "../sign-in-modal"

// jsdom's HTMLDialogElement has no showModal/close; <AppDialog> calls both.
function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
  }
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  proto.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
}

type State = { isOpen?: boolean; error?: string | null; formError?: string | null }

function renderModal(initial: State = {}) {
  const onClose = vi.fn()
  const onClearErrors = vi.fn()
  const ui = (state: State) => (
    <SignInModal
      isOpen={state.isOpen ?? true}
      error={state.error ?? null}
      formError={state.formError ?? null}
      onClose={onClose}
      onClearErrors={onClearErrors}
      onSubmitEmail={async () => undefined}
      onSubmitHandle={async () => undefined}
      onSubmitGoogle={async () => undefined}
    />
  )
  const { rerender } = render(ui(initial))
  // The auth context closes the modal while a sign-in starts and reopens
  // it, with the error, when that fails.
  const reopen = (state: State) => {
    rerender(ui({ isOpen: false }))
    rerender(ui({ ...state, isOpen: true }))
  }
  return { onClose, onClearErrors, reopen }
}

beforeEach(() => {
  polyfillDialog()
  cleanup()
})

describe("SignInModal errors", () => {
  it("shows a form error as an alert without marking the email field invalid", () => {
    renderModal({ formError: "Couldn't start Google sign-in." })

    expect(screen.getByRole("alert").textContent).toBe("Couldn't start Google sign-in.")
    const email = screen.getByLabelText("Your email")
    expect(email.getAttribute("aria-invalid")).toBeNull()
  })

  it("focuses the Google button and links the form error to it", async () => {
    renderModal({ formError: "Couldn't start Google sign-in." })

    const google = screen.getByRole("button", { name: "Sign in with Google" })
    await waitFor(() => expect(document.activeElement).toBe(google))
    expect(google.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id)
  })

  it("clears errors when the user switches sign-in method", () => {
    const { onClearErrors } = renderModal({ formError: "Couldn't start Google sign-in." })

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Atmosphere" }))

    expect(onClearErrors).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText("Your handle")).toBeTruthy()
  })

  it("reopens on the handle view, with the typed handle and its error, after a failed sign-in", () => {
    const { reopen } = renderModal()
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Atmosphere" }))
    fireEvent.change(screen.getByLabelText("Your handle"), { target: { value: "alice.example" } })

    reopen({ error: "Couldn't find that handle" })

    const handle = screen.getByLabelText("Your handle") as HTMLInputElement
    expect(handle.value).toBe("alice.example")
    expect(handle.getAttribute("aria-invalid")).toBe("true")
  })

  it("starts fresh on the email view after the user closes it", () => {
    const { onClose, reopen } = renderModal()
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Atmosphere" }))
    fireEvent.change(screen.getByLabelText("Your handle"), { target: { value: "alice.example" } })

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    reopen({})

    expect((screen.getByLabelText("Your email") as HTMLInputElement).value).toBe("")
  })
})
