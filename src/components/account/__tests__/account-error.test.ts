import { describe, it, expect } from "vitest"
import { accountErrorMessage } from "../account-error"

const FALLBACK = "Couldn't send the reset code. Try again in a moment"

describe("accountErrorMessage", () => {
  it("replaces a bare upstream error name with the fallback sentence", () => {
    expect(accountErrorMessage("NotFound", FALLBACK)).toBe(`${FALLBACK}.`)
    expect(accountErrorMessage("InvalidRequest", FALLBACK)).toBe(`${FALLBACK}.`)
  })

  it("reads a missing session as an expired one", () => {
    expect(accountErrorMessage("Not authenticated", FALLBACK)).toBe(
      "Your session has expired. Sign in again to continue.",
    )
    expect(accountErrorMessage("anything", FALLBACK, 401)).toBe(
      "Your session has expired. Sign in again to continue.",
    )
  })

  it("replaces the library's generic 'Failed to …' text", () => {
    expect(accountErrorMessage("Failed to update email", "Couldn't update your email")).toBe(
      "Couldn't update your email.",
    )
  })

  it("keeps a sentence written for people", () => {
    expect(accountErrorMessage("This email is already in use", FALLBACK)).toBe(
      "This email is already in use.",
    )
  })

  it("says a server failure is on our side", () => {
    expect(accountErrorMessage("Internal Server Error", FALLBACK, 500)).toMatch(
      /Something went wrong on our side/,
    )
  })

  it("uses the fallback when there is no message", () => {
    expect(accountErrorMessage(undefined, FALLBACK)).toBe(`${FALLBACK}.`)
  })
})
