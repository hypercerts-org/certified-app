import * as z from "zod/v4"

/**
 * A style made from a website: what Claude decides (`LookSpecSchema`), how
 * that is made safe (`normalizeLookSpec`), and the CSS it becomes
 * (`buildCustomLookCss`), in the same shape as a built-in style in
 * looks.css.
 *
 * Claude read an untrusted website to make the spec, so nothing it returns
 * reaches CSS as written: colours must parse as #RRGGBB, faces come from a
 * fixed catalogue of the faces the app loads, numbers are clamped and
 * snapped, and every other value (derived colours, shadows, backdrops) is
 * computed here. Text colours are pushed until they meet WCAG AA.
 */

// ------------------------------------------------------------------ faces

/** The faces a made style can use: the ones the root layout loads (next/font,
 *  self-hosted; the CSP allows no other font host) plus the device's own. */
export const LOOK_FACES = {
  inter: {
    stack: "var(--font-inter-face), system-ui, sans-serif",
    about: "Inter. Neutral neo-grotesk UI sans; the match for Helvetica, Arial, SF Pro, Roboto, Segoe and most system-font sites.",
  },
  "inter-tight": {
    stack: "var(--font-inter-tight), var(--font-inter-face), sans-serif",
    about: "Inter Tight. Inter with tight spacing, for large display names; good in light weights.",
  },
  geist: {
    stack: "var(--font-geist), system-ui, sans-serif",
    about: "Geist. Crisp, technical grotesk (Vercel); the match for Söhne, Graphik, Suisse, Aeonik, Untitled Sans.",
  },
  "hanken-grotesk": {
    stack: "var(--font-hanken), var(--font-inter-face), sans-serif",
    about: "Hanken Grotesk. Friendly, open grotesk; the match for Circular, Avenir, Proxima Nova, Gilroy.",
  },
  "schibsted-grotesk": {
    stack: "var(--font-schibsted), var(--font-inter-face), sans-serif",
    about: "Schibsted Grotesk. Sturdy news grotesk with character; the match for Founders Grotesk, GT America, Franklin Gothic, Neue Haas.",
  },
  "bricolage-grotesque": {
    stack: "var(--font-bricolage), var(--font-inter-face), sans-serif",
    about: "Bricolage Grotesque. Expressive, quirky display grotesk with ink traps; for playful or editorial display type.",
  },
  "google-sans-flex": {
    stack: "var(--font-sans-flex), var(--font-inter-face), sans-serif",
    about: "Google Sans Flex. Round, friendly geometric sans; the match for Google Sans, Product Sans, Poppins, Nunito, Futura, Montserrat.",
  },
  "noto-serif": {
    stack: "var(--font-noto-serif), Georgia, serif",
    about: "Noto Serif. Sturdy book serif; the match for Georgia, Times, Merriweather, Source Serif, PT Serif.",
  },
  newsreader: {
    stack: "var(--font-newsreader), Georgia, serif",
    about: "Newsreader. Editorial text serif with contrast; the match for Tiempos, GT Sectra, Lyon, Publico, Freight.",
  },
  "instrument-serif": {
    stack: "var(--font-instrument-serif), Georgia, serif",
    about: "Instrument Serif. Condensed display serif, one weight (400) only; the match for Editorial New, Canela, PP Editorial, Ogg. Headlines and numbers only.",
  },
  "ibm-plex-mono": {
    stack: "var(--font-plex-mono), ui-monospace, monospace",
    about: "IBM Plex Mono. Classic, slightly technical mono.",
  },
  "geist-mono": {
    stack: "var(--font-geist-mono), ui-monospace, monospace",
    about: "Geist Mono. Clean modern mono; the match for SF Mono, JetBrains Mono, Berkeley Mono.",
  },
  "dm-mono": {
    stack: "var(--font-dm-mono), ui-monospace, monospace",
    about: "DM Mono. Soft, rounded, low-contrast mono.",
  },
  doto: {
    stack: "var(--font-doto), var(--font-geist-mono), monospace",
    about: "Doto. Dot-matrix display face. Big numbers only, never text.",
  },
  "system-sans": {
    stack: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
    about: "The device's own UI font (San Francisco on Apple, Segoe UI on Windows).",
  },
  "system-serif": {
    stack: "Georgia, \"Times New Roman\", serif",
    about: "Georgia, the classic screen serif.",
  },
  "system-mono": {
    stack: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    about: "The device's own monospace.",
  },
} as const

