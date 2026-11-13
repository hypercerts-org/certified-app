import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

/**
 * The endorse dialog's fields are the Textarea / Select primitives: a
 * short label that fits the dialog and no placeholder repeating
 * "optional" (DL1-DL3).
 */

beforeAll(() => {
  // jsdom lacks <dialog>.showModal / close
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open")
  }
})

import EndorseReasonModal from "../endorse-reason-modal"

const LISTS = [
  { rkey: "3list-a", title: "Partners" },
  { rkey: "3list-b", title: "Grantees" },
]

describe("EndorseReasonModal", () => {
  it("labels the note briefly, with no placeholder", () => {
    render(
      <EndorseReasonModal subjectLabel="Alice" onConfirm={async () => {}} onClose={() => {}} />,
    )
    const note = screen.getByRole("textbox", { name: "Why do you endorse them? (optional)" })
    expect(note).not.toHaveAttribute("placeholder")
    expect(note).toHaveAccessibleDescription("500 characters left")
    expect(screen.queryByText(/Briefly explain/)).toBeNull()
  })

  it("passes the note and the chosen list to onConfirm", async () => {
    const onConfirm = vi.fn(async () => {})
    render(
      <EndorseReasonModal
        subjectLabel="Alice"
        lists={LISTS}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    )
    const note = screen.getByRole("textbox", { name: "Why do you endorse them? (optional)" })
    fireEvent.change(note, { target: { value: "We fund them" } })
    expect(note).toHaveAccessibleDescription("488 characters left")

    const list = screen.getByRole("combobox", { name: "Add to a list (optional)" })
    expect(list).toHaveValue("")
    expect(
      Array.from((list as HTMLSelectElement).options).map((o) => o.textContent),
    ).toEqual(["None", "Partners", "Grantees"])
    fireEvent.change(list, { target: { value: "3list-b" } })

    fireEvent.click(screen.getByRole("button", { name: "Endorse" }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("We fund them", "3list-b"))
  })

  it("sends a null list when None stays selected", async () => {
    const onConfirm = vi.fn(async () => {})
    render(
      <EndorseReasonModal
        subjectLabel="Alice"
        lists={LISTS}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Endorse" }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("", null))
  })

  it("hides the list picker while acting as a group", () => {
    render(
      <EndorseReasonModal
        subjectLabel="Alice"
        lists={LISTS}
        actingAs={{
          orgName: "Acme",
          orgHandle: "acme.example.com",
          operatorHandle: "bob.example.com",
          operatorRole: "admin",
        }}
        onConfirm={async () => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByRole("combobox")).toBeNull()
  })
})
