import { describe, it, expect, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"
import SegmentedControl, { ToggleGroup } from "../segmented-control"

afterEach(() => {
  cleanup()
})

describe("SegmentedControl (single-select)", () => {
  it("renders a radiogroup with one radio per option and marks the selected one", () => {
    const { container, getByRole } = render(
      <SegmentedControl
        aria-label="View"
        value="list"
        options={[
          { value: "list", label: "List" },
          { value: "gallery", label: "Gallery" },
        ]}
      />,
    )
    expect(getByRole("radiogroup").getAttribute("aria-label")).toBe("View")
    const radios = container.querySelectorAll('[role="radio"]')
    expect(radios.length).toBe(2)
    expect(radios[0].getAttribute("aria-checked")).toBe("true")
    expect(radios[1].getAttribute("aria-checked")).toBe("false")
  })

  it("fires onValueChange with the clicked value (and not when re-clicking the active one)", () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <SegmentedControl
        aria-label="View"
        value="list"
        onValueChange={onValueChange}
        options={[
          { value: "list", label: "List" },
          { value: "gallery", label: "Gallery" },
        ]}
      />,
    )
    const radios = container.querySelectorAll('[role="radio"]')
    fireEvent.click(radios[1])
    expect(onValueChange).toHaveBeenCalledWith("gallery")
    onValueChange.mockClear()
    // Re-clicking the already-selected option is a no-op (RadioGroup guards it).
    fireEvent.click(radios[0])
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("uses ariaLabel for icon-only segments (no visible label)", () => {
    const { container } = render(
      <SegmentedControl
        aria-label="View"
        value="list"
        iconOnly
        options={[
          { value: "list", ariaLabel: "List view", icon: <svg /> },
          { value: "gallery", ariaLabel: "Gallery view", icon: <svg /> },
        ]}
      />,
    )
    const radios = container.querySelectorAll('[role="radio"]')
    expect(radios[0].getAttribute("aria-label")).toBe("List view")
    expect(radios[1].getAttribute("aria-label")).toBe("Gallery view")
  })

  it("applies the joined container border + overflow-hidden and an inset focus offset", () => {
    const { getByRole, container } = render(
      <SegmentedControl
        aria-label="View"
        value="a"
        joined
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    )
    const group = getByRole("radiogroup")
    expect(group.className).toContain("overflow-hidden")
    expect(group.className).toContain("border-[var(--border-default)]")
    const radios = container.querySelectorAll('[role="radio"]')
    // Inset (negative) offset so the focus ring isn't clipped by overflow-hidden.
    expect(radios[0].className).toContain("focus-visible:-outline-offset-2")
    // First segment has no left divider; the second does.
    expect(radios[0].className).not.toContain("border-l")
    expect(radios[1].className).toContain("border-l")
  })

  it("resolves the forwarded ref to the radiogroup root node", () => {
    const ref = { current: null as HTMLDivElement | null }
    render(
      <SegmentedControl
        ref={ref}
        aria-label="View"
        value="a"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    )
    expect(ref.current).not.toBeNull()
    expect(ref.current?.getAttribute("role")).toBe("radiogroup")
  })

  it("disables a segment when the option is disabled", () => {
    const { container } = render(
      <SegmentedControl
        aria-label="View"
        value="a"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B", disabled: true },
        ]}
      />,
    )
    const radios = container.querySelectorAll('[role="radio"]')
    expect((radios[1] as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("ToggleGroup (multi-select)", () => {
  it("renders role=group with aria-pressed buttons reflecting the value set", () => {
    const { getByRole, container } = render(
      <ToggleGroup
        aria-label="Rings"
        value={["1", "3"]}
        options={[
          { value: "1", label: "1st" },
          { value: "2", label: "2nd" },
          { value: "3", label: "3rd" },
        ]}
      />,
    )
    expect(getByRole("group").getAttribute("aria-label")).toBe("Rings")
    const btns = container.querySelectorAll("button")
    expect(btns[0].getAttribute("aria-pressed")).toBe("true")
    expect(btns[1].getAttribute("aria-pressed")).toBe("false")
    expect(btns[2].getAttribute("aria-pressed")).toBe("true")
  })

  it("adds a value when toggling an unpressed option, preserving option order", () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <ToggleGroup
        aria-label="Rings"
        value={["1"]}
        onValueChange={onValueChange}
        options={[
          { value: "1", label: "1st" },
          { value: "2", label: "2nd" },
          { value: "3", label: "3rd" },
        ]}
      />,
    )
    const btns = container.querySelectorAll("button")
    fireEvent.click(btns[2])
    expect(onValueChange).toHaveBeenCalledWith(["1", "3"])
  })

  it("removes a value when toggling a pressed option (allowing the empty set)", () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <ToggleGroup
        aria-label="Rings"
        value={["2"]}
        onValueChange={onValueChange}
        options={[
          { value: "1", label: "1st" },
          { value: "2", label: "2nd" },
        ]}
      />,
    )
    const btns = container.querySelectorAll("button")
    fireEvent.click(btns[1])
    expect(onValueChange).toHaveBeenCalledWith([])
  })

  it("applies semantic tone classes per-option for the active state", () => {
    const { container } = render(
      <ToggleGroup
        aria-label="Response"
        value={["accept", "reject"]}
        iconOnly
        options={[
          { value: "accept", tone: "success", ariaLabel: "Accept", icon: <svg /> },
          { value: "reject", tone: "warn", ariaLabel: "Reject", icon: <svg /> },
        ]}
      />,
    )
    const btns = container.querySelectorAll("button")
    // Success uses the green success tokens; reject uses the AMBER warning
    // tokens (NOT error/red).
    expect(btns[0].className).toContain("bg-[var(--color-success-bg)]")
    expect(btns[0].className).toContain("text-[var(--color-success-text)]")
    expect(btns[1].className).toContain("bg-[var(--color-warning-bg)]")
    expect(btns[1].className).toContain("text-[var(--color-warning-text)]")
  })

  it("does not apply tone classes to an unpressed toned option", () => {
    const { container } = render(
      <ToggleGroup
        aria-label="Response"
        value={[]}
        iconOnly
        options={[
          { value: "accept", tone: "success", ariaLabel: "Accept", icon: <svg /> },
        ]}
      />,
    )
    const btn = container.querySelector("button") as HTMLButtonElement
    expect(btn.className).not.toContain("bg-[var(--color-success-bg)]")
    expect(btn.getAttribute("aria-pressed")).toBe("false")
  })

  it("supports gapped (un-joined) layout where each segment is self-bordered", () => {
    const { getByRole, container } = render(
      <ToggleGroup
        aria-label="Rings"
        value={[]}
        joined={false}
        shape="pill"
        options={[
          { value: "1", label: "1st" },
          { value: "2", label: "2nd" },
        ]}
      />,
    )
    const group = getByRole("group")
    expect(group.className).toContain("gap-1")
    expect(group.className).not.toContain("overflow-hidden")
    const btns = container.querySelectorAll("button")
    expect(btns[0].className).toContain("border")
    expect(btns[0].className).toContain("rounded-[999px]")
  })
})
