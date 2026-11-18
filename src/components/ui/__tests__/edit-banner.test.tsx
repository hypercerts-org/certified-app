import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import EditBanner from "../edit-banner"

// C7: the inline editor's bar uses the Button primitive (44px on phones,
// 32px from 800px), says "Save changes" like every other edit form, and
// shows its error in full (it wraps) instead of cutting it to one line.
describe("EditBanner", () => {
  it("says Save changes and Cancel, on Button primitives at sm", () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<EditBanner label="Editing profile" onSave={onSave} onCancel={onCancel} />)
    const save = screen.getByRole("button", { name: "Save changes" })
    const cancel = screen.getByRole("button", { name: "Cancel" })
    for (const button of [save, cancel]) {
      // Button size="sm": 44px below 800px, the compact height from 800px.
      expect(button.className).toContain("min-h-control-md")
      expect(button.className).toContain("md:min-h-control-compact")
    }
    fireEvent.click(save)
    fireEvent.click(cancel)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("shows the whole error, wrapping, as an alert", () => {
    const long =
      "Couldn't save your profile. Your changes are still here; try again in a moment."
    render(
      <EditBanner label="Editing profile" error={long} onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(long)
    expect(alert.className).not.toContain("truncate")
    expect(alert.className).not.toContain("whitespace-nowrap")
    expect(alert.className).not.toContain("text-ellipsis")
  })

  it("disables both buttons while saving", () => {
    render(<EditBanner label="Editing profile" isSaving onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  })
})
