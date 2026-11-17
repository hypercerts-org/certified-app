import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react"

const state = vi.hoisted(() => ({ pathname: "/feed" }))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}))

// The global search has its own tests: here a field, results that show
// once you type (a listbox), and a row that navigates.
vi.mock("@/components/search/global-search", async () => {
  const { useState } = await import("react")
  return {
    default: function FakeSearch({ onNavigate }: { onNavigate?: () => void }) {
      const [q, setQ] = useState("")
      return (
        <div role="search">
          <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          {q ? (
            <ul role="listbox">
              <li role="option" aria-selected={false} onMouseDown={() => onNavigate?.()}>
                Mangrove replanting
              </li>
            </ul>
          ) : null}
        </div>
      )
    },
  }
})

import PhoneSearch from "../phone-search"

// jsdom has no <dialog> modal support.
function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as unknown as { __polyfilled?: boolean } & HTMLDialogElement
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
  polyfillDialog()
  state.pathname = "/feed"
})

afterEach(() => cleanup())

function open() {
  const trigger = screen.getByRole("button", { name: "Search" })
  fireEvent.click(trigger)
  return { trigger, dialog: screen.getByRole("dialog", { name: "Search" }) }
}

describe("PhoneSearch", () => {
  it("is an icon button that says it opens a dialog", () => {
    render(<PhoneSearch />)
    const trigger = screen.getByRole("button", { name: "Search" })
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens the search in a panel, its field focused", () => {
    // jsdom lays nothing out; the dialog focuses only what is on screen.
    const rects = vi
      .spyOn(Element.prototype, "getClientRects")
      .mockReturnValue([{}] as unknown as DOMRectList)
    render(<PhoneSearch />)
    const { trigger, dialog } = open()
    expect(dialog).toHaveClass("phone-search")
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(within(dialog).getByRole("textbox", { name: "Search" })).toHaveFocus()
    rects.mockRestore()
  })

  it("closes with its close button", () => {
    render(<PhoneSearch />)
    const { dialog } = open()
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes on Escape, after the results when they are open", () => {
    render(<PhoneSearch />)
    const { dialog } = open()
    const field = within(dialog).getByRole("textbox", { name: "Search" })
    fireEvent.change(field, { target: { value: "mangrove" } })
    expect(within(dialog).getByRole("listbox")).toBeInTheDocument()
    // The results are open: this Escape is the field's.
    fireEvent.keyDown(field, { key: "Escape" })
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument()
    fireEvent.change(field, { target: { value: "" } })
    fireEvent.keyDown(field, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes when a result opens", () => {
    render(<PhoneSearch />)
    const { dialog } = open()
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search" }), {
      target: { value: "mangrove" },
    })
    fireEvent.mouseDown(within(dialog).getByRole("option", { name: "Mangrove replanting" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes when the page changes", () => {
    const { rerender } = render(<PhoneSearch />)
    open()
    state.pathname = "/explore"
    rerender(<PhoneSearch />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
