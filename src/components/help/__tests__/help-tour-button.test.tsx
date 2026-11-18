import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const start = vi.fn()
const openSignIn = vi.fn(async () => {})
const auth = vi.hoisted(() => ({ isAuthenticated: false }))

vi.mock("@/lib/tour/tour-context", () => ({ useTour: () => ({ start }) }))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: auth.isAuthenticated, openSignIn }),
}))

import HelpTourButton, { TOUR_AFTER_SIGN_IN_KEY } from "../help-tour-button"

beforeEach(() => {
  start.mockClear()
  openSignIn.mockClear()
  sessionStorage.clear()
  auth.isAuthenticated = false
})

describe("HelpTourButton", () => {
  it("signs a visitor in and remembers they asked for the walk-through", () => {
    render(<HelpTourButton />)

    fireEvent.click(screen.getByRole("button", { name: "Sign in to start the walk-through" }))

    expect(openSignIn).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(TOUR_AFTER_SIGN_IN_KEY)).not.toBeNull()
    expect(start).not.toHaveBeenCalled()
  })

  it("starts the walk-through once they're back signed in, and only once", () => {
    sessionStorage.setItem(TOUR_AFTER_SIGN_IN_KEY, String(Date.now()))
    auth.isAuthenticated = true
    const { unmount } = render(<HelpTourButton />)

    expect(start).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(TOUR_AFTER_SIGN_IN_KEY)).toBeNull()

    unmount()
    render(<HelpTourButton />)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it("doesn't start for a signed-in visit nobody asked for", () => {
    auth.isAuthenticated = true
    render(<HelpTourButton />)

    expect(start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Start the walk-through" }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it("ignores a request from an abandoned sign-in", () => {
    sessionStorage.setItem(TOUR_AFTER_SIGN_IN_KEY, String(Date.now() - 60 * 60 * 1000))
    auth.isAuthenticated = true
    render(<HelpTourButton />)

    expect(start).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(TOUR_AFTER_SIGN_IN_KEY)).toBeNull()
  })
})
