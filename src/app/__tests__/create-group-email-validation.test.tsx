import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// CreateGroupPage (groups/create) pulls in auth/org contexts,
// next/navigation, navbar title, the org-creation-limit hook, and the
// blob/profile group API. Stub everything that isn't under test so the
// authenticated form mounts, then drive the Email field's validation.

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    did: "did:plc:me",
    isAuthenticated: true,
    isLoading: false,
    openSignIn: vi.fn(),
  }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: null,
    groups: [],
    isLoading: false,
    refetchOrgs: vi.fn(),
  }),
}))

// Bypass the limit hook's network effect — render straight into the form
// (not the spinner / "limit reached" state).
vi.mock("@/lib/groups/use-org-limit", () => ({
  useOrgCreationLimit: () => ({
    selfCreatedCount: 0,
    isChecking: false,
    limitReached: false,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => {},
}))

// The group write API is only touched on submit; keep it inert so an
// accidental submit can't hit the network.
vi.mock("@/lib/groups/api", () => ({
  registerGroup: vi.fn(),
  RegisterGroupError: class RegisterGroupError extends Error {},
  putOrgProfile: vi.fn(),
  putOrgMetadata: vi.fn(),
  createBskyProfile: vi.fn(),
  uploadOrgBlob: vi.fn(),
  getSelfCreatedOrgCount: vi.fn(),
}))

import CreateGroupPage from "../groups/create/page"

beforeEach(() => {
  cleanup()
  // jsdom doesn't implement object URLs — stub so the image picker logic runs.
  URL.createObjectURL = vi.fn(() => "blob:preview-url")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function getEmailInput(): HTMLInputElement {
  return screen.getByLabelText("Group email") as HTMLInputElement
}

function getCreateButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /create group/i })
}

describe("CreateGroupPage email validation", () => {
  it("renders an Email field", () => {
    render(<CreateGroupPage />)
    expect(getEmailInput()).toBeTruthy()
  })

  it("shows 'Enter a valid email address' for an invalid email on blur", async () => {
    render(<CreateGroupPage />)
    const email = getEmailInput()

    fireEvent.change(email, { target: { value: "not-an-email" } })
    fireEvent.blur(email)

    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeTruthy()
  })

  it("clears the error once a valid email is entered", async () => {
    render(<CreateGroupPage />)
    const email = getEmailInput()

    // First make it invalid so the error is showing.
    fireEvent.change(email, { target: { value: "bad" } })
    fireEvent.blur(email)
    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeTruthy()

    // Typing a valid address re-validates (because emailError is set) and clears it.
    fireEvent.change(email, { target: { value: "group@example.com" } })

    await waitFor(() => {
      expect(
        screen.queryByText("Enter a valid email address"),
      ).toBeNull()
    })
  })

  it("shows the required error when blurred empty", async () => {
    render(<CreateGroupPage />)
    const email = getEmailInput()

    fireEvent.change(email, { target: { value: " " } })
    fireEvent.blur(email)

    expect(await screen.findByText("Email is required")).toBeTruthy()
  })

  it("keeps the Create button disabled until name + handle + a valid email are present", async () => {
    render(<CreateGroupPage />)
    const button = getCreateButton()

    // Nothing filled in → disabled.
    expect(button.disabled).toBe(true)

    const name = screen.getByLabelText("Display name") as HTMLInputElement
    const handle = screen.getByLabelText("Handle") as HTMLInputElement
    const email = getEmailInput()

    // Name + handle only, still no email → disabled.
    fireEvent.change(name, { target: { value: "My Test Group" } })
    fireEvent.change(handle, { target: { value: "my-group" } })
    expect(button.disabled).toBe(true)

    // Add an INVALID email → blur sets emailError → still disabled.
    fireEvent.change(email, { target: { value: "nope" } })
    fireEvent.blur(email)
    await screen.findByText("Enter a valid email address")
    expect(button.disabled).toBe(true)

    // Correct it to a valid email → error clears → button enabled.
    fireEvent.change(email, { target: { value: "group@example.com" } })
    await waitFor(() => {
      expect(button.disabled).toBe(false)
    })
  })
})
