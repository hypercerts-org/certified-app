import { describe, it, expect, afterEach } from "vitest"
import { renderHook, cleanup } from "@testing-library/react"
import { useInertOutside } from "../use-inert-outside"

function child(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement("div")
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

describe("useInertOutside", () => {
  it("makes the page inert but leaves the kept node and the toast region alone", () => {
    const app = child()
    const toasts = child({ "data-inert-exempt": "" })
    const sheet = child()
    const ref = { current: sheet }

    const { rerender } = renderHook(({ on }) => useInertOutside(on, [ref]), {
      initialProps: { on: true },
    })

    expect(app).toHaveAttribute("inert")
    expect(sheet).not.toHaveAttribute("inert")
    expect(toasts).not.toHaveAttribute("inert")

    rerender({ on: false })
    expect(app).not.toHaveAttribute("inert")
  })
})
