import { describe, it, expect, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ToastProvider, useToast } from "../toast"

// A toast with a fixed id says the latest of something (who you act as):
// showing another with the same id replaces the one on screen instead of
// stacking under it. Toasts without an id still stack.

afterEach(() => {
  cleanup()
})

function Trigger({ id, title }: { id?: string; title: string }) {
  const { toast } = useToast()
  return (
    <button type="button" onClick={() => toast({ id, title })}>
      {title}
    </button>
  )
}

function renderTriggers(id?: string) {
  render(
    <ToastProvider>
      <Trigger id={id} title="Now acting as Ma Earth" />
      <Trigger id={id} title="Now acting as Maya Lin" />
    </ToastProvider>,
  )
}

describe("toast ids", () => {
  it("replaces the toast with the same id", () => {
    renderTriggers("acting-as")
    fireEvent.click(screen.getByRole("button", { name: "Now acting as Ma Earth" }))
    fireEvent.click(screen.getByRole("button", { name: "Now acting as Maya Lin" }))
    const toasts = screen.getAllByRole("status")
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toHaveTextContent("Now acting as Maya Lin")
  })

  it("stacks toasts that have no id", () => {
    renderTriggers()
    fireEvent.click(screen.getByRole("button", { name: "Now acting as Ma Earth" }))
    fireEvent.click(screen.getByRole("button", { name: "Now acting as Maya Lin" }))
    expect(screen.getAllByRole("status")).toHaveLength(2)
  })
})
