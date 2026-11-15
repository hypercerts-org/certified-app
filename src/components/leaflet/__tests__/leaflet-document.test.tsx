import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import LeafletDocument from "../leaflet-document"

afterEach(cleanup)

describe("LeafletDocument: plain-text descriptions", () => {
  it("renders a descriptionString as paragraphs, line breaks kept", () => {
    const { container } = render(
      <LeafletDocument
        value={{
          $type: "org.hypercerts.defs#descriptionString",
          value: "First paragraph.\n\nSecond, line one.\nSecond, line two.\n\n",
        }}
      />,
    )
    const paras = container.querySelectorAll("p.leaflet-doc__para")
    expect(paras).toHaveLength(2)
    expect(paras[0].textContent).toBe("First paragraph.")
    expect(paras[1].querySelectorAll("br")).toHaveLength(1)
    expect(paras[1].textContent).toBe("Second, line one.Second, line two.")
  })

  it("renders a plain string the same way", () => {
    const { container } = render(<LeafletDocument value={"One.\n\nTwo."} className="extra" />)
    expect(container.querySelectorAll("p.leaflet-doc__para")).toHaveLength(2)
    expect(container.firstElementChild?.className).toBe("leaflet-doc extra")
  })

  it("renders nothing for blank text", () => {
    const { container } = render(
      <LeafletDocument value={{ $type: "org.hypercerts.defs#descriptionString", value: "  " }} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