export type LookFace = keyof typeof LOOK_FACES

const FACE_IDS = Object.keys(LOOK_FACES) as [LookFace, ...LookFace[]]
const MONO_FACES: readonly LookFace[] = ["ibm-plex-mono", "geist-mono", "dm-mono", "system-mono"]
/** Display-only faces: never the UI, labels or IDs. */
const DISPLAY_FACES: readonly LookFace[] = ["instrument-serif", "doto"]

// ----------------------------------------------------------------- schema

const hex = z.string().describe("A colour as #RRGGBB.")

const Palette = z
  .object({
    canvas: hex.describe("Page background (#RRGGBB)."),
    sunken: hex.describe(
      "Recessed areas: ID chips, code, wells, inactive tracks. A step darker than canvas (#RRGGBB).",
    ),
    elevated: hex.describe(
      "Cards, menus, dialogs, sheets. Light mode: white or lighter than canvas. Dark mode: lighter than canvas (#RRGGBB).",
    ),
    text: hex.describe("Primary text, names and headings (#RRGGBB)."),
    textSecondary: hex.describe("Body copy and secondary text (#RRGGBB)."),
    textMuted: hex.describe("Captions, dates, hints (#RRGGBB)."),
    border: hex.describe("The quiet hairline around cards and fields, and dividers (#RRGGBB)."),
    accent: hex.describe("Links, focus rings and highlights: usually the brand colour (#RRGGBB)."),
    button: hex.describe("Primary button background (#RRGGBB)."),
    buttonText: hex.describe("Text on the primary button (#RRGGBB)."),
  })
  .describe("Colours for one mode.")

const face = z.enum(FACE_IDS)

/** What Claude returns. Kept loose where the API's schema support is
 *  (no string patterns or number ranges); `normalizeLookSpec` enforces. */
export const LookSpecSchema = z.object({
  name: z.string().describe("The brand or site name as people say it, at most 24 characters."),
  description: z
    .string()
    .describe("One plain sentence, at most 90 characters: what the style takes from the site."),
  faces: z.object({
    ui: face.describe("Body text, buttons, inputs."),
    headline: face.describe("Account names, page and record titles."),
    mono: face.describe("IDs (did:plc:…), hashes, code."),
    numeral: face.describe("The big counters on an account's overview."),
    label: face.describe("Small uppercase labels above sections."),
  }),
  headlineWeight: z.number().describe("Weight for h2–h4 and section titles, 300–800."),
  headlineStrongWeight: z.number().describe("Weight for the largest names and h1, 300–800."),
  radius: z.number().describe("Base corner radius in px for cards, fields and buttons, 0–16."),
  shadows: z.enum(["none", "soft", "crisp", "hard"]),
  backdrop: z.enum(["none", "dots", "glow", "grain"]),
  light: Palette,
  dark: Palette,
})

export type LookSpecInput = z.infer<typeof LookSpecSchema>

type PaletteKey = keyof LookSpecInput["light"]
const PALETTE_KEYS = Object.keys(Palette.shape) as PaletteKey[]

/** A spec after `normalizeLookSpec`: every value checked and in range. */
export interface LookSpec extends Omit<LookSpecInput, "light" | "dark"> {
  light: Record<PaletteKey, string>
  dark: Record<PaletteKey, string>
}

export class InvalidLookSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidLookSpecError"
  }
}

// ----------------------------------------------------------------- colour

