import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import BottomSheet from "../bottom-sheet"
import { AppDialogHeader } from "../app-dialog"

// Phones: a sheet's and a dialog's Close is a full 44px button (its X kept
// in place by negative margins), and a `tall` sheet (the account sheet)
// opens at the 92vh cap so its whole menu shows, instead of a 70vh peek.

afterEach(() => {
  cleanup()
})

const PHONE_44 = ["max-[799px]:h-control-md", "max-[799px]:w-11"]

describe("BottomSheet", () => {
  it("caps a sheet at 70vh until it is dragged up", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Account">
        <p>Body</p>
      </BottomSheet>,
    )
    const sheet = screen.getByRole("dialog", { name: "Account" })
    expect(sheet).toHaveClass("max-[799px]:max-h-[70vh]")
    expect(sheet).not.toHaveClass("max-[799px]:max-h-[92vh]")
  })

  it("opens a tall sheet at the 92vh cap", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Account" tall>
        <p>Body</p>
      </BottomSheet>,
    )
    const sheet = screen.getByRole("dialog", { name: "Account" })
    expect(sheet).toHaveClass("max-[799px]:max-h-[92vh]")
    expect(sheet).not.toHaveClass("max-[799px]:max-h-[70vh]")
  })

  it("makes its Close 44px on phones", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Account">
        <p>Body</p>
      </BottomSheet>,
    )
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(...PHONE_44)
  })
})

describe("AppDialogHeader", () => {
  it("makes its Close 44px on phones, titled or bare", () => {
    const { rerender } = render(<AppDialogHeader title="Filters" onClose={() => {}} />)
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(...PHONE_44)
    rerender(<AppDialogHeader title="" bare onClose={() => {}} />)
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(...PHONE_44)
  })
})
