import { describe, it, expect } from "vitest"
import {
  InvalidLookSpecError,
  MOVES,
  buildCustomLookCss,
  contrast,
  derivePalettes,
  groundLookSpec,
  siteColoursOf,
  lookTokens,
  normalizeLookSpec,
  parseHex,
  toHex,
  type LookSpecInput,
} from "../custom-look-spec"
import { rgbToOklch } from "../oklch"

const stripe = (over: Partial<LookSpecInput> = {}): LookSpecInput => ({
  character: "a payments company for developers: navy text on white, a violet-to-pink hero gradient, a clean grotesk",
  signature: ["violet-to-pink gradients", "Söhne-like grotesk", "navy text on white"],
  idea: "the gradient as a signature on a calm white desk",
  signaturePiece: "backdrop",
  evidence: [],
  name: "Stripe",
  description: "Stripe's navy and violet with its hero gradient.",
  colors: {
    siteMode: "light",
    background: "#FFFFFF",
    surface: "#F6F9FC",
    text: "#061B31",
    muted: "#64748D",
    border: "#E5EDF5",
    primary: "#533AFD",
    secondary: "#FF6EC7",
    buttons: "brand",
    neutrals: "cool",
    otherMode: null,
  },
  faces: { ui: "geist", headline: "geist", mono: "ibm-plex-mono", numeral: "geist", label: "geist" },
  headlineWeight: 500,
  headlineStrongWeight: 600,
  radius: 6,
  shadows: "soft",
  backdrop: { kind: "band", intensity: "medium" },
  avatar: { shape: "circle", ring: "brand", fill: "gradient", initials: "ui", image: "natural" },
  idCard: { surface: "gradient", edge: "none", pattern: "none", title: "caps", mark: "chip" },
  endorsement: { frame: "card", who: "plain", note: "plain", mark: "check" },
  ...over,
})

/** A first-version stored spec: two palettes, no pieces. */
const v1 = {
  name: "Old",
  description: "",
  faces: { ui: "inter", headline: "noto-serif", mono: "system-mono", numeral: "inter", label: "inter" },
  headlineWeight: 600,
  headlineStrongWeight: 700,
  radius: 2,
  shadows: "none",
  backdrop: "dots",
  light: {
    canvas: "#FFFFFF", sunken: "#F2F2F2", elevated: "#FFFFFF", text: "#111111", textSecondary: "#444444",
    textMuted: "#666666", border: "#E0E0E0", accent: "#C70000", button: "#052962", buttonText: "#FFFFFF",
  },
  dark: {
    canvas: "#121212", sunken: "#0A0A0A", elevated: "#1E1E1E", text: "#F5F5F5", textSecondary: "#CCCCCC",
    textMuted: "#A0A0A0", border: "#333333", accent: "#FF6B6B", button: "#F5F5F5", buttonText: "#121212",
  },
}

const hue = (hex: string) => rgbToOklch(parseHex(hex)!).h
const ratio = (a: string, b: string) => contrast(parseHex(a)!, parseHex(b)!)

