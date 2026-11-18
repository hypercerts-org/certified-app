import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"

// WS-14: /project/new and /groups/create label every field, as /create
// does, and an empty image slot shows one affordance (the "Add image"
// pill), not a placeholder glyph as well. WS-13: /groups/create offers
// /groups/import in one quiet line.

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    did: "did:plc:me",
    isAuthenticated: true,
    isLoading: false,
    openSignIn: vi.fn(),
  }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, groups: [], isLoading: false, refetchOrgs: vi.fn() }),
}))

vi.mock("@/lib/groups/use-org-limit", () => ({
  useOrgCreationLimit: () => ({ selfCreatedCount: 0, isChecking: false, limitReached: false }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/project/new",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => {},
  useRegisterPageHeader: () => {},
}))

vi.mock("@/lib/groups/api", () => ({
  registerGroup: vi.fn(),
  RegisterGroupError: class RegisterGroupError extends Error {},
  putOrgProfile: vi.fn(),
  putOrgMetadata: vi.fn(),
  createBskyProfile: vi.fn(),
  uploadOrgBlob: vi.fn(),
  getSelfCreatedOrgCount: vi.fn(),
}))

vi.mock("@/hooks/use-own-certs", () => ({
  useOwnCerts: () => ({ ownCerts: [], isLoading: false }),
}))

vi.mock("@/components/leaflet/leaflet-editor-dynamic", () => ({
  default: () => <div data-testid="editor" />,
}))

vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}))

import CreateGroupPage from "../groups/create/page"
import NewProjectPage from "../project/new/page"

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview-url")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
})

/** An empty image slot: one button ("Add image"), whose camera is the
 *  only glyph. */
function expectOneAffordance(slot: HTMLElement) {
  expect(slot.querySelectorAll("button")).toHaveLength(1)
  expect(within(slot).getByRole("button", { name: "Add image" })).toBeInTheDocument()
  expect(slot.querySelectorAll("svg")).toHaveLength(1)
  expect(slot.querySelector("button svg")).not.toBeNull()
}

describe("/project/new", () => {
  it("labels the title and the short description on screen", () => {
    render(<NewProjectPage />)
    const title = screen.getByLabelText("Title")
    expect(title).not.toHaveAttribute("aria-label")
    expect(document.querySelector(`label[for="${title.id}"]`)).not.toBeNull()
    const summary = screen.getByLabelText("Short description (optional)")
    expect(summary).not.toHaveAttribute("aria-label")
    expect(document.querySelector(`label[for="${summary.id}"]`)).not.toBeNull()
  })

  // C5 / C11: no autofocus; the title's minimum shows once the field is
  // left with text in it (not from the first keystroke), and Publish stays
  // enabled, listing what's missing.
  it("flags the title's minimum on blur, not while typing, and never autofocuses", () => {
    const { container } = render(<NewProjectPage />)
    const title = screen.getByLabelText("Title")
    expect(document.activeElement).not.toBe(title)
    fireEvent.change(title, { target: { value: "Abc" } })
    expect(container.querySelector(".create-cert__counter--under")).toBeNull()
    expect(title).not.toHaveAttribute("aria-invalid")
    fireEvent.blur(title)
    expect(container.querySelector(".create-cert__counter--under")).not.toBeNull()
    expect(title).toHaveAttribute("aria-invalid", "true")
  })

  it("keeps Publish enabled and lists what's missing on a click", async () => {
    render(<NewProjectPage />)
    const publish = screen.getByRole("button", { name: "Publish project" })
    expect(publish).not.toBeDisabled()
    fireEvent.click(publish)
    expect(
      await screen.findByText("Before publishing: the title needs at least 5 characters."),
    ).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByLabelText("Title"))
  })

  it("shows one Add image affordance in the empty banner", () => {
    const { container } = render(<NewProjectPage />)
    expectOneAffordance(container.querySelector(".create-project__hero") as HTMLElement)
  })
})

describe("/groups/create", () => {
  it("labels the display name on screen", () => {
    render(<CreateGroupPage />)
    const name = screen.getByLabelText("Display name")
    expect(name).not.toHaveAttribute("aria-label")
    expect(document.querySelector(`label[for="${name.id}"]`)).not.toBeNull()
  })

  it("shows one Add image affordance in the empty avatar and banner", () => {
    const { container } = render(<CreateGroupPage />)
    expectOneAffordance(container.querySelector(".create-group__avatar-tile") as HTMLElement)
    expectOneAffordance(container.querySelector(".create-group__banner-tile") as HTMLElement)
  })

  it("offers turning an existing account into a group, in one line", () => {
    render(<CreateGroupPage />)
    const line = screen.getByText(/Already have an account to turn into a group\?/)
    expect(within(line).getByRole("link", { name: "Use that account" })).toHaveAttribute(
      "href",
      "/groups/import",
    )
  })
})
