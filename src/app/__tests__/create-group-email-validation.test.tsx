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
  useRegisterPageHeader: () => {},
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
  return screen.getByLabelText("Email") as HTMLInputElement
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

  it("keeps Create enabled and blocks submit with inline errors until the form is valid", async () => {
    render(<CreateGroupPage />)
    const button = getCreateButton()

    // Submit stays enabled (it only disables while creating); clicking it
    // with missing fields paints the inline errors instead.
    expect(button.disabled).toBe(false)

    const name = screen.getByLabelText("Display name") as HTMLInputElement
    const handle = screen.getByLabelText("Handle") as HTMLInputElement
    const email = getEmailInput()

    fireEvent.change(name, { target: { value: "My Test Group" } })
    fireEvent.change(handle, { target: { value: "my-group" } })
    fireEvent.change(email, { target: { value: "nope" } })
    fireEvent.submit(button.closest("form")!)

    expect(await screen.findByText("Enter a valid email address")).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement).toBe(email)
    })
  })
})

/**
 * Audit X12: New group's fields were hand-rolled 27px / 13px inputs while
 * New activity and Settings use the Input primitive. They are now the
 * primitive at its default size (h-control-md: 44px, 14px text from 800px
 * and 16px below), labelled by their visible labels; About is the Textarea
 * primitive and the display name is New activity's title field.
 */
describe("CreateGroupPage fields", () => {
  it("uses the Input primitive at its default size for every field", () => {
    render(<CreateGroupPage />)
    for (const name of ["Handle", "Email", "Website", "Founded", "Organization type"]) {
      const field = screen.getByLabelText(name) as HTMLInputElement
      expect(field.className).toContain("h-control-md")
      expect(field.className).toContain("md:text-sm")
      expect(field.className).not.toContain("cert-detail__meta-input")
    }
    expect((screen.getByLabelText("Founded") as HTMLInputElement).type).toBe("date")
  })

  it("keeps the display name as the serif title field, like New activity's title", () => {
    render(<CreateGroupPage />)
    const name = screen.getByLabelText("Display name") as HTMLInputElement
    expect(name.className).toContain("font-headline")
    expect(name.className).toContain("!text-h3")
    expect(name.className).toContain("h-control-md")
    expect(name.className).not.toContain("cert-detail__title-input")
  })

  it("shows a field's hint, and its error in place of the hint", async () => {
    render(<CreateGroupPage />)
    const email = getEmailInput()
    expect(screen.getByText("Sign-in and recovery — use an address you control.").id).toBe(
      email.getAttribute("aria-describedby"),
    )

    fireEvent.change(email, { target: { value: "bad" } })
    fireEvent.blur(email)
    const error = await screen.findByText("Enter a valid email address")
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email.getAttribute("aria-describedby")).toBe(error.closest("p")!.id)
  })
})

describe("CreateGroupPage frame and labels", () => {
  // Audit FR2: one frame for the create flows. New group sits in the
  // default container like New activity (its column capped in CSS to New
  // activity's main column), not the narrow one.
  it("uses the default page container, like New activity", () => {
    const { container } = render(<CreateGroupPage />)
    const frame = container.querySelector(".page-container") as HTMLElement
    expect(frame.className).toContain("--page-width-default")
    expect(frame.className).not.toContain("--page-width-narrow")
  })

  // Audit FR3: no other form puts icons on its labels.
  it("has no icons on its labels", () => {
    const { container } = render(<CreateGroupPage />)
    const labels = container.querySelectorAll("label, .project-detail__meta-label")
    expect(labels.length).toBeGreaterThan(0)
    labels.forEach((label) => expect(label.querySelector("svg")).toBeNull())
    expect(screen.getByText("Avatar")).toBeTruthy()
    expect(screen.getByText("Banner")).toBeTruthy()
    // About now labels its field.
    expect(screen.getByLabelText("About").tagName).toBe("TEXTAREA")
  })
})
