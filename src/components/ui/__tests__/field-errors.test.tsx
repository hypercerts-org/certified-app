import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { useState } from "react"
import Input from "../input"
import Textarea from "../textarea"
import Select from "../select"

// C1: a field in error draws its border in --color-error at full strength
// (the 22% tint was about 1.5:1 against the page) and keeps it on focus,
// with the --shadow-ring-error halo instead of the accent focus colour.
// A caller's aria-describedby is merged with the field's own ids.

const ERROR_BORDER = "border-[var(--color-error)]"
// The `shadow:` hint makes Tailwind emit a box-shadow; a bare var() would
// compile to a shadow colour and draw nothing.
const ERROR_FOCUS = "focus:shadow-[shadow:var(--shadow-ring-error)]"
const ERROR_FOCUS_BORDER = "focus:border-[var(--color-error)]"

describe("field error chrome", () => {
  it("Input: solid error border, kept on focus with the error ring", () => {
    render(<Input label="Name" error="Add a name." />)
    const field = screen.getByLabelText("Name")
    expect(field.className).toContain(ERROR_BORDER)
    expect(field.className).toContain(ERROR_FOCUS_BORDER)
    expect(field.className).toContain(ERROR_FOCUS)
    expect(field.className).not.toContain("--color-error-border")
    expect(field.className).not.toContain("focus:border-[var(--focus-ring)]")
  })

  it("Input: a caller's aria-invalid draws the same chrome (flush fields)", () => {
    render(<Input flush aria-label="Title" aria-invalid />)
    const field = screen.getByLabelText("Title")
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field.className).toContain(ERROR_BORDER)
  })

  it("Input: no error chrome when valid", () => {
    render(<Input label="Name" />)
    const field = screen.getByLabelText("Name")
    expect(field.className).not.toContain(ERROR_BORDER)
    expect(field).not.toHaveAttribute("aria-invalid")
  })

  it("Textarea and Select: the same error chrome", () => {
    render(
      <>
        <Textarea label="About" error="Too long." />
        <Select label="Kind" error="Pick one.">
          <option>One</option>
        </Select>
      </>,
    )
    for (const name of ["About", "Kind"]) {
      const field = screen.getByLabelText(name)
      expect(field.className).toContain(ERROR_BORDER)
      expect(field.className).toContain(ERROR_FOCUS)
      expect(field.className).not.toContain("--color-error-border")
    }
  })
})

describe("aria-describedby is merged, not replaced", () => {
  it("Input keeps its error and adds the caller's id", () => {
    render(
      <>
        <Input label="Handle" error="Taken." aria-describedby="hint" />
        <p id="hint">Lowercase letters.</p>
      </>,
    )
    const field = screen.getByLabelText("Handle")
    const ids = field.getAttribute("aria-describedby")!.split(" ")
    expect(ids).toContain("hint")
    expect(ids).toContain(screen.getByText("Taken.").closest("p")!.id)
  })

  it("Input keeps its helper and adds the caller's id", () => {
    render(<Input label="Email" helperText="For sign-in." aria-describedby="more" />)
    const ids = screen.getByLabelText("Email").getAttribute("aria-describedby")!.split(" ")
    expect(ids).toEqual([screen.getByText("For sign-in.").id, "more"])
  })

  it("Textarea keeps its counter and adds the caller's id", () => {
    render(<Textarea label="Note" showCount maxLength={50} aria-describedby="extra" />)
    const ids = screen.getByLabelText("Note").getAttribute("aria-describedby")!.split(" ")
    expect(ids).toHaveLength(2)
    expect(ids).toContain("extra")
  })

  it("Select keeps its error and adds the caller's id", () => {
    render(
      <Select label="List" error="Pick a list." aria-describedby="why">
        <option>One</option>
      </Select>,
    )
    const ids = screen.getByLabelText("List").getAttribute("aria-describedby")!.split(" ")
    expect(ids).toContain("why")
    expect(ids).toHaveLength(2)
  })
})

// C8: the counter isn't a live region announcing every keystroke; a quiet
// live line speaks only near the limit.
describe("Textarea counter", () => {
  function Counted() {
    const [value, setValue] = useState("")
    return (
      <Textarea
        label="Summary"
        showCount
        maxLength={300}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    )
  }

  it("is read with the field, and announces only near the limit", () => {
    const { container } = render(<Counted />)
    const field = screen.getByLabelText("Summary")
    const counter = screen.getByText("0 / 300")
    expect(counter).not.toHaveAttribute("aria-live")
    expect(field.getAttribute("aria-describedby")).toContain(counter.id)

    const live = container.querySelector("[aria-live]")!
    fireEvent.change(field, { target: { value: "a".repeat(100) } })
    expect(live).toHaveTextContent("")

    fireEvent.change(field, { target: { value: "a".repeat(285) } })
    expect(live).toHaveTextContent("15 characters left")

    fireEvent.change(field, { target: { value: "a".repeat(299) } })
    expect(live).toHaveTextContent("1 character left")
  })
})
