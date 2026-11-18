import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ openSignInModal: vi.fn(), openSignIn: vi.fn() }),
}))

import HeroCta from "../hero-cta"

describe("HeroCta", () => {
  it("offers a way into the network beside sign-in in the hero", () => {
    render(<HeroCta explore />)

    expect(screen.getByRole("button", { name: "Sign in with your email" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create your account" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Explore the network" })).toHaveAttribute(
      "href",
      "/explore",
    )
  })

  it("marks the way into the network as in-app: no outward arrow", () => {
    render(<HeroCta explore />)

    expect(screen.getByRole("link", { name: "Explore the network" }).querySelector("svg")).toBeNull()
  })

  it("keeps the closing section to the two buttons", () => {
    render(<HeroCta />)

    expect(screen.queryByRole("link", { name: "Explore the network" })).toBeNull()
  })
})
