import { describe, expect, it } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import FitImage, { fitFor } from "../fit-image"
import { workCardLayout } from "../work-card"

function img(width: number, height: number): HTMLImageElement {
  const el = document.createElement("img")
  Object.defineProperty(el, "naturalWidth", { value: width })
  Object.defineProperty(el, "naturalHeight", { value: height })
  return el
}

describe("fitFor", () => {
  it("shows a banner much wider than 2:1 whole", () => {
    expect(fitFor(img(1200, 300))).toBe("contain")
  })

  it("lets a photo cover its frame", () => {
    // No canvas in the test DOM: a picture that can't be read is a photo.
    expect(fitFor(img(1600, 900))).toBe("cover")
    expect(fitFor(img(800, 1000))).toBe("cover")
  })
})

describe("FitImage", () => {
  it("covers until loaded, then reports how it fills the frame", () => {
    const seen: [string, number][] = []
    const { container } = render(
      <FitImage src="/wide.png" onFit={(fit, ratio) => seen.push([fit, ratio])} />,
    )
    const el = container.querySelector("img")!
    expect(el.dataset.fit).toBe("cover")
    Object.defineProperty(el, "naturalWidth", { value: 1000 })
    Object.defineProperty(el, "naturalHeight", { value: 200 })
    fireEvent.load(el)
    expect(el.dataset.fit).toBe("contain")
    expect(seen).toEqual([["contain", 5]])
  })
})

describe("workCardLayout", () => {
  it("lays one card out wide and more in a grid", () => {
    expect(workCardLayout(1)).toBe("wide")
    expect(workCardLayout(2)).toBe("grid")
    expect(workCardLayout(5)).toBe("grid")
  })
})
