import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
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

function renderModal(props: { error?: string | null; formError?: string | null } = {}) {
  const onClearErrors = vi.fn()
  render(
    <SignInModal
      isOpen
      error={props.error ?? null}
      formError={props.formError ?? null}
      onClose={() => undefined}
      onClearErrors={onClearErrors}
      onSubmitEmail={async () => undefined}
      onSubmitHandle={async () => undefined}
      onSubmitGoogle={async () => undefined}
    />,
  )
  return { onClearErrors }
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

  it("still marks the field invalid for a field error", () => {
    renderModal({ error: "Invalid email" })

    expect(screen.getByLabelText("Your email").getAttribute("aria-invalid")).toBe("true")
  })

  it("clears errors when the user switches sign-in method", () => {
    const { onClearErrors } = renderModal({ formError: "Couldn't start Google sign-in." })

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Atmosphere" }))

    expect(onClearErrors).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText("Your handle")).toBeTruthy()
  })
})
