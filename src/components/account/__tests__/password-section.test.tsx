import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))

import PasswordSection from "../password-section"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

beforeEach(() => {
  authFetch.mockReset()
})

describe("PasswordSection errors", () => {
  it("never shows a raw upstream error name", async () => {
    authFetch.mockResolvedValue(json(400, { error: "NotFound" }))
    render(<PasswordSection email="ada@example.com" />)

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))

    expect(
      await screen.findByText("Couldn't send the reset code. Try again in a moment."),
    ).toBeInTheDocument()
    expect(screen.queryByText("NotFound")).toBeNull()
  })

  it("reads 'Not authenticated' as an expired session", async () => {
    authFetch.mockResolvedValue(json(401, { error: "Not authenticated" }))
    render(<PasswordSection email="ada@example.com" />)

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))

    expect(
      await screen.findByText("Your session has expired. Sign in again to continue."),
    ).toBeInTheDocument()
  })

  it("says a wrong reset code in plain words", async () => {
    authFetch
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(400, { error: "InvalidToken", message: "Token is invalid" }))
    render(<PasswordSection email="ada@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))
    await screen.findByLabelText("Reset code")

    fireEvent.change(screen.getByLabelText("Reset code"), { target: { value: "abc" } })
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough" } })
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "longenough" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("That reset code doesn't match. Check it and try again."),
    ).toBeInTheDocument()
  })

  it("has no heading of its own in the form (the settings row names it)", async () => {
    authFetch.mockResolvedValue(json(200, {}))
    render(<PasswordSection email="ada@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }))

    await waitFor(() => expect(screen.getByLabelText("Reset code")).toBeInTheDocument())
    expect(screen.queryByRole("heading", { name: "Password" })).toBeNull()
  })
})
