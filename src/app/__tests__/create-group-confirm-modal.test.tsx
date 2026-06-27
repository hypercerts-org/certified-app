import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// Mirrors create-group-email-validation.test.tsx exactly: CreateGroupPage
// pulls in auth/org contexts, next/navigation, navbar title, the
// org-creation-limit hook, and the blob/profile group API. Stub everything
// that isn't under test so the authenticated form mounts, then drive the
// "Create group" → ConfirmDialog → confirm flow. The difference from the
// validation suite is that here `registerGroup` is asserted on, so we keep
// a handle to the spy.

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

// The group write API is only touched on confirm. Keep `registerGroup` a spy
// we can assert on; it resolves with a groupDid so doCreate's downstream
// (best-effort) calls don't throw before we observe the call.
vi.mock("@/lib/groups/api", () => ({
  registerGroup: vi.fn(async () => ({ groupDid: "did:plc:newgroup" })),
  RegisterGroupError: class RegisterGroupError extends Error {},
  putOrgProfile: vi.fn(),
  putOrgMetadata: vi.fn(),
  createBskyProfile: vi.fn(),
  uploadOrgBlob: vi.fn(),
  getSelfCreatedOrgCount: vi.fn(),
}))

import CreateGroupPage from "../groups/create/page"
import { registerGroup } from "@/lib/groups/api"

/**
 * jsdom's `HTMLDialogElement` doesn't ship `showModal`/`close` by default.
 * Polyfill enough for ConfirmDialog (via AppDialog) to mount + drive.
 */
function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
    __polyfilled?: boolean
  }
  if (proto.__polyfilled) return
  proto.__polyfilled = true
  proto.showModal = function () {
    ;(this as unknown as { open: boolean }).open = true
  }
  proto.close = function () {
    ;(this as unknown as { open: boolean }).open = false
    ;(this as unknown as HTMLDialogElement).dispatchEvent(new Event("close"))
  }
}

beforeEach(() => {
  cleanup()
  polyfillDialog()
  // jsdom doesn't implement object URLs — stub so the image picker logic runs.
  URL.createObjectURL = vi.fn(() => "blob:preview-url")
  URL.revokeObjectURL = vi.fn()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

const VALID_NAME = "My Test Group"
const VALID_HANDLE = "my-group"
const VALID_EMAIL = "group@example.com"

function fillValidForm() {
  const name = screen.getByLabelText("Display name") as HTMLInputElement
  const handle = screen.getByLabelText("Handle") as HTMLInputElement
  const email = screen.getByLabelText("Group email") as HTMLInputElement

  fireEvent.change(name, { target: { value: VALID_NAME } })
  fireEvent.change(handle, { target: { value: VALID_HANDLE } })
  fireEvent.change(email, { target: { value: VALID_EMAIL } })
}

// The page's primary submit button (the one in the form actions). Once the
// dialog is open there are TWO "Create group" buttons; this one is the form
// submit, so target it via the actions before opening the dialog.
function getSubmitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /create group/i }) as HTMLButtonElement
}

describe("CreateGroupPage create-group confirmation modal", () => {
  it("opens a ConfirmDialog showing the email and does NOT call registerGroup yet", async () => {
    render(<CreateGroupPage />)
    fillValidForm()

    fireEvent.click(getSubmitButton())

    // An alertdialog appears with the entered email in its message.
    const dialog = await screen.findByRole("alertdialog", { hidden: true })
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain(VALID_EMAIL)

    // Validation + open only — no creation yet.
    expect(registerGroup).not.toHaveBeenCalled()
  })

  it("Back/cancel closes the dialog without calling registerGroup", async () => {
    render(<CreateGroupPage />)
    fillValidForm()
    fireEvent.click(getSubmitButton())

    const dialog = await screen.findByRole("alertdialog", { hidden: true })
    expect(dialog).toBeTruthy()

    const back = screen.getByRole("button", { name: /^back$/i })
    fireEvent.click(back)

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog", { hidden: true })).toBeNull()
    })
    expect(registerGroup).not.toHaveBeenCalled()
  })

  it("confirming calls registerGroup with the handle, did, and trimmed email", async () => {
    render(<CreateGroupPage />)
    const email = screen.getByLabelText("Group email") as HTMLInputElement
    const name = screen.getByLabelText("Display name") as HTMLInputElement
    const handle = screen.getByLabelText("Handle") as HTMLInputElement

    fireEvent.change(name, { target: { value: VALID_NAME } })
    fireEvent.change(handle, { target: { value: VALID_HANDLE } })
    // Pad the email so we can assert it's trimmed before registerGroup.
    fireEvent.change(email, { target: { value: `  ${VALID_EMAIL}  ` } })

    fireEvent.click(getSubmitButton())

    const dialog = await screen.findByRole("alertdialog", { hidden: true })
    // The dialog's confirm button is also labelled "Create group"; click the
    // one inside the dialog.
    const confirm = Array.from(
      dialog.querySelectorAll("button"),
    ).find((b) => /create group/i.test(b.textContent ?? "")) as HTMLButtonElement
    expect(confirm).toBeTruthy()

    fireEvent.click(confirm)

    await waitFor(() => {
      expect(registerGroup).toHaveBeenCalledTimes(1)
    })
    expect(registerGroup).toHaveBeenCalledWith(
      VALID_HANDLE,
      "did:plc:me",
      VALID_EMAIL,
    )
  })
})