export type Rgb = readonly [number, number, number]

const BLACK: Rgb = [0, 0, 0]
const WHITE: Rgb = [255, 255, 255]

/** #rgb or #rrggbb (any case, surrounding space ignored); null otherwise. */
export function parseHex(value: unknown): Rgb | null {
  if (typeof value !== "string") return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

/** `a` moved toward `b` by `t` (0–1). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
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

/** `fg`, moved toward black (on light backgrounds) or white (on dark) in
 *  small steps until it reaches `min` against every background. */
export function ensureContrast(fg: Rgb, backgrounds: readonly Rgb[], min: number): Rgb {
  const target = luminance(backgrounds[0]) > 0.18 ? BLACK : WHITE
  let out = fg
  for (let t = 0; t <= 1; t += 0.04) {
    out = mix(fg, target, t)
    if (backgrounds.every((bg) => contrast(out, bg) >= min)) return out
  }
  return target
}

// ------------------------------------------------------------- normalise

function clean(text: unknown, max: number): string {
  if (typeof text !== "string") return ""
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim()
}

function snapWeight(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.min(800, Math.max(300, Math.round(n / 100) * 100))
}

function pickFace(value: unknown, allowed: (f: LookFace) => boolean, fallback: LookFace): LookFace {
  return typeof value === "string" && value in LOOK_FACES && allowed(value as LookFace)
    ? (value as LookFace)
    : fallback
}

function normalizePalette(raw: unknown, mode: "light" | "dark"): Record<PaletteKey, string> {
  const source = (raw ?? {}) as Record<string, unknown>
  const c = {} as Record<PaletteKey, Rgb>
  for (const key of PALETTE_KEYS) {
    const rgb = parseHex(source[key])
    if (!rgb) throw new InvalidLookSpecError(`${mode}.${key} is not a #RRGGBB colour`)
    c[key] = rgb
  }
  // Readability floors (WCAG AA, with headroom for the main text).
  const surfaces = [c.canvas, c.elevated]
  c.text = ensureContrast(c.text, surfaces, 7)
  c.textSecondary = ensureContrast(c.textSecondary, surfaces, 4.5)
  c.textMuted = ensureContrast(c.textMuted, surfaces, 4.5)
  c.buttonText = ensureContrast(c.buttonText, [c.button], 4.5)
  c.accent = ensureContrast(c.accent, [c.canvas], 3)
  const out = {} as Record<PaletteKey, string>
  for (const key of PALETTE_KEYS) out[key] = toHex(c[key])
  return out
}

/**
 * Checks and settles a spec from Claude (or from storage): colours must be
 * #RRGGBB (else `InvalidLookSpecError`); faces outside the catalogue or
 * unfit for their role fall back; weights and radius are snapped into
 * range; text colours are pushed to WCAG AA. Idempotent.
 */
export function normalizeLookSpec(raw: unknown, fallbackName = "Your style"): LookSpec {
  if (!raw || typeof raw !== "object") throw new InvalidLookSpecError("no style")
  const r = raw as Partial<Record<keyof LookSpecInput, unknown>>
  const f = (r.faces ?? {}) as Record<string, unknown>

  const text = (x: LookFace) => !DISPLAY_FACES.includes(x)
  const faces = {
    ui: pickFace(f.ui, (x) => text(x) && !MONO_FACES.includes(x), "inter"),
    headline: pickFace(f.headline, (x) => x !== "doto", "noto-serif"),
    mono: pickFace(f.mono, (x) => MONO_FACES.includes(x), "system-mono"),
    numeral: pickFace(f.numeral, () => true, "inter"),
    label: pickFace(f.label, text, "inter"),
  }

  // Instrument Serif comes in one weight.
  const oneWeight = faces.headline === "instrument-serif"
  const radiusRaw = typeof r.radius === "number" && Number.isFinite(r.radius) ? r.radius : 2

  return {
    name: clean(r.name, 32) || fallbackName,
    description: clean(r.description, 120),
    faces,
    headlineWeight: oneWeight ? 400 : snapWeight(r.headlineWeight, 600),
    headlineStrongWeight: oneWeight ? 400 : snapWeight(r.headlineStrongWeight, 700),
    radius: Math.min(16, Math.max(0, Math.round(radiusRaw))),
    shadows: (["none", "soft", "crisp", "hard"] as const).find((s) => s === r.shadows) ?? "soft",
    backdrop: (["none", "dots", "glow", "grain"] as const).find((b) => b === r.backdrop) ?? "none",
    light: normalizePalette(r.light, "light"),
    dark: normalizePalette(r.dark, "dark"),
  }
}

// ------------------------------------------------------------------ tokens

const GRAIN = (rgbChannel: 0 | 1, alpha: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 ${rgbChannel} 0 0 0 0 ${rgbChannel} 0 0 0 0 ${rgbChannel} 0 0 0 ${alpha} 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E")`

function shadowTokens(kind: LookSpec["shadows"], mode: "light" | "dark", text: Rgb) {
  if (kind === "none") return { sm: "none", md: "none", lg: "none" }
  if (kind === "hard") {
    const ink = toHex(text)
    return { sm: `2px 2px 0 ${ink}`, md: `3px 3px 0 ${ink}`, lg: `5px 5px 0 ${ink}` }
  }
  const base = mode === "light" ? text : BLACK
  const a = mode === "light" ? 1 : 5 // dark surfaces need far stronger shadows
  if (kind === "crisp") {
    return {
      sm: `0 1px 2px ${rgba(base, 0.08 * a)}`,
      md: `0 0 0 1px ${rgba(base, Math.min(0.04 * a, 0.3))}, 0 4px 12px ${rgba(base, Math.min(0.1 * a, 0.6))}`,
      lg: `0 0 0 1px ${rgba(base, Math.min(0.04 * a, 0.3))}, 0 12px 32px ${rgba(base, Math.min(0.16 * a, 0.7))}`,
    }
  }
  return {
    sm: `0 1px 1px ${rgba(base, Math.min(0.03 * a, 0.2))}, 0 2px 6px -2px ${rgba(base, Math.min(0.08 * a, 0.5))}`,
    md: `0 1px 1px ${rgba(base, Math.min(0.03 * a, 0.2))}, 0 8px 24px -12px ${rgba(base, Math.min(0.16 * a, 0.7))}`,
    lg: `0 2px 2px ${rgba(base, Math.min(0.04 * a, 0.25))}, 0 18px 40px -16px ${rgba(base, Math.min(0.24 * a, 0.8))}`,
  }
}

function backdropTokens(kind: LookSpec["backdrop"], mode: "light" | "dark", text: Rgb, accent: Rgb) {
  switch (kind) {
    case "dots":
      return {
        image: `radial-gradient(${rgba(text, mode === "light" ? 0.07 : 0.09)} 1px, transparent 1.2px)`,
        size: "11px 11px",
      }
    case "glow":
      return {
        image: `radial-gradient(120% 70% at 50% -20%, ${rgba(accent, mode === "light" ? 0.14 : 0.2)}, transparent 70%)`,
        size: "auto",
      }
    case "grain":
      return { image: mode === "light" ? GRAIN(0, 0.08) : GRAIN(1, 0.06), size: "auto" }
    default:
      return { image: "none", size: "auto" }
  }
}

function modeTokens(spec: LookSpec, mode: "light" | "dark"): Record<string, string> {
  const p = spec[mode]
  const c = Object.fromEntries(PALETTE_KEYS.map((k) => [k, parseHex(p[k]) as Rgb])) as Record<
    PaletteKey,
    Rgb
  >
  // Control borders (checkboxes, fields) need 3:1 against the canvas.
  const control = ensureContrast(mix(c.canvas, c.text, mode === "light" ? 0.45 : 0.35), [c.canvas], 3)
  // The avatar fallback's fill: a faint brand tint the text stays legible on.
  const tint = mix(c.sunken, c.accent, 0.16)
  const shadows = shadowTokens(spec.shadows, mode, c.text)
  const backdrop = backdropTokens(spec.backdrop, mode, c.text, c.accent)
  return {
    "--bg-canvas": toHex(c.canvas),
    "--bg-sunken": toHex(c.sunken),
    "--bg-raised": toHex(mix(c.canvas, c.elevated, 0.5)),
    "--bg-elevated": toHex(c.elevated),
    "--bg-selected": toHex(mix(c.canvas, c.text, 0.07)),
    "--fg-primary": toHex(c.text),
    "--fg-secondary": toHex(c.textSecondary),
    "--fg-muted": toHex(c.textMuted),
    "--border-subtle": rgba(c.text, 0.06),
    "--border-default": toHex(c.border),
    "--border-hover": toHex(mix(c.border, c.text, 0.18)),
    "--border-control": toHex(control),
    "--overlay-weak": rgba(c.text, 0.04),
    "--overlay-medium": rgba(c.text, 0.08),
    "--btn-primary-bg": toHex(c.button),
    "--btn-primary-bg-hover": toHex(mix(c.button, c.buttonText, 0.12)),
    "--btn-primary-fg": toHex(c.buttonText),
    "--color-accent": toHex(c.accent),
    "--color-accent-hover": toHex(mix(c.accent, c.text, 0.2)),
    "--selection-bg": toHex(c.button),
    "--selection-fg": toHex(c.buttonText),
    "--color-surface-container-high": toHex(contrast(c.text, tint) >= 4.5 ? tint : c.sunken),
    "--shadow-sm": shadows.sm,
    "--shadow-md": shadows.md,
    "--shadow-lg": shadows.lg,
    "--look-backdrop": backdrop.image,
    "--look-backdrop-size": backdrop.size,
  }
}

/** The tokens a made style sets: faces, weights and corners for both modes,
 *  then colours, shadows and backdrop per mode. */
export function lookTokens(spec: LookSpec) {
  return {
    modeless: {
      "--font-inter": LOOK_FACES[spec.faces.ui].stack,
      "--font-headline": LOOK_FACES[spec.faces.headline].stack,
      "--font-mono": LOOK_FACES[spec.faces.mono].stack,
      "--font-numeral": LOOK_FACES[spec.faces.numeral].stack,
      "--font-label": LOOK_FACES[spec.faces.label].stack,
      "--weight-headline-strong": String(spec.headlineStrongWeight),
      "--weight-headline": String(spec.headlineWeight),
      "--radius": `${spec.radius}px`,
    },
    light: modeTokens(spec, "light"),
    dark: modeTokens(spec, "dark"),
  }
}

function rule(selectors: string[], tokens: Record<string, string>): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")
  return `${selectors.join(",\n")} {\n${body}\n}`
}

/**
 * The CSS for one made style, in looks.css's shape: on the page
 * (`:root[data-look=id]`) and on its preview tile (`[data-look-preview=id]`),
 * light and dark. `id` must be a `custom-` id (isCustomLookId).
 */
export function buildCustomLookCss(id: string, spec: LookSpec): string {
  if (!/^custom-[a-z0-9]{8}$/.test(id)) throw new InvalidLookSpecError(`bad style id ${id}`)
  const t = lookTokens(spec)
  return [
    rule([`:root[data-look="${id}"]`, `[data-look-preview="${id}"]`], t.modeless),
    rule(
      [`:root[data-look="${id}"]:not([data-theme="dark"])`, `html:not([data-theme="dark"]) [data-look-preview="${id}"]`],
      t.light,
    ),
    rule([`:root[data-look="${id}"][data-theme="dark"]`, `html[data-theme="dark"] [data-look-preview="${id}"]`], t.dark),
  ].join("\n\n")
}
