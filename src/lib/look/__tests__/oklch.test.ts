import { describe, it, expect } from "vitest"
import { contrast, ensureContrast, lightness, oklchToRgb, rgbToOklch, textOn, withLightness, type Rgb } from "../oklch"

const close = (a: Rgb, b: Rgb, tol = 1) => a.every((v, i) => Math.abs(v - b[i]) <= tol)

describe("oklch", () => {
  it("round-trips sRGB colours", () => {
    for (const c of [
      [0, 0, 0],
      [255, 255, 255],
      [83, 58, 253],
      [199, 0, 0],
      [6, 27, 49],
      [244, 239, 228],
    ] as Rgb[]) {
      expect(close(oklchToRgb(rgbToOklch(c)), c), String(c)).toBe(true)
    }
  })

  it("keeps hue when only lightness moves, and stays in gamut", () => {
    const violet: Rgb = [83, 58, 253]
    const lighter = withLightness(violet, 0.8)
    expect(lightness(lighter)).toBeCloseTo(0.8, 1)
    expect(Math.abs(rgbToOklch(lighter).h - rgbToOklch(violet).h)).toBeLessThan(4)
    for (const ch of lighter) expect(ch).toBeGreaterThanOrEqual(0)
    for (const ch of lighter) expect(ch).toBeLessThanOrEqual(255)
  })

  it("reaches a contrast floor by lightness, not by turning grey", () => {
    const white: Rgb = [255, 255, 255]
    const pale: Rgb = [140, 170, 255] // light blue, too pale on white
    const fixed = ensureContrast(pale, [white], 4.5)
    expect(contrast(fixed, white)).toBeGreaterThanOrEqual(4.5)
    // Still blue: hue within a few degrees and chroma kept well above grey.
    expect(Math.abs(rgbToOklch(fixed).h - rgbToOklch(pale).h)).toBeLessThan(8)
    expect(rgbToOklch(fixed).c).toBeGreaterThan(0.08)
    // Already fine: unchanged.
    expect(ensureContrast([17, 17, 17], [white], 4.5)).toEqual([17, 17, 17])
  })

  it("picks white or ink for text on a colour", () => {
    expect(textOn([[83, 58, 253]])).toEqual([255, 255, 255])
    expect(contrast(textOn([[255, 229, 0]]), [255, 229, 0])).toBeGreaterThanOrEqual(4.5)
  })
})

describe("parseCssColour", () => {
  it("reads the colour syntaxes sites use", async () => {
    const { parseCssColour, coloursIn } = await import("../oklch")
    expect(parseCssColour("#fff")).toEqual([255, 255, 255])
    expect(parseCssColour("#533afdcc")).toEqual([83, 58, 253])
    expect(parseCssColour("rgb(83, 58, 253)")).toEqual([83, 58, 253])
    expect(parseCssColour("rgba(83 58 253 / 0.5)")).toEqual([83, 58, 253])
    expect(parseCssColour("hsl(0, 100%, 50%)")).toEqual([255, 0, 0])
    const ok = parseCssColour("oklch(0.62 0.21 275)")!
    expect(rgbToOklch(ok).h).toBeGreaterThan(260)
    expect(parseCssColour("var(--x)")).toBeNull()
    expect(coloursIn('{"bg":"#061b31","g":"linear-gradient(90deg, #533afd 0%, rgb(255,110,199) 100%)"}')).toHaveLength(3)
  })
})