describe("colours", () => {
  it("keeps the site's own mode and builds the other from the same hues", () => {
    const { light, dark } = derivePalettes(stripe().colors as unknown as Record<string, unknown>)
    expect(light.canvas).toBe("#FFFFFF")
    expect(light.accent).toBe("#533AFD")
    expect(light.secondary).toBe("#FF6EC7")
    // Dark mode: a dark page, the brand still violet and readable on it.
    expect(rgbToOklch(parseHex(dark.canvas)!).l).toBeLessThan(0.3)
    expect(Math.abs(hue(dark.accent) - hue(light.accent))).toBeLessThan(6)
    expect(ratio(dark.accent, dark.canvas)).toBeGreaterThanOrEqual(3)
    // Cool neutrals lean blue.
    expect(hue(dark.canvas)).toBeGreaterThan(200)
  })

  it("meets the text floors in both modes", () => {
    const spec = normalizeLookSpec(stripe())
    for (const p of [spec.light, spec.dark]) {
      expect(ratio(p.text, p.canvas)).toBeGreaterThanOrEqual(7)
      expect(ratio(p.textSecondary, p.canvas)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.textMuted, p.canvas)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.buttonText, p.button)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.accent, p.canvas)).toBeGreaterThanOrEqual(3)
    }
  })

  it("starts from a dark site and builds its light mode; trusts the page colour over the label", () => {
    const linear = stripe({
      colors: { ...stripe().colors, siteMode: "light", background: "#08090A", surface: "#0F1011", text: "#F7F8F8", muted: "#8A8F98", border: "#23252A", primary: "#5E6AD2", secondary: "#5E6AD2", buttons: "brand" },
    })
    const spec = normalizeLookSpec(linear)
    expect(spec.dark.canvas).toBe("#08090A")
    expect(rgbToOklch(parseHex(spec.light.canvas)!).l).toBeGreaterThan(0.9)
  })

  it("uses the site's own other scheme when given", () => {
    const spec = normalizeLookSpec(
      stripe({ colors: { ...stripe().colors, otherMode: { background: "#0A1626", surface: "#13223A", text: "#F2F5F9" } } }),
    )
    expect(spec.dark.canvas).toBe("#0A1626")
    expect(spec.dark.elevated).toBe("#13223A")
  })

  it("refuses colours that are not #RRGGBB", () => {
    expect(() =>
      normalizeLookSpec(stripe({ colors: { ...stripe().colors, background: "red;} html{background:url(//x)" } })),
    ).toThrow(InvalidLookSpecError)
    expect(() => normalizeLookSpec(null)).toThrow(InvalidLookSpecError)
  })
})

describe("normalizeLookSpec", () => {
  it("is idempotent", () => {
    const once = normalizeLookSpec(stripe())
    expect(normalizeLookSpec(once)).toEqual(once)
  })

  it("still reads a first-version stored style", () => {
    const spec = normalizeLookSpec(v1)
    expect(spec.version).toBe(2)
    expect(spec.light.secondary).toBe(spec.light.accent)
    expect(spec.backdrop).toEqual({ kind: "dots", intensity: "medium" })
    expect(spec.avatar.ring).toBe("hairline")
    expect(spec.idCard.surface).toBe("plain")
  })

  it("falls back for unknown moves, faces unfit for their role, and odd numbers", () => {
    const spec = normalizeLookSpec({
      ...stripe(),
      faces: { ui: "doto", headline: "doto", mono: "inter", numeral: "doto", label: "instrument-serif" },
      avatar: { shape: "blob", ring: "neon", fill: "plasma", initials: "comic", image: "sepia" },
      idCard: { surface: "holo", edge: "wavy", pattern: "tartan", title: "huge", mark: "unicorn" },
      backdrop: { kind: "video", intensity: "max" },
      headlineWeight: 1000,
      radius: 64,
      name: "  A\u0000very\nlong   name that goes on and on and on  ",
      signature: ["one", "", "two", "three", "four", "five"],
    })
    expect(spec.faces).toEqual({ ui: "inter", headline: "noto-serif", mono: "system-mono", numeral: "doto", label: "inter" })
    expect(spec.avatar).toEqual({ shape: "circle", ring: "hairline", fill: "tint", initials: "ui", image: "natural" })
    expect(spec.idCard).toEqual({ surface: "plain", edge: "hairline", pattern: "none", title: "plain", mark: "none" })
    expect(spec.backdrop).toEqual({ kind: "none", intensity: "medium" })
    expect(spec.headlineWeight).toBe(800)
    expect(spec.radius).toBe(16)
    expect(spec.name).toBe("A very long name that goes on an")
    expect(spec.signature).toEqual(["one", "two", "three", "four"])
  })
})

