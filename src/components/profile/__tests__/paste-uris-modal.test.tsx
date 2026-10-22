import React from "react"
import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

vi.mock("@/lib/atproto/did", () => ({
  resolveHandleToDid: vi.fn(async () => null),
}))

beforeAll(() => {
  // jsdom lacks <dialog>.showModal / close
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open")
  }
})

import { PasteUrisModal } from "@/components/profile/list-modals"
import { LIST_CERTS_TYPE } from "@/lib/atproto/typed-lists"

describe("PasteUrisModal", () => {
  it("reports a malformed link as a row error instead of staying stuck", async () => {
    const onAddMany = vi.fn(async () => undefined)
    render(
      <PasteUrisModal
        type={LIST_CERTS_TYPE}
        alreadyIn={new Set()}
        onAddMany={onAddMany}
        onClose={() => {}}
      />,
    )
    // Bad percent-encoding makes decodeURIComponent throw URIError.
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "https://certified.app/%zz/activity/abc" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() =>
      expect(screen.getByText("Not a link to an activity or profile")).toBeTruthy(),
    )
    expect(screen.getByRole("button", { name: "Add" }).hasAttribute("disabled")).toBe(false)
    expect(onAddMany).not.toHaveBeenCalled()
  })
})
