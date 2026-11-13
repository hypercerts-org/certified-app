import { describe, it, expect } from "vitest"
import {
  InvalidLookSpecError,
  buildCustomLookCss,
  contrast,
  ensureContrast,
  lookTokens,
  normalizeLookSpec,
  parseHex,
  toHex,
  type LookSpecInput,
} from "../custom-look-spec"

const palette = (over: Partial<LookSpecInput["light"]> = {}): LookSpecInput["light"] => ({
  canvas: "#F6F9FC",
  sunken: "#E5EDF5",
  elevated: "#FFFFFF",
  text: "#061B31",
  textSecondary: "#3C4F69",
  textMuted: "#64748D",
  border: "#E5EDF5",
  accent: "#533AFD",
  button: "#533AFD",
  buttonText: "#FFFFFF",
  ...over,
})

const darkPalette = palette({
  canvas: "#0A1626",
  sunken: "#061020",
  elevated: "#13223A",
  text: "#F2F5F9",
  textSecondary: "#C2CCDA",
  textMuted: "#8C99AD",
  border: "#22324A",
  accent: "#8F80FF",
  button: "#8F80FF",
  buttonText: "#0A1626",
})

const input = (over: Partial<LookSpecInput> = {}): LookSpecInput => ({
  name: "Stripe",
  description: "Stripe's navy and violet with Söhne-like type.",
  faces: { ui: "geist", headline: "geist", mono: "ibm-plex-mono", numeral: "geist", label: "geist" },
  headlineWeight: 500,
  headlineStrongWeight: 600,
  radius: 6,
  shadows: "soft",
  backdrop: "none",
  light: palette(),
  dark: darkPalette,
  ...over,
})

describe("colour", () => {
  it("parses #rgb and #rrggbb, nothing else", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255])
    expect(parseHex(" #533AFD ")).toEqual([83, 58, 253])
    for (const bad of ["533afd", "#12345", "red", "rgb(0,0,0)", "#fff;}body{", 7, null]) {
      expect(parseHex(bad), String(bad)).toBeNull()
    }
    expect(toHex([83, 58, 253])).toBe("#533AFD")
  })

  it("pushes a colour until it meets a contrast floor", () => {
    const white = parseHex("#FFFFFF")!
    const pale = parseHex("#BBBBBB")!
    expect(contrast(pale, white)).toBeLessThan(4.5)
    expect(contrast(ensureContrast(pale, [white], 4.5), white)).toBeGreaterThanOrEqual(4.5)
    // Already fine: unchanged.
    expect(ensureContrast(parseHex("#111111")!, [white], 4.5)).toEqual(parseHex("#111111"))
    // On dark, it lightens.
    const dark = parseHex("#101010")!
    const lifted = ensureContrast(parseHex("#444444")!, [dark], 4.5)
    expect(contrast(lifted, dark)).toBeGreaterThanOrEqual(4.5)
  })
})

describe("normalizeLookSpec", () => {
  it("keeps a good spec as it is, and is idempotent", () => {
    const once = normalizeLookSpec(input())
    expect(once.faces.ui).toBe("geist")
    expect(once.radius).toBe(6)
    expect(once.light.accent).toBe("#533AFD")
    expect(normalizeLookSpec(once)).toEqual(once)
  })

  it("refuses colours that are not #RRGGBB", () => {
    expect(() => normalizeLookSpec(input({ light: palette({ canvas: "red;} html{background:url(//x)" }) }))).toThrow(
      InvalidLookSpecError,
    )
    expect(() => normalizeLookSpec(null)).toThrow(InvalidLookSpecError)
  })

  it("brings text up to WCAG AA", () => {
    const spec = normalizeLookSpec(input({ light: palette({ textMuted: "#C8CED6", buttonText: "#6A5CFF" }) }))
    const canvas = parseHex(spec.light.canvas)!
    expect(contrast(parseHex(spec.light.textMuted)!, canvas)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(parseHex(spec.light.text)!, canvas)).toBeGreaterThanOrEqual(7)
    expect(contrast(parseHex(spec.light.buttonText)!, parseHex(spec.light.button)!)).toBeGreaterThanOrEqual(4.5)
  })

  it("falls back for faces outside the catalogue or unfit for their role", () => {
    const spec = normalizeLookSpec(
      input({
        faces: {
          ui: "doto",
          headline: "doto",
          mono: "inter",
          numeral: "doto",
          label: "instrument-serif",
        } as LookSpecInput["faces"],
      }),
    )
    expect(spec.faces).toEqual({ ui: "inter", headline: "noto-serif", mono: "system-mono", numeral: "doto", label: "inter" })
    const unknown = normalizeLookSpec({ ...input(), faces: { ui: "Comic Sans" } })
    expect(unknown.faces.ui).toBe("inter")
  })

  it("snaps numbers into range and cleans the words", () => {
    const spec = normalizeLookSpec({
      ...input(),
      headlineWeight: 1000,
      headlineStrongWeight: 120,
      radius: 64,
      shadows: "neon",
      backdrop: "video",
      name: "  A\u0000very\nlong   name that goes on and on and on  ",
      description: "x".repeat(400),
    })
    expect(spec.headlineWeight).toBe(800)
    expect(spec.headlineStrongWeight).toBe(300)
    expect(spec.radius).toBe(16)
    expect(spec.shadows).toBe("soft")
    expect(spec.backdrop).toBe("none")
    expect(spec.name).toBe("A very long name that goes on an")
    expect(spec.description).toHaveLength(120)
    expect(normalizeLookSpec({ ...input(), name: "   " }, "stripe.com").name).toBe("stripe.com")
  })

  it("gives Instrument Serif its one weight", () => {
    const spec = normalizeLookSpec(input({ faces: { ...input().faces, headline: "instrument-serif" }, headlineWeight: 700 }))
    expect(spec.headlineWeight).toBe(400)
    expect(spec.headlineStrongWeight).toBe(400)
  })
})