describe("buildCustomLookCss", () => {
  const COLOUR_TOKENS = [
    "--bg-canvas", "--bg-sunken", "--bg-raised", "--bg-elevated", "--bg-selected",
    "--fg-primary", "--fg-secondary", "--fg-muted",
    "--border-subtle", "--border-default", "--border-hover", "--border-control",
    "--overlay-weak", "--overlay-medium",
    "--btn-primary-bg", "--btn-primary-bg-hover", "--btn-primary-fg",
    "--color-accent", "--selection-bg", "--selection-fg",
    "--shadow-sm", "--shadow-md", "--shadow-lg", "--look-backdrop",
  ]

  it("sets the same tokens as a built-in style, light and dark", () => {
    const t = lookTokens(normalizeLookSpec(stripe()))
    for (const token of COLOUR_TOKENS) {
      expect(t.light, `light ${token}`).toHaveProperty(token)
      expect(t.dark, `dark ${token}`).toHaveProperty(token)
    }
    expect(t.light["--look-backdrop"]).toContain("linear-gradient(172deg")
  })

  it("draws the three signature pieces, on the page and in the tile", () => {
    const id = "custom-ab12cd34"
    const css = buildCustomLookCss(id, normalizeLookSpec(stripe()))
    for (const piece of ["avatar", "id", "endorsement"]) {
      expect(css, piece).toContain(`html[data-look="${id}"] [data-centerpiece="${piece}"]`)
      expect(css, `${piece} preview`).toContain(`[data-look-preview="${id}"] [data-centerpiece="${piece}"]`)
    }
    // Gradient ID card re-scopes the card's ink; caps title; chip mark.
    expect(css).toContain("--fg-primary: var(--look-id-fg)")
    expect(css).toContain("text-transform: uppercase")
    expect(css).toContain("linear-gradient(135deg, var(--look-accent), var(--look-secondary))")
    // Page rules never reach into another style's preview tile.
    expect(css).toContain(':not([data-look-preview] *)')
  })

  it("turns every menu choice into CSS without website words or remote images", () => {
    const base = stripe()
    const variants: LookSpecInput[] = []
    for (const kind of Object.keys(MOVES.backdrop)) variants.push({ ...base, backdrop: { kind, intensity: "bold" } })
    for (const surface of Object.keys(MOVES.idSurface))
      for (const pattern of Object.keys(MOVES.idPattern))
        variants.push({ ...base, idCard: { ...base.idCard, surface, pattern } })
    for (const edge of Object.keys(MOVES.idEdge)) variants.push({ ...base, idCard: { ...base.idCard, edge } })
    for (const mark of Object.keys(MOVES.idMark)) variants.push({ ...base, idCard: { ...base.idCard, mark } })
    for (const ring of Object.keys(MOVES.avatarRing))
      for (const fill of Object.keys(MOVES.avatarFill))
        variants.push({ ...base, avatar: { ...base.avatar, ring, fill } })
    for (const frame of Object.keys(MOVES.endorsementFrame))
      for (const note of Object.keys(MOVES.endorsementNote))
        for (const mark of Object.keys(MOVES.endorsementMark))
          variants.push({ ...base, endorsement: { frame, who: "caps", note, mark } })

    for (const v of variants) {
      const css = buildCustomLookCss("custom-ab12cd34", normalizeLookSpec(v))
      expect(css).not.toContain("Stripe")
      expect(css).not.toContain("violet-to-pink")
      // Only the inline grain (and its own internal filter reference).
      expect(css).not.toMatch(/url\((?!"data:image\/svg\+xml,|%23g\))/)
      expect(css).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
      expect(css.match(/\{/g)?.length).toBe(css.match(/\}/g)?.length)
    }
  })

  it("only builds for a well-formed id", () => {
    const spec = normalizeLookSpec(stripe())
    for (const id of ["custom-AB12CD34", "custom-ab12", 'custom-ab12cd34"],*{x', "linen"]) {
      expect(() => buildCustomLookCss(id, spec), id).toThrow(InvalidLookSpecError)
    }
  })

  it("keeps text readable on a strong ID card surface", () => {
    for (const surface of ["brand", "gradient", "ink"] as const) {
      const t = lookTokens(normalizeLookSpec(stripe({ idCard: { surface, edge: "none", pattern: "none", title: "plain", mark: "none" } })))
      for (const mode of [t.light, t.dark]) {
        const fg = mode["--look-id-fg"]
        const bgs = (mode["--look-id-surface"].match(/#[0-9A-F]{6}/g) ?? []) as string[]
        expect(bgs.length).toBeGreaterThan(0)
        for (const bg of bgs) expect(ratio(fg, bg), `${surface} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("exposes hex for the colour helpers", () => {
    expect(toHex(parseHex("#533afd")!)).toBe("#533AFD")
  })
})

describe("groundLookSpec: nothing invented", () => {
  const digest = JSON.stringify({
    colours: { light: [{ value: "#533afd" }, { value: "#061b31" }, { value: "#ffffff" }, { value: "#f6f9fc" }, { value: "#64748d" }, { value: "#e5edf5" }] },
    gradients: [{ value: "linear-gradient(90deg, #533afd 0%, #ff6ec7 100%)", count: 4 }],
    textTransforms: [{ value: "uppercase", count: 12 }],
    hardShadows: 0,
  })
  const ground = (spec: unknown, request = "") =>
    groundLookSpec(spec, { sources: [digest, request], siteColours: siteColoursOf(digest) })

  it("resets every move without evidence to plain", () => {
    const { spec, dropped } = ground({ ...stripe(), evidence: [] })
    expect(spec.backdrop).toEqual({ kind: "none", intensity: "medium" })
    // "none" is itself a plain edge, so it stays.
    expect(spec.idCard).toEqual({ surface: "plain", edge: "none", pattern: "none", title: "plain", mark: "none" })
    expect((spec.avatar as Record<string, string>).ring).toBe("hairline")
    expect((spec.endorsement as Record<string, string>).frame).toBe("row")
    expect(dropped).toContain("idCard.mark: chip")
  })

  it("keeps a move whose quote is really in the digest, not one with a made-up quote", () => {
    const { spec, dropped } = ground({
      ...stripe(),
      evidence: [
        { lever: "idCard.surface", choice: "gradient", quote: "linear-gradient(90deg, #533afd 0%, #ff6ec7 100%)" },
        { lever: "idCard.title", choice: "caps", quote: '"uppercase"' },
        { lever: "idCard.mark", choice: "chip", quote: "a card chip in the hero" },
        { lever: "backdrop.kind", choice: "band", quote: "#ff" },
      ],
    })
    const id = spec.idCard as Record<string, string>
    expect(id.surface).toBe("gradient")
    expect(id.title).toBe("caps")
    expect(id.mark).toBe("none")
    // Too short to count as evidence.
    expect((spec.backdrop as Record<string, string>).kind).toBe("none")
    expect(dropped).toContain("backdrop.kind: band")
  })

  it("accepts the person's own request as evidence in a new version", () => {
    const { spec } = ground(
      { ...stripe(), evidence: [{ lever: "backdrop.kind", choice: "band", quote: "a band like their hero" }] },
      "Please add a band like their hero",
    )
    expect((spec.backdrop as Record<string, string>).kind).toBe("band")
  })

  it("snaps colours to the site's own and drops a second colour the site doesn't have", () => {
    const { spec, dropped } = ground({
      ...stripe(),
      colors: { ...stripe().colors, primary: "#5539FC", secondary: "#00FF88" },
    })
    const c = spec.colors as Record<string, string>
    expect(c.primary).toBe("#533AFD")
    expect(c.secondary).toBe("#533AFD")
    expect(dropped.some((d) => d.startsWith("colors.secondary"))).toBe(true)
  })

  it("keeps a second colour from the site's gradient", () => {
    const { spec } = ground({ ...stripe(), colors: { ...stripe().colors, secondary: "#FF6EC7" } })
    expect((spec.colors as Record<string, string>).secondary).toBe("#FF6EC7")
  })
})

describe("the idea and the signature piece", () => {
  it("keeps them, and reads styles made before they existed", () => {
    const spec = normalizeLookSpec(stripe())
    expect(spec.idea).toBe("the gradient as a signature on a calm white desk")
    expect(spec.signaturePiece).toBe("backdrop")
    expect(spec.character).toContain("payments company")

    const { idea: _i, signaturePiece: _p, character: _c, ...older } = stripe()
    void _i
    void _p
    void _c
    const old = normalizeLookSpec(older)
    expect(old.idea).toBe("")
    expect(old.signaturePiece).toBeNull()
    expect(normalizeLookSpec({ ...stripe(), signaturePiece: "everything" }).signaturePiece).toBeNull()
  })
})
