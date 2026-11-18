import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const requestReset = vi.fn()
vi.mock("@/lib/groups/api", () => ({
  requestGroupPasswordReset: (...args: unknown[]) => requestReset(...args),
  confirmGroupPasswordReset: vi.fn(),
}))

import GroupPasswordReset from "../group-password-reset"

// Braces: a function returned from beforeEach runs as its teardown, and
// mockReset() returns the mock.
beforeEach(() => {
  requestReset.mockReset()
})

async function sendCode() {
  render(<GroupPasswordReset groupDid="did:plc:group" />)
  // "Reset password" only opens the email step; nothing is sent yet.
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }))
  expect(requestReset).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText("Group email"), { target: { value: "team@example.org" } })
  fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
}

describe("GroupPasswordReset errors", () => {
  it("says a failed send in a sentence, not the upstream error name", async () => {
    requestReset.mockImplementation(async () => {
      throw new Error("InvalidRequest")
    })
    await sendCode()

    expect(
      await screen.findByText("Couldn't send the reset code. Check the group's email and try again."),
    ).toBeInTheDocument()
    expect(screen.queryByText("InvalidRequest")).toBeNull()
  })

  it("keeps a message written for people", async () => {
    requestReset.mockImplementation(async () => {
      throw new Error("That email doesn't belong to this group.")
    })
    await sendCode()

    expect(await screen.findByText("That email doesn't belong to this group.")).toBeInTheDocument()
  })
})
