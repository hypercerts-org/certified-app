import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

import NotFoundMarker, { useIsNotFound } from "../not-found-marker"

function Probe() {
  return <span data-testid="probe">{useIsNotFound() ? "not-found" : "found"}</span>
}

afterEach(() => cleanup())

describe("NotFoundMarker / useIsNotFound", () => {
  it("reads false when no marker is mounted", () => {
    render(<Probe />)
    expect(screen.getByTestId("probe").textContent).toBe("found")
  })

  it("flips to true while a marker is mounted and back on unmount", () => {
    const { rerender } = render(
      <>
        <Probe />
        <NotFoundMarker />
      </>,
    )
    expect(screen.getByTestId("probe").textContent).toBe("not-found")

    rerender(<Probe />)
    expect(screen.getByTestId("probe").textContent).toBe("found")
  })

  it("stays set until the last of several markers unmounts", () => {
    const { rerender } = render(
      <>
        <Probe />
        <NotFoundMarker />
        <NotFoundMarker />
      </>,
    )
    rerender(
      <>
        <Probe />
        <NotFoundMarker />
      </>,
    )
    expect(screen.getByTestId("probe").textContent).toBe("not-found")

    rerender(<Probe />)
    expect(screen.getByTestId("probe").textContent).toBe("found")
  })
})
