import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

/**
 * The owner's last section holds "Turn back into a regular account": a
 * reversible change that deletes nothing, so it's "Group status" (not a
 * "Danger zone" with a warning shield), and its confirm states the outcome
 * without a type-the-handle gate.
 */

const destroyGroup = vi.fn(async () => {})

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/settings",
}))
vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("@/lib/navbar-context", () => ({ useRegisterPageHeader: () => {} }))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:owner", pdsUrl: null }),
}))
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ email: null }) }))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, switchOrg: vi.fn(), refetchOrgs: vi.fn() }),
}))
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn(async () => new Response("{}", { status: 404 })),
}))
vi.mock("@/hooks/use-author-info", () => ({ useAuthorInfo: () => ({ info: null }) }))
vi.mock("@/lib/groups/api", () => ({
  listOrgMembers: vi.fn(async () => []),
  addOrgMember: vi.fn(),
  removeOrgMember: vi.fn(),
  setOrgMemberRole: vi.fn(),
  queryOrgAuditLog: vi.fn(async () => []),
  destroyGroup: () => destroyGroup(),
  getOwnershipTransfer: vi.fn(async () => null),
  proposeOwnershipTransfer: vi.fn(),
  acceptOwnershipTransfer: vi.fn(),
  cancelOwnershipTransfer: vi.fn(),
}))
vi.mock("@/components/groups/group-password-reset", () => ({ default: () => null }))
vi.mock("@/components/groups/group-account-manager", () => ({ default: () => null }))
vi.mock("@/components/settings/sync-social-graph-section", () => ({ default: () => null }))
vi.mock("@/components/groups/handle-search", () => ({ default: () => null }))
vi.mock("@/components/account/did-section", () => ({ default: () => null }))

import OrgSettings from "../org-settings"

const ORG = {
  groupDid: "did:plc:group",
  handle: "estuary.certified.app",
  displayName: "Estuary",
  role: "owner" as const,
  accepted: true,
}

beforeEach(() => {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
  }
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  proto.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
  destroyGroup.mockClear()
  window.location.hash = "#status"
})
afterEach(() => {
  cleanup()
  window.location.hash = ""
})

describe("OrgSettings: Group status", () => {
  it("calls the section Group status, not Danger zone", () => {
    render(<OrgSettings groupDid={ORG.groupDid} org={ORG} />)

    expect(screen.getByRole("tab", { name: "Group status" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText(/Danger zone/)).toBeNull()
  })

  it("still opens it from an old #danger link", () => {
    window.location.hash = "#danger"
    render(<OrgSettings groupDid={ORG.groupDid} org={ORG} />)

    expect(screen.getByRole("tab", { name: "Group status" })).toHaveAttribute("aria-selected", "true")
  })

  it("confirms the outcome without a type-the-handle gate, and turns back on 'Turn back'", async () => {
    render(<OrgSettings groupDid={ORG.groupDid} org={ORG} />)

    fireEvent.click(screen.getByRole("button", { name: "Turn back into a regular account" }))

    const dialog = screen.getByRole("alertdialog", {
      name: "Turn @estuary.certified.app back into a regular account?",
    })
    expect(dialog).toHaveTextContent(/you can make it a group again later/)
    expect(dialog.querySelector("input")).toBeNull()
    const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Turn back")!
    expect(confirm).toBeEnabled()

    fireEvent.click(confirm)
    await waitFor(() => expect(destroyGroup).toHaveBeenCalledTimes(1))
  })
})
