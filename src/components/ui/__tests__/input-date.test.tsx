import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import Input from "../input"

/**
 * Audit FR4: date fields showed the browser's "mm/dd/yyyy" with its own
 * calendar glyph, unlike every other control. <Input type="date"> keeps
 * the native date input (picker, keyboard, YYYY-MM-DD value) in the Input
 * frame, with a lucide calendar in the trailing slot; CSS keeps the native
 * indicator as the transparent click target under the icon.
 */
describe("Input type=date", () => {
  it("stays a native date input with a decorative calendar icon", () => {
    const onChange = vi.fn()
    render(<Input label="Founded" type="date" value="" onChange={onChange} />)
    const field = screen.getByLabelText("Founded") as HTMLInputElement
    expect(field.type).toBe("date")
    expect(field.classList.contains("input-date")).toBe(true)
    // Room for the icon, as for any trailing icon.
    expect(field.className).toContain("pr-11")

    const icon = field.parentElement!.querySelector(".input-date__icon") as HTMLElement
    expect(icon).not.toBeNull()
    expect(icon.getAttribute("aria-hidden")).toBe("true")
    expect(icon.className).toContain("pointer-events-none")
    expect(icon.querySelector("svg")).not.toBeNull()

    fireEvent.change(field, { target: { value: "2026-11-13" } })
    expect(onChange).toHaveBeenCalled()
  })

  it("marks an empty controlled field, so the format hint reads as a placeholder", () => {
    const { rerender } = render(<Input aria-label="Date" type="date" value="" onChange={() => {}} />)
    expect(screen.getByLabelText("Date")).toHaveAttribute("data-empty")
    rerender(<Input aria-label="Date" type="date" value="2026-11-13" onChange={() => {}} />)
    expect(screen.getByLabelText("Date")).not.toHaveAttribute("data-empty")
  })

  it("works flush and at size sm", () => {
    render(<Input flush size="sm" aria-label="Date" type="date" defaultValue="" />)
    const field = screen.getByLabelText("Date")
    expect(field.className).toContain("pr-9")
    expect(field.parentElement!.querySelector(".input-date__icon")).not.toBeNull()
  })

  it("leaves the trailing slot to the caller when they fill it", () => {
    render(<Input aria-label="Date" type="date" trailingIcon={<span>x</span>} />)
    const field = screen.getByLabelText("Date")
    expect(field.classList.contains("input-date")).toBe(false)
    expect(document.querySelector(".input-date__icon")).toBeNull()
  })

  it("adds nothing to other input types", () => {
    render(<Input aria-label="Name" type="text" value="" onChange={() => {}} />)
    const field = screen.getByLabelText("Name")
    expect(field.classList.contains("input-date")).toBe(false)
    expect(field).not.toHaveAttribute("data-empty")
    expect(field.parentElement!.querySelector("svg")).toBeNull()
  })
})

describe("date field CSS", () => {
  const css = readFileSync(join(__dirname, "../../../app/styles/components.css"), "utf8")
  const block = css.slice(css.indexOf("Date fields"))

  it("hides the native glyph only where the lucide icon shows, and the icon where it can't", () => {
    expect(block).toMatch(
      /@supports selector\(::-webkit-calendar-picker-indicator\) \{[\s\S]*?\.input-date::-webkit-calendar-picker-indicator \{[\s\S]*?opacity: 0;/,
    )
    expect(block).toMatch(
      /@supports not selector\(::-webkit-calendar-picker-indicator\) \{\s*\.input-date__icon \{\s*display: none;/,
    )
  })

  it("uses tokens only", () => {
    expect(block).toMatch(/\.input-date\[data-empty\]::-webkit-datetime-edit \{\s*color: var\(--fg-muted\);/)
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })
})
