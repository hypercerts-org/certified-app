import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const submit = vi.fn(async () => {})
vi.mock("../unlock-app-passwords-fields", () => ({
  useUnlockAppPasswords: () => ({
    password: "hunter22",
    setPassword: vi.fn(),
    code: "",
    setCode: vi.fn(),
    needsCode: false,
    submitting: false,
    error: null,
    invalid: false,
    invalidCode: false,
    canSubmit: true,
    submit,
  }),
  UnlockAppPasswordFields: () => null,
}))
vi.mock("@/lib/groups/org-context", () => ({ useOrg: () => ({ refetchOrgs: vi.fn() }) }))
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn(async () =>
    new Response(JSON.stringify({ handle: "ada.certified.app" }), { status: 200 }),
  ),
}))

import ImportAsGroupSection from "../import-as-group-section"

// jsdom's HTMLDialogElement has no showModal/close; <AppDialog> calls both.
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
  submit.mockClear()
})

describe("Turn into a group", () => {
  it("asks first, saying what changes and that it can be turned back", async () => {
    render(<ImportAsGroupSection did="did:plc:me" />)
    await screen.findByText("@ada.certified.app")

    fireEvent.click(screen.getByRole("button", { name: "Turn into a group" }))

    const dialog = screen.getByRole("alertdialog", { name: "Turn @ada.certified.app into a group?" })
    expect(dialog).toHaveTextContent(/turn it back into a regular account/)
    expect(submit).not.toHaveBeenCalled()
  })

  it("does nothing when cancelled", async () => {
    render(<ImportAsGroupSection did="did:plc:me" />)
    fireEvent.click(screen.getByRole("button", { name: "Turn into a group" }))

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(submit).not.toHaveBeenCalled()
  })

  it("goes ahead once confirmed", async () => {
    render(<ImportAsGroupSection did="did:plc:me" />)
    fireEvent.click(screen.getByRole("button", { name: "Turn into a group" }))

    const dialog = screen.getByRole("alertdialog")
    const confirm = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent === "Turn into a group",
    )!
    fireEvent.click(confirm)

    expect(submit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("opens with the choice: turn this account into a group, or create a new one", async () => {
    render(<ImportAsGroupSection did="did:plc:me" />)
    await screen.findByText("@ada.certified.app")

    expect(screen.getByText(/Is this account your organization.s own\?/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Create a new group" })).toHaveAttribute(
      "href",
      "/groups/create",
    )
  })

  it("offers creating a new group in the confirm dialog too", () => {
    render(<ImportAsGroupSection did="did:plc:me" />)
    fireEvent.click(screen.getByRole("button", { name: "Turn into a group" }))

    const dialog = screen.getByRole("alertdialog")
    const link = [...dialog.querySelectorAll("a")].find((a) => a.textContent === "Create a new group")
    expect(link).toHaveAttribute("href", "/groups/create")
  })
})
