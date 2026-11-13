/**
 * Colour in OKLCH (perceptual lightness, chroma, hue) for styles made from
 * a website (custom-look-spec.ts). Moving a colour's lightness here keeps
 * its hue and saturation, so a brand colour pushed for contrast, or carried
 * into the other mode, still reads as that brand instead of greying out (as
 * mixing toward black or white does).
 *
 * Björn Ottosson's OKLab, sRGB D65; out-of-gamut colours keep their
 * lightness and hue and lose chroma until they fit.
 */

export type Rgb = readonly [number, number, number]

export interface Oklch {
  l: number
  c: number
  h: number
}

export const BLACK: Rgb = [0, 0, 0]
export const WHITE: Rgb = [255, 255, 255]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function toLinear(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function fromLinear(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

export function rgbToOklch([r8, g8, b8]: Rgb): Oklch {
  const r = toLinear(r8)
  const g = toLinear(g8)
  const b = toLinear(b8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c: Math.hypot(A, B), h }
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const A = c * Math.cos(hr)
  const B = c * Math.sin(hr)
  const l3 = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m3 = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s3 = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
}

const inGamut = (lin: number[]) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/** sRGB for a colour, reducing chroma (never lightness or hue) to fit. */
export function oklchToRgb(color: Oklch): Rgb {
  const l = clamp(color.l, 0, 1)
  const h = Number.isFinite(color.h) ? color.h : 0
  let lin = oklchToLinear({ l, c: Math.max(0, color.c), h })
  if (!inGamut(lin)) {
    let lo = 0
    let hi = Math.max(0, color.c)
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinear({ l, c: mid, h }))) lo = mid
      else hi = mid
    }
    lin = oklchToLinear({ l, c: lo, h })
  }
  return lin.map((v) => Math.round(clamp(fromLinear(clamp(v, 0, 1)), 0, 1) * 255)) as unknown as Rgb
}

/** The same colour at another lightness (0–1). */
export function withLightness(rgb: Rgb, l: number): Rgb {
  return oklchToRgb({ ...rgbToOklch(rgb), l })
}

export function lightness(rgb: Rgb): number {
  return rgbToOklch(rgb).l
}

/** `a`'s hue and chroma at a lightness `t` of the way toward `b`'s. */
export function towardLightness(a: Rgb, b: Rgb, t: number): Rgb {
  const la = lightness(a)
  return withLightness(a, la + (lightness(b) - la) * t)
}

function channel(c: number): number {
  return toLinear(c)
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * `fg` at the lightness nearest its own that reaches `min` against every
 * background: darker on light backgrounds, lighter on dark ones, hue and
 * chroma kept. Black or white if even that falls short.
 */
export function ensureContrast(fg: Rgb, backgrounds: readonly Rgb[], min: number): Rgb {
  const passes = (c: Rgb) => backgrounds.every((bg) => contrast(c, bg) >= min)
  if (passes(fg)) return fg
  const o = rgbToOklch(fg)
  const darken = luminance(backgrounds[0]) > 0.18
  const at = (l: number) => oklchToRgb({ ...o, l })
  if (darken) {
    if (!passes(at(0))) return BLACK
    let ok = 0
    let bad = o.l
    for (let i = 0; i < 24; i++) {
      const mid = (ok + bad) / 2
      if (passes(at(mid))) ok = mid
      else bad = mid
    }
    return at(ok)
  }
  if (!passes(at(1))) return WHITE
  let bad = o.l
  let ok = 1
  for (let i = 0; i < 24; i++) {
    const mid = (ok + bad) / 2
    if (passes(at(mid))) ok = mid
    else bad = mid
  }
  return at(ok)
}

/** Whichever of white or near-black reads better on `bg`, pushed to `min`. */
export function textOn(bgs: readonly Rgb[], min = 4.5): Rgb {
  const ink: Rgb = [17, 17, 17]
  const score = (c: Rgb) => Math.min(...bgs.map((bg) => contrast(c, bg)))
  const best = score(WHITE) >= score(ink) ? WHITE : ink
  return score(best) >= min ? best : ensureContrast(best, bgs, min)
}
