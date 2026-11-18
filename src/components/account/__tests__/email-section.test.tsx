import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const requestUpdate = vi.fn()
vi.mock("@/lib/atproto/account-email", () => {
  class EmailLockedError extends Error {}
  return {
    requestEmailUpdate: () => requestUpdate(),
    updateEmail: vi.fn(),
    requestEmailConfirmation: vi.fn(),
    confirmEmail: vi.fn(),
    EmailLockedError,
  }
})
vi.mock("@/hooks/use-session", () => ({ updateCachedSessionEmail: vi.fn() }))
vi.mock("@/components/settings/unlock-app-passwords-dialog", () => ({ default: () => null }))

import EmailSection from "../email-section"

beforeEach(() => {
  requestUpdate.mockReset()
})

describe("EmailSection send step", () => {
  it("starts nothing on Edit: it says where the code goes first", () => {
    render(<EmailSection email="ada@example.com" />)

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))

    expect(requestUpdate).not.toHaveBeenCalled()
    expect(screen.getByText(/We.ll email a code to/)).toHaveTextContent(
      "We\u2019ll email a code to ada@example.com to confirm the change.",
    )
  })

  it("starts the change on Send code", async () => {
    requestUpdate.mockResolvedValue({ tokenRequired: true })
    render(<EmailSection email="ada@example.com" />)

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))

    expect(requestUpdate).toHaveBeenCalledTimes(1)
    expect(await screen.findByLabelText("Confirmation code")).toBeInTheDocument()
  })

  it("closes on Cancel without starting anything", () => {
    render(<EmailSection email="ada@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(requestUpdate).not.toHaveBeenCalled()
  })
})

describe("EmailSection errors", () => {
  it("turns an upstream error name into a sentence", async () => {
    requestUpdate.mockImplementation(async () => { throw new Error("NotFound") })
    render(<EmailSection email="ada@example.com" />)

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))

    expect(
      await screen.findByText("Couldn't start the email change. Try again in a moment."),
    ).toBeInTheDocument()
    expect(screen.queryByText("NotFound")).toBeNull()
  })

  it("reads 'Not authenticated' as an expired session", async () => {
    requestUpdate.mockImplementation(async () => { throw new Error("Not authenticated") })
    render(<EmailSection email="ada@example.com" />)

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))

    expect(
      await screen.findByText("Your session has expired. Sign in again to continue."),
    ).toBeInTheDocument()
  })
})
