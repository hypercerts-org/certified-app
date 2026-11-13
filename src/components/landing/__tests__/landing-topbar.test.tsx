import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

/**
 * The landing bar carries the app's faded Certified.app wordmark and the
 * sign-in / open-app button, and no theme switch: the theme lives in
 * Settings, as in the app (LA1, LA2).
 */

const { auth } = vi.hoisted(() => ({
  auth: {
    value: {
      isLoading: false,
      isAuthenticated: false,
      openSignInModal: () => {},
      did: null as string | null,
    },
  },
}))
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => auth.value }))
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: null, avatarUrl: null }),
}))

import LandingTopBar from "../landing-topbar"

beforeEach(() => {
  auth.value = { ...auth.value, isLoading: false, isAuthenticated: false, did: null }
})

describe("LandingTopBar", () => {
  it("shows the Certified.app wordmark in the home link", () => {
    render(<LandingTopBar />)
    const home = screen.getByRole("link", { name: "Certified — home" })
    expect(home).toHaveAttribute("href", "/welcome")
    expect(home.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(home.querySelector("img")).toBeNull()
  })

  it("has no theme switch", () => {
    render(<LandingTopBar />)
    expect(screen.queryByRole("button", { name: /switch to (dark|light) mode/i })).toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })

  it("offers Open app once signed in", () => {
    auth.value = { ...auth.value, isAuthenticated: true, did: "did:plc:alice" }
    render(<LandingTopBar />)
    expect(screen.getByRole("link", { name: /Open app/ })).toHaveAttribute("href", "/home")
    expect(screen.queryByRole("button")).toBeNull()
  })
})
