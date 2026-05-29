import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react"

/**
 * quality-056 / groups-3: the Leave-Group confirmation on /groups was a
 * hand-rolled `signin-modal__backdrop` div (no focus trap / Esc /
 * scroll-lock) instead of the shared `<ConfirmDialog>` used everywhere
 * else (e.g. org-settings). Per CLAUDE.md hard rule 7, modals must go
 * through `<AppDialog>`/`<ConfirmDialog>`. This test opens the Leave
 * flow and pins that the confirmation renders as a native `<dialog>`
 * (the AppDialog chrome ConfirmDialog wraps) — NOT the bespoke backdrop
 * div — while preserving the confirm action + copy.
 *
 * GroupsPage pulls in org-context, auth, navbar, and navigation; none
 * are under test, so they're stubbed to inert defaults with a single
 * member-role group so the "Leave" button renders.
 */

const refetchOrgs = vi.fn().mockResolvedValue(undefined)

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: null,
    groups: [
      {
        groupDid: "did:plc:group1",
        handle: "acme.example.com",
        displayName: "Acme Co",
        role: "member",
        accepted: true,
        avatarUrl: undefined,
      },
    ],
    isLoading: false,
    switchOrg: vi.fn(),
    refetchOrgs,
  }),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: true }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/groups",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/lib/groups/api", () => ({
  putMembership: vi.fn().mockResolvedValue(undefined),
  deleteMembership: vi.fn().mockResolvedValue(undefined),
  removeOrgMember: vi.fn().mockResolvedValue(undefined),
}))

/**
 * jsdom's `HTMLDialogElement` doesn't implement `showModal`/`close`.
 * Polyfill enough for AppDialog's mount effect to drive the real path.
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
    this.dispatchEvent(new Event("close"))
  }
}

beforeEach(() => {
  polyfillDialog()
  cleanup()
  refetchOrgs.mockClear()
})

describe("Leave Group confirmation uses the shared ConfirmDialog", () => {
  it("renders the confirmation as a native <dialog>, not a hand-rolled backdrop", async () => {
    const { default: GroupsPage } = await import("../page")
    const { container } = render(<GroupsPage />)

    fireEvent.click(screen.getByRole("button", { name: "Leave" }))

    // ConfirmDialog -> AppDialog renders a real <dialog> with the
    // shared signin-modal app-modal chrome.
    const dialog = screen.getByRole("alertdialog", { hidden: true })
    expect(dialog.tagName).toBe("DIALOG")
    expect(dialog.getAttribute("aria-label")).toBe("Leave Group")

    // The bespoke hand-rolled backdrop must be gone.
    expect(container.querySelector(".signin-modal__backdrop")).toBeNull()
  })

  it("preserves the confirm copy and the leave action inside the dialog", async () => {
    const { default: GroupsPage } = await import("../page")
    render(<GroupsPage />)

    fireEvent.click(screen.getByRole("button", { name: "Leave" }))

    // Copy is preserved (group name + warning).
    const dialog = screen.getByRole("alertdialog", { hidden: true })
    expect(dialog.textContent).toContain("Acme Co")
    expect(dialog.textContent).toContain("lose access to this group")

    // The confirm action still lives in the dialog: clicking the
    // footer confirm button runs the leave flow (refetchOrgs is the
    // observable tail of handleLeaveOrg).
    const confirm = within(dialog).getByRole("button", { name: "Leave" })
    fireEvent.click(confirm)
    await waitFor(() => expect(refetchOrgs).toHaveBeenCalled())
  })
})
