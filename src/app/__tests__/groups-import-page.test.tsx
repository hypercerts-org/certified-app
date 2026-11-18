import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

// WS-13: /groups/import says one thing ("Turn ... into a group") in its
// title and on its button, Cancel goes where the back link goes, and the
// app-password hint links to where one is made.

const push = vi.fn()
vi.mock("next/navigation", () => ({
  usePathname: () => "/groups/import",
  useRouter: () => ({ push }),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isLoading: false, openSignIn: vi.fn() }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ refetchOrgs: vi.fn() }),
}))

vi.mock("@/lib/groups/use-act-as-new-group", () => ({
  useActAsNewGroup: () => vi.fn(),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => {},
  useRegisterPageHeader: () => {},
}))

vi.mock("@/lib/groups/api", () => ({
  importGroup: vi.fn(),
  RegisterGroupError: class RegisterGroupError extends Error {},
}))

vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ handle: "me.certified.app" }) }),
}))

import ImportGroupPage from "../groups/import/page"

afterEach(() => {
  cleanup()
  push.mockReset()
})

describe("/groups/import", () => {
  it("uses the title's words on the submit button", () => {
    render(<ImportGroupPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Turn an account into a group" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Turn into a group" })).toBeInTheDocument()
  })

  it("Cancel goes to Groups, like the back link", () => {
    render(<ImportGroupPage />)
    expect(screen.getByRole("link", { name: /Groups/ })).toHaveAttribute("href", "/records?kind=groups")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(push).toHaveBeenCalledWith("/records?kind=groups")
  })

  it("links the app-password hint to Settings → App passwords", () => {
    render(<ImportGroupPage />)
    expect(screen.getByRole("link", { name: "Settings → App passwords" })).toHaveAttribute(
      "href",
      "/settings#app-passwords",
    )
  })
})
