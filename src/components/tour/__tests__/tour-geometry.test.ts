import { describe, it, expect, vi, afterEach } from "vitest"
import { computeCardPos, scrollAnchorToTop } from "../product-tour"

// jsdom's window: 1024 × 768. The card is 358 × 200.
const CARD_W = 358
const CARD_H = 200

function rect(r: { left: number; top: number; width: number; height: number }): DOMRect {
  return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("computeCardPos", () => {
  it("puts the card beside a sidebar item when there's room on the right", () => {
    const pos = computeCardPos(rect({ left: 12, top: 140, width: 224, height: 36 }), CARD_W, CARD_H, "right", "start")
    expect(pos.left).toBe(236 + 12)
    expect(pos.top).toBe(140)
  })

  it("on a phone, where there's no room beside it, goes above an anchor in the bottom half", () => {
    vi.stubGlobal("innerWidth", 390)
    vi.stubGlobal("innerHeight", 844)
    const pill = rect({ left: 120, top: 760, width: 68, height: 48 })
    const pos = computeCardPos(pill, CARD_W, CARD_H, "right", "start")
    expect(pos.top).toBe(760 - 12 - CARD_H)
  })

  it("and below an anchor in the top half (the top bar's account control)", () => {
    vi.stubGlobal("innerWidth", 390)
    vi.stubGlobal("innerHeight", 844)
    const account = rect({ left: 334, top: 10, width: 44, height: 44 })
    const pos = computeCardPos(account, CARD_W, CARD_H, "right", "start")
    expect(pos.top).toBe(54 + 12)
  })
})

describe("scrollAnchorToTop", () => {
  it("leaves the page where it is for an anchor in the fixed chrome", () => {
    const scrollTo = vi.fn()
    vi.stubGlobal("scrollTo", scrollTo)
    document.body.innerHTML = `<header class="app-sidebar"><a id="item">Feed</a></header>`
    const item = document.getElementById("item")!
    item.scrollIntoView = vi.fn()
    scrollAnchorToTop(item)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(item.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" })
  })

  it("scrolls the page to an in-flow anchor", () => {
    const scrollTo = vi.fn()
    vi.stubGlobal("scrollTo", scrollTo)
    document.body.innerHTML = `<section id="feed">Feed</section>`
    const el = document.getElementById("feed")!
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect({ left: 0, top: 500, width: 600, height: 400 }))
    scrollAnchorToTop(el)
    expect(scrollTo).toHaveBeenCalled()
  })
})
