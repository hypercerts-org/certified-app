import { describe, it, expect, vi, afterEach } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { Popover, PopoverTrigger, PopoverContent, PopoverItem } from "../popover"
import AppDialog from "../app-dialog"

/**
 * Keyboard contract for a portaled menu (the account menu, New, row menus):
 * opening it moves focus to the first item, arrows rove, Tab closes it and
 * hands focus back to the trigger, and activating an item returns focus to
 * the trigger instead of dropping it on <body>.
 *
 * jsdom happily focuses a `visibility: hidden` node, so the regression this
 * guards (focusing the menu while it was still parked hidden before its
 * first measurement) is checked by recording the menu's visibility at the
 * moment focus lands.
 */

function Menu({ onPick = () => {} }: { onPick?: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button">Before</button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <button type="button">Open menu</button>
        </PopoverTrigger>
        <PopoverContent portal aria-label="Things">
          {["One", "Two", "Three"].map((label) => (
            <PopoverItem
              key={label}
              onClick={() => {
                setOpen(false)
                onPick(label)
              }}
            >
              {label}
            </PopoverItem>
          ))}
        </PopoverContent>
      </Popover>
      <button type="button">After</button>
    </div>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Popover (portal) keyboard", () => {
  it("focuses the first item once the menu is visible, and arrows rove", () => {
    // Record the menu's visibility each time an item takes focus.
    const visibilityAtFocus: string[] = []
    const realFocus = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      const menu = this.closest('[role="menu"]') as HTMLElement | null
      if (menu) visibilityAtFocus.push(menu.style.visibility)
      return realFocus.call(this, options)
    })

    render(<Menu />)
    const trigger = screen.getByRole("button", { name: "Open menu" })
    trigger.focus()
    // Enter on a native button fires click.
    fireEvent.click(trigger)

    const menu = screen.getByRole("menu", { name: "Things" })
    expect(menu.style.visibility).not.toBe("hidden")
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "One" }))
    // Focus never landed while the menu was still parked hidden.
    expect(visibilityAtFocus).not.toContain("hidden")

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Two" }))
    fireEvent.keyDown(document.activeElement as Element, { key: "End" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Three" }))
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "One" }))
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Three" }))
  })

  it("closes on Tab and returns focus to the trigger", () => {
    render(<Menu />)
    const trigger = screen.getByRole("button", { name: "Open menu" })
    fireEvent.click(trigger)
    expect(screen.getByRole("menu")).toBeTruthy()

    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("closes on Escape and returns focus to the trigger", () => {
    render(<Menu />)
    const trigger = screen.getByRole("button", { name: "Open menu" })
    fireEvent.click(trigger)
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("returns focus to the trigger after an item is chosen", () => {
    const onPick = vi.fn()
    render(<Menu onPick={onPick} />)
    const trigger = screen.getByRole("button", { name: "Open menu" })
    fireEvent.click(trigger)
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" })
    act(() => {
      ;(document.activeElement as HTMLElement).click()
    })
    expect(onPick).toHaveBeenCalledWith("Two")
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe("Menu item that opens a dialog", () => {
  // jsdom has no <dialog> modal support; stub showModal/close so AppDialog
  // mounts.
  function stubDialog() {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "")
    }
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open")
    }
  }

  function MenuWithDialog() {
    const [open, setOpen] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    return (
      <div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger>
            <button type="button">Actions</button>
          </PopoverTrigger>
          <PopoverContent portal aria-label="Actions menu">
            <PopoverItem
              onClick={() => {
                setOpen(false)
                setDialogOpen(true)
              }}
            >
              Delete
            </PopoverItem>
          </PopoverContent>
        </Popover>
        {dialogOpen ? (
          <AppDialog ariaLabel="Delete?" onClose={() => setDialogOpen(false)}>
            <button type="button" onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
          </AppDialog>
        ) : null}
      </div>
    )
  }

  it("lands back on the menu trigger when the dialog closes", () => {
    stubDialog()
    render(<MenuWithDialog />)
    const trigger = screen.getByRole("button", { name: "Actions" })
    fireEvent.click(trigger)
    act(() => {
      ;(document.activeElement as HTMLElement).click()
    })
    const cancel = screen.getByRole("button", { name: "Cancel", hidden: true })
    act(() => {
      cancel.focus()
      cancel.click()
    })
    expect(document.activeElement).toBe(trigger)
  })
})