describe("buildCustomLookCss", () => {
  /** Tokens every built-in style sets (looks.test.ts). */
  const COLOUR_TOKENS = [
    "--bg-canvas", "--bg-sunken", "--bg-raised", "--bg-elevated", "--bg-selected",
    "--fg-primary", "--fg-secondary", "--fg-muted",
    "--border-subtle", "--border-default", "--border-hover", "--border-control",
    "--overlay-weak", "--overlay-medium",
    "--btn-primary-bg", "--btn-primary-bg-hover", "--btn-primary-fg",
    "--color-accent", "--selection-bg", "--selection-fg",
    "--shadow-sm", "--shadow-md", "--shadow-lg", "--look-backdrop",
  ]
  const MODE_TOKENS = [
    "--font-inter", "--font-headline", "--font-mono", "--font-numeral", "--font-label",
    "--weight-headline-strong", "--weight-headline", "--radius",
  ]

  it("sets the same tokens as a built-in style, light and dark", () => {
    const t = lookTokens(normalizeLookSpec(input()))
    for (const token of MODE_TOKENS) expect(t.modeless, token).toHaveProperty(token)
    for (const token of COLOUR_TOKENS) {
      expect(t.light, `light ${token}`).toHaveProperty(token)
      expect(t.dark, `dark ${token}`).toHaveProperty(token)
    }
    expect(t.modeless["--font-mono"]).toContain("var(--font-plex-mono)")
    expect(t.modeless["--radius"]).toBe("6px")
  })

  it("scopes the rules to the page and to the style's preview tile", () => {
    const css = buildCustomLookCss("custom-ab12cd34", normalizeLookSpec(input()))
    expect(css).toContain(':root[data-look="custom-ab12cd34"],\n[data-look-preview="custom-ab12cd34"] {')
    expect(css).toContain(':root[data-look="custom-ab12cd34"]:not([data-theme="dark"]),')
    expect(css).toContain('html[data-theme="dark"] [data-look-preview="custom-ab12cd34"] {')
    // Words from the website never reach the CSS.
    expect(css).not.toContain("Stripe")
    expect(css.match(/\{/g)).toHaveLength(3)
    expect(css.match(/\}/g)).toHaveLength(3)
  })

  it("only builds for a well-formed id", () => {
    const spec = normalizeLookSpec(input())
    for (const id of ["custom-AB12CD34", "custom-ab12", 'custom-ab12cd34"],*{x', "linen"]) {
      expect(() => buildCustomLookCss(id, spec), id).toThrow(InvalidLookSpecError)
    }
  })

  it("draws each backdrop and shadow kind from its own values", () => {
    for (const backdrop of ["none", "dots", "glow", "grain"] as const) {
      for (const shadows of ["none", "soft", "crisp", "hard"] as const) {
        const t = lookTokens(normalizeLookSpec(input({ backdrop, shadows })))
        expect(t.light["--look-backdrop"]).toBeTruthy()
        expect(t.dark["--shadow-md"]).toBeTruthy()
        // No remote images: nothing, a gradient, or the inline grain.
        for (const mode of [t.light, t.dark]) {
          expect(mode["--look-backdrop"]).toMatch(/^(none$|radial-gradient\(|url\("data:image\/svg\+xml,)/)
          expect(mode["--look-backdrop"]).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
        }
      }
    }
  })
})
