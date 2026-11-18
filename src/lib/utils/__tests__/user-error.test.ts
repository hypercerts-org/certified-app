import { describe, it, expect } from "vitest"
import { caughtErrorMessage, userErrorMessage } from "../user-error"

const FALLBACK = "Couldn't send the reset code. Try again in a moment"

describe("userErrorMessage", () => {
  it("replaces a bare upstream error name with the fallback sentence", () => {
    expect(userErrorMessage("NotFound", FALLBACK)).toBe(`${FALLBACK}.`)
    expect(userErrorMessage("InvalidRequest", FALLBACK)).toBe(`${FALLBACK}.`)
    expect(userErrorMessage("Forbidden", FALLBACK)).toBe(`${FALLBACK}.`)
  })

  it("reads a missing session as an expired one", () => {
    expect(userErrorMessage("Not authenticated", FALLBACK)).toBe(
      "Your session has expired. Sign in again to continue.",
    )
    expect(userErrorMessage("anything", FALLBACK, 401)).toBe(
      "Your session has expired. Sign in again to continue.",
    )
  })

  it("replaces the library's generic 'Failed to …' text", () => {
    expect(userErrorMessage("Failed to update email", "Couldn't update your email")).toBe(
      "Couldn't update your email.",
    )
    expect(
      userErrorMessage(
        "Failed to add member. Something went wrong on our side; try again in a moment.",
        "Couldn't add the member. Try again in a moment",
      ),
    ).toBe("Couldn't add the member. Try again in a moment.")
  })

  it("replaces a browser's network failure text", () => {
    expect(userErrorMessage("Failed to fetch", FALLBACK)).toBe(`${FALLBACK}.`)
    expect(userErrorMessage("Load failed", FALLBACK)).toBe(`${FALLBACK}.`)
    expect(
      userErrorMessage("NetworkError when attempting to fetch resource.", FALLBACK),
    ).toBe(`${FALLBACK}.`)
  })

  it("keeps a sentence written for people", () => {
    expect(userErrorMessage("This email is already in use", FALLBACK)).toBe(
      "This email is already in use.",
    )
    expect(userErrorMessage("Handle must be at least 3 characters.", FALLBACK)).toBe(
      "Handle must be at least 3 characters.",
    )
  })

  it("drops a message that names protocol internals", () => {
    expect(userErrorMessage("Invalid DID in request", FALLBACK)).toBe(`${FALLBACK}.`)
    expect(userErrorMessage("upstream returned 502", FALLBACK)).toBe(`${FALLBACK}.`)
  })

  it("says a server failure is on our side", () => {
    expect(userErrorMessage("Internal Server Error", FALLBACK, 500)).toMatch(
      /Something went wrong on our side/,
    )
  })

  it("uses the fallback when there is no message", () => {
    expect(userErrorMessage(undefined, FALLBACK)).toBe(`${FALLBACK}.`)
    expect(userErrorMessage("  ", FALLBACK)).toBe(`${FALLBACK}.`)
  })
})

describe("caughtErrorMessage", () => {
  it("reads an Error's message", () => {
    expect(caughtErrorMessage(new Error("That handle is taken."), FALLBACK)).toBe(
      "That handle is taken.",
    )
    expect(caughtErrorMessage(new Error("NotFound"), FALLBACK)).toBe(`${FALLBACK}.`)
  })

  it("uses the fallback for anything that isn't an Error", () => {
    expect(caughtErrorMessage("boom", FALLBACK)).toBe(`${FALLBACK}.`)
    expect(caughtErrorMessage(undefined, FALLBACK)).toBe(`${FALLBACK}.`)
  })
})
