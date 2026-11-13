import * as z from "zod/v4"
import {
  BLACK,
  coloursIn,
  contrast,
  distance,
  ensureContrast,
  lightness,
  luminance,
  oklchToRgb,
  rgbToOklch,
  textOn,
  towardLightness,
  withLightness,
  type Rgb,
} from "./oklch"

export { contrast, ensureContrast, luminance, type Rgb } from "./oklch"

/**
 * A style made from a website: what Claude decides (`LookSpecSchema`), how
 * that is made safe (`normalizeLookSpec`), and the CSS it becomes
 * (`buildCustomLookCss`), in the shape of a built-in style in looks.css:
 * tokens for both modes, a page backdrop, and the three signature pieces
 * every style redraws (the avatar, the ID card, an endorsement).
 *
 * Claude read an untrusted website to make the spec, so nothing it returns
 * reaches CSS as written: colours must parse as #RRGGBB, every design move
 * is a choice from a fixed menu (MOVES) that this file turns into CSS,
 * numbers are clamped, and words never reach the CSS. Colours are worked in
 * OKLCH (oklch.ts): the site's own mode keeps its colours (pushed to WCAG
 * AA by lightness only, so the hue survives), and the other mode is built
 * from the same hues.
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

// ------------------------------------------------------------ the menus

/** Every design move a made style can make, with what each one draws. The
 *  prompt is written from these, so the words and the CSS never drift. */
export const MOVES = {
  backdrop: {
    none: "a plain page",
    dots: "a fine dot grid in the text colour",
    grid: "thin graph-paper lines in the text colour",
    lines: "fine diagonal hatching in the text colour",
    glow: "a soft light of the brand colour from the top of the page",
    mesh: "soft, blurred patches of the two brand colours in the top corners (gradient-heavy, modern product sites)",
    band: "a diagonal band of the two brand colours across the top, fading into the page (like a hero gradient)",
    wash: "the brand colours washing down from the top into the page (atmospheric, photographic sites)",
    grain: "paper-like noise (print, editorial, crafted sites)",
  },
  intensity: { subtle: "barely there", medium: "clearly visible", bold: "a statement; still behind readable content" },
  shadows: {
    none: "flat, borders only",
    soft: "diffuse, layered shadows",
    crisp: "a tight shadow with a hairline ring",
    hard: "solid offset shadows in the text colour (brutalist, playful)",
  },
  avatarShape: { circle: "round", rounded: "softly rounded square", squircle: "app-icon squircle", square: "square, the style's corner" },
  avatarRing: {
    none: "no ring",
    hairline: "a thin hairline",
    brand: "a ring in the brand colour with a gap",
    double: "a double ink ring (stamps, seals, editorial)",
    offset: "a solid offset shadow (brutalist, playful)",
  },
  avatarFill: {
    tint: "initials on a faint brand tint",
    brand: "initials on the solid brand colour",
    gradient: "initials on a gradient of the two brand colours",
    ink: "initials in the page colour on the text colour",
    outline: "initials in the brand colour inside a brand outline",
  },
  avatarInitials: { ui: "the UI face", headline: "the headline face", mono: "the mono face" },
  avatarImage: { natural: "as they are", grayscale: "black and white", contrast: "black and white, high contrast" },
  idSurface: {
    plain: "the card surface",
    tint: "a faint brand tint",
    paper: "a recessed, paper-like surface",
    brand: "the solid brand colour, text in white or ink",
    gradient: "a gradient of the two brand colours, like a premium card",
    ink: "inverted: the text colour as the surface, the page colour as text (a dark pass)",
  },
  idEdge: {
    hairline: "the usual hairline",
    none: "no border",
    "bar-top": "a thick brand bar along the top",
    "bar-left": "a thick brand bar down the left",
    double: "a double rule (documents, certificates)",
    offset: "a solid ink border with an offset shadow (brutalist)",
    dashed: "a dashed border (tickets, coupons, technical)",
  },
  idPattern: {
    none: "no pattern",
    dots: "a dot grid",
    grid: "graph paper",
    lines: "diagonal security hatching",
    rings: "concentric rings from a corner (banknote guilloché)",
    grain: "paper grain",
  },
  idTitle: { plain: "as the app draws it", caps: "small capitals with wide tracking, in the label face", display: "large, in the headline face" },
  idMark: {
    none: "no mark",
    dot: "a small brand dot in the corner",
    seal: "a round double-ring seal in the corner",
    chip: "a small card chip in the brand gradient",
    check: "a check in a brand circle",
  },
  endorsementFrame: {
    row: "rows between hairlines",
    card: "each one a small card",
    rule: "a brand rule down the left",
    tint: "each one on a faint brand tint",
  },
  endorsementWho: { plain: "as the app draws it", caps: "small capitals", headline: "the headline face" },
  endorsementNote: {
    plain: "as the app draws it",
    quote: "an italic quotation in the headline face, with curly quotes",
    marker: "on a highlighter band of the brand colour",
    rule: "set off by a thin brand rule",
  },
  endorsementMark: {
    none: "no mark",
    check: "a brand check before the name",
    dot: "a brand dot before the name",
    stamp: "an \"Endorsed\" stamp after the name",
  },
} as const

type Menu = keyof typeof MOVES
type Choice<M extends Menu> = keyof (typeof MOVES)[M] & string
const keys = <M extends Menu>(m: M) => Object.keys(MOVES[m]) as [string, ...string[]]
const pick = <M extends Menu>(m: M, value: unknown, fallback: Choice<M>): Choice<M> =>
  typeof value === "string" && value in MOVES[m] ? (value as Choice<M>) : fallback
const menu = <M extends Menu>(m: M) => z.enum(keys(m))

/**
 * Each lever's plain options: what a style does when the site gives no
 * reason for more. The first is what an unsupported choice falls back to.
 * Anything else needs evidence from the site (`groundLookSpec`).
 */
export const PLAIN = {
  "backdrop.kind": ["none"],
  shadows: ["soft", "none", "crisp"],
  "avatar.shape": ["circle"],
  "avatar.ring": ["hairline", "none"],
  "avatar.fill": ["tint"],
  "avatar.initials": ["ui"],
  "avatar.image": ["natural"],
  "idCard.surface": ["plain"],
  "idCard.edge": ["hairline", "none"],
  "idCard.pattern": ["none"],
  "idCard.title": ["plain"],
  "idCard.mark": ["none"],
  "endorsement.frame": ["row"],
  "endorsement.who": ["plain"],
  "endorsement.note": ["plain"],
  "endorsement.mark": ["none"],
} as const

export type Lever = keyof typeof PLAIN
export const LEVERS = Object.keys(PLAIN) as [Lever, ...Lever[]]

// ----------------------------------------------------------------- schema

const hex = z.string().describe("#RRGGBB")

const ColorsSchema = z.object({
  siteMode: z.enum(["light", "dark"]).describe("Whether the site itself is light or dark."),
  background: hex.describe("The site's page background (#RRGGBB)."),
  surface: hex.describe("The site's cards and panels (#RRGGBB); the background again if it has none."),
  text: hex.describe("The site's main text colour (#RRGGBB)."),
  muted: hex.describe("The site's secondary, muted text (#RRGGBB)."),
  border: hex.describe("The site's hairlines and borders (#RRGGBB)."),
  primary: hex.describe("The brand colour people associate with the site (#RRGGBB)."),
  secondary: hex.describe(
    "A second brand colour, used with the first in gradients and marks (#RRGGBB); the primary again if there is only one.",
  ),
  buttons: z
    .enum(["brand", "ink"])
    .describe("The site's main buttons: brand = the brand colour; ink = the text colour (black on white, white on black)."),
  neutrals: z
    .enum(["neutral", "warm", "cool", "brand"])
    .describe("How the greys of the mode the app builds lean: plain, warm, cool, or tinted with the brand hue."),
  otherMode: z
    .object({ background: hex, surface: hex, text: hex })
    .nullable()
    .describe("Only if the site has its own scheme for the other mode: its background, surface and text. Otherwise null."),
})

/** What Claude returns. Kept loose where the API's schema support is
 *  (no string patterns or number ranges); `normalizeLookSpec` enforces. */
export const LookSpecSchema = z.object({
  signature: z
    .array(z.string())
    .describe("Two to four short phrases: the things someone would recognise the site by, all visible in the digest."),
  evidence: z
    .array(
      z.object({
        lever: z.enum(LEVERS),
        choice: z.string(),
        quote: z
          .string()
          .describe("Copied exactly from the digest (or the person's request): the CSS value, property, class name or count that shows the site does this."),
      }),
    )
    .describe("One entry for every lever set to anything but a plain option."),
  name: z.string().describe("The brand or site name as people say it, at most 24 characters."),
  description: z
    .string()
    .describe("One plain sentence, at most 90 characters: what the style takes from the site."),
  colors: ColorsSchema,
  faces: z.object({
    ui: z.enum(FACE_IDS).describe("Body text, buttons, inputs."),
    headline: z.enum(FACE_IDS).describe("Account names, page and record titles."),
    mono: z.enum(FACE_IDS).describe("IDs (did:plc:…), hashes, code."),
    numeral: z.enum(FACE_IDS).describe("The big counters on an account's overview."),
    label: z.enum(FACE_IDS).describe("Small uppercase labels above sections."),
  }),
  headlineWeight: z.number().describe("Weight for h2–h4 and section titles, 300–800."),
  headlineStrongWeight: z.number().describe("Weight for the largest names and h1, 300–800."),
  radius: z.number().describe("Base corner radius in px for cards, fields and buttons, 0–16."),
  shadows: menu("shadows"),
  backdrop: z.object({ kind: menu("backdrop"), intensity: menu("intensity") }),
  avatar: z.object({
    shape: menu("avatarShape"),
    ring: menu("avatarRing"),
    fill: menu("avatarFill"),
    initials: menu("avatarInitials"),
    image: menu("avatarImage"),
  }),
  idCard: z.object({
    surface: menu("idSurface"),
    edge: menu("idEdge"),
    pattern: menu("idPattern"),
    title: menu("idTitle"),
    mark: menu("idMark"),
  }),
  endorsement: z.object({
    frame: menu("endorsementFrame"),
    who: menu("endorsementWho"),
    note: menu("endorsementNote"),
    mark: menu("endorsementMark"),
  }),
})

export type LookSpecInput = z.infer<typeof LookSpecSchema>

const PALETTE_KEYS = [
  "canvas",
  "sunken",
  "elevated",
  "text",
  "textSecondary",
  "textMuted",
  "border",
  "accent",
  "secondary",
  "button",
  "buttonText",
] as const
type PaletteKey = (typeof PALETTE_KEYS)[number]
type Palette = Record<PaletteKey, string>
type Mode = "light" | "dark"

/** A spec after `normalizeLookSpec`: every value checked and in range, both
 *  modes' colours worked out. What is stored and compiled. */
export interface LookSpec {
  version: 2
  name: string
  description: string
  signature: string[]
  faces: Record<"ui" | "headline" | "mono" | "numeral" | "label", LookFace>
  headlineWeight: number
  headlineStrongWeight: number
  radius: number
  shadows: Choice<"shadows">
  backdrop: { kind: Choice<"backdrop">; intensity: Choice<"intensity"> }
  avatar: {
    shape: Choice<"avatarShape">
    ring: Choice<"avatarRing">
    fill: Choice<"avatarFill">
    initials: Choice<"avatarInitials">
    image: Choice<"avatarImage">
  }
  idCard: {
    surface: Choice<"idSurface">
    edge: Choice<"idEdge">
    pattern: Choice<"idPattern">
    title: Choice<"idTitle">
    mark: Choice<"idMark">
  }
  endorsement: {
    frame: Choice<"endorsementFrame">
    who: Choice<"endorsementWho">
    note: Choice<"endorsementNote">
    mark: Choice<"endorsementMark">
  }
  light: Palette
  dark: Palette
}

export class InvalidLookSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidLookSpecError"
  }
}

// ----------------------------------------------------------------- colour

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

/** `a` moved toward `b` by `t` (0–1), in sRGB. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
}

function need(raw: unknown, field: string): Rgb {
  const rgb = parseHex(raw)
  if (!rgb) throw new InvalidLookSpecError(`${field} is not a #RRGGBB colour`)
  return rgb
}

interface Base {
  canvas: Rgb
  surface: Rgb
  text: Rgb
  muted?: Rgb
  border?: Rgb
  primary: Rgb
  secondary: Rgb
}

export const modeOf = (canvas: Rgb): Mode => (lightness(canvas) < 0.5 ? "dark" : "light")

/** A mode's palette from its anchors: the anchors kept where they work,
 *  everything else derived, text pushed to WCAG AA by lightness. */
function paletteFrom(mode: Mode, b: Base, buttons: "brand" | "ink"): Record<PaletteKey, Rgb> {
  const canvas = b.canvas
  const cl = lightness(canvas)
  let elevated = b.surface
  const el = lightness(elevated)
  // Cards lift off the page: lighter in dark mode, never darker in light.
  if (mode === "dark" && el < cl + 0.025) elevated = withLightness(canvas, cl + 0.05)
  if (mode === "light" && el < cl - 0.02) elevated = canvas
  const sunken = withLightness(canvas, cl - (mode === "light" ? 0.035 : 0.03))
  const surfaces = [canvas, elevated]
  const text = ensureContrast(b.text, surfaces, 7)
  const textSecondary = ensureContrast(towardLightness(text, canvas, 0.24), surfaces, 4.5)
  const textMuted = ensureContrast(b.muted ?? towardLightness(text, canvas, 0.42), surfaces, 4.5)
  const borderOk = b.border && contrast(b.border, canvas) >= 1.12 && contrast(b.border, canvas) <= 2.2
  const border = borderOk ? (b.border as Rgb) : withLightness(canvas, cl + (mode === "light" ? -0.09 : 0.13))
  const accent = ensureContrast(b.primary, [canvas], 3)
  const secondary = b.secondary
  const button = buttons === "brand" ? accent : text
  const buttonText = textOn([button])
  return { canvas, sunken, elevated, text, textSecondary, textMuted, border, accent, secondary, button, buttonText }
}

/** The greys of a mode the app builds, as hue and chroma. */
function tone(b: Base, neutrals: string): { h: number; c: number } {
  const bg = rgbToOklch(b.canvas)
  const pr = rgbToOklch(b.primary)
  switch (neutrals) {
    case "warm":
      return { h: 70, c: 0.012 }
    case "cool":
      return { h: 255, c: 0.014 }
    case "brand":
      return { h: pr.h, c: Math.min(0.035, Math.max(0.014, pr.c * 0.22)) }
    default:
      return { h: bg.c > 0.004 ? bg.h : pr.h, c: Math.min(bg.c, 0.008) }
  }
}

/** Anchors for the mode the site doesn't have, from the one it does. */
function derivedBase(site: Base, target: Mode, neutrals: string): Base {
  const { h, c } = tone(site, neutrals)
  const n = (l: number, k = 1) => oklchToRgb({ l, c: c * k, h })
  const shift = (color: Rgb) => {
    const o = rgbToOklch(color)
    // Brand colours keep hue and chroma; only their lightness moves, and
    // only as far as the new page needs.
    const l = target === "dark" ? Math.max(o.l, 0.68) : Math.min(o.l, 0.58)
    return oklchToRgb({ ...o, l })
  }
  return target === "dark"
    ? {
        canvas: n(0.19),
        surface: n(0.235, 1.1),
        text: n(0.955, 0.4),
        muted: n(0.72, 0.6),
        border: n(0.33),
        primary: shift(site.primary),
        secondary: shift(site.secondary),
      }
    : {
        canvas: n(0.985, 0.5),
        surface: n(0.998, 0.2),
        text: n(0.21, 0.8),
        muted: n(0.5, 0.7),
        border: n(0.9, 0.6),
        primary: shift(site.primary),
        secondary: shift(site.secondary),
      }
}

/** Both modes' palettes from the site's anchors (Claude's `colors`). */
export function derivePalettes(raw: Record<string, unknown>): { light: Palette; dark: Palette } {
  const site: Base = {
    canvas: need(raw.background, "colors.background"),
    surface: need(raw.surface, "colors.surface"),
    text: need(raw.text, "colors.text"),
    muted: need(raw.muted, "colors.muted"),
    border: parseHex(raw.border) ?? undefined,
    primary: need(raw.primary, "colors.primary"),
    secondary: parseHex(raw.secondary) ?? need(raw.primary, "colors.primary"),
  }
  // The page colour decides the mode, whatever the label says.
  const siteMode = modeOf(site.canvas)
  const otherMode: Mode = siteMode === "light" ? "dark" : "light"
  const buttons = raw.buttons === "brand" ? "brand" : "ink"
  const neutrals = typeof raw.neutrals === "string" ? raw.neutrals : "neutral"

  let otherBase = derivedBase(site, otherMode, neutrals)
  const o = raw.otherMode && typeof raw.otherMode === "object" ? (raw.otherMode as Record<string, unknown>) : null
  const ob = o ? parseHex(o.background) : null
  const os = o ? parseHex(o.surface) : null
  const ot = o ? parseHex(o.text) : null
  if (ob && os && ot && modeOf(ob) === otherMode) {
    otherBase = { ...otherBase, canvas: ob, surface: os, text: ot, muted: undefined, border: undefined }
  }
  const toHexes = (p: Record<PaletteKey, Rgb>) =>
    Object.fromEntries(PALETTE_KEYS.map((k) => [k, toHex(p[k])])) as Palette
  const sitePalette = toHexes(paletteFrom(siteMode, site, buttons))
  const otherPalette = toHexes(paletteFrom(otherMode, otherBase, buttons))
  return siteMode === "light"
    ? { light: sitePalette, dark: otherPalette }
    : { light: otherPalette, dark: sitePalette }
}

/** A stored palette (or a first-version one) re-checked: colours parse,
 *  text keeps its floors. Idempotent. */
function recheckPalette(raw: unknown, mode: Mode): Palette {
  const src = (raw ?? {}) as Record<string, unknown>
  const c = {} as Record<PaletteKey, Rgb>
  for (const key of PALETTE_KEYS) {
    if (key === "secondary") continue
    c[key] = need(src[key], `${mode}.${key}`)
  }
  c.secondary = parseHex(src.secondary) ?? c.accent
  const surfaces = [c.canvas, c.elevated]
  c.text = ensureContrast(c.text, surfaces, 7)
  c.textSecondary = ensureContrast(c.textSecondary, surfaces, 4.5)
  c.textMuted = ensureContrast(c.textMuted, surfaces, 4.5)
  c.buttonText = ensureContrast(c.buttonText, [c.button], 4.5)
  c.accent = ensureContrast(c.accent, [c.canvas], 3)
  return Object.fromEntries(PALETTE_KEYS.map((k) => [k, toHex(c[k])])) as Palette
}

// ---------------------------------------------------------------- ground

// Quotes, whitespace and JSON's escaping backslashes don't count: the
// sources are JSON text, where a font family reads \"Work Sans\".
const forMatch = (text: string) => text.toLowerCase().replace(/["'`\s\\]/g, "")

function getAt(o: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o)
}

function setAt(o: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".")
  let cur = o
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

/**
 * Holds a spec from Claude to the website it was made from, so nothing in
 * the style is invented:
 * - every lever set to anything but a plain option (PLAIN) needs an
 *   evidence quote that is really there, in the digest or the person's
 *   request (`sources`); without one it falls back to plain;
 * - every colour is snapped to the nearest colour the site uses
 *   (`siteColours`); a second brand colour the site doesn't have becomes
 *   the first.
 * Returns the grounded spec (still to be normalised) and what was dropped.
 */
export function groundLookSpec(
  raw: unknown,
  { sources, siteColours }: { sources: string[]; siteColours: Rgb[] },
): { spec: Record<string, unknown>; dropped: string[] } {
  const spec = JSON.parse(JSON.stringify(raw ?? {})) as Record<string, unknown>
  const dropped: string[] = []
  const corpus = sources.map(forMatch).join("\n")
  const evidence = (Array.isArray(spec.evidence) ? spec.evidence : []) as Record<string, unknown>[]
  const supported = (lever: string, choice: unknown) =>
    evidence.some((e) => {
      if (e.lever !== lever || e.choice !== choice || typeof e.quote !== "string") return false
      const quote = forMatch(e.quote)
      return quote.length >= 5 && corpus.includes(quote)
    })

  for (const lever of LEVERS) {
    const value = getAt(spec, lever)
    const plain = PLAIN[lever] as readonly string[]
    if (typeof value === "string" && plain.includes(value)) continue
    if (supported(lever, value)) continue
    setAt(spec, lever, plain[0])
    dropped.push(`${lever}: ${String(value)}`)
  }

  const c = spec.colors && typeof spec.colors === "object" ? (spec.colors as Record<string, unknown>) : null
  if (c && siteColours.length) {
    const nearest = (hex: unknown) => {
      const rgb = parseHex(hex)
      if (!rgb) return null
      let best = siteColours[0]
      let d = Infinity
      for (const sc of siteColours) {
        const dd = distance(rgb, sc)
        if (dd < d) {
          d = dd
          best = sc
        }
      }
      return { hex: toHex(best), d }
    }
    for (const key of ["background", "surface", "text", "muted", "border", "primary"]) {
      const n = nearest(c[key])
      if (!n) continue
      if (n.d > 0.02) dropped.push(`colors.${key}: ${String(c[key])} → ${n.hex}`)
      c[key] = n.hex
    }
    const sec = nearest(c.secondary)
    if (!sec || sec.d > 0.1) {
      dropped.push(`colors.secondary: ${String(c.secondary)} (not on the site)`)
      c.secondary = c.primary
    } else {
      c.secondary = sec.hex
    }
    if (c.otherMode && typeof c.otherMode === "object") {
      const o = c.otherMode as Record<string, unknown>
      for (const key of ["background", "surface", "text"]) {
        const n = nearest(o[key])
        if (n) o[key] = n.hex
      }
    }
  }
  return { spec, dropped }
}

/** The colours a digest mentions anywhere: the site's palette. */
export function siteColoursOf(digestJson: string): Rgb[] {
  const seen = new Set<string>()
  const out: Rgb[] = []
  for (const rgb of coloursIn(digestJson)) {
    const key = rgb.join(",")
    if (!seen.has(key)) {
      seen.add(key)
      out.push(rgb)
    }
  }
  return out
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

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})

/**
 * Checks and settles a spec from Claude, or from storage (including the
 * first version, which had palettes and no signature pieces): colours must
 * be #RRGGBB (else `InvalidLookSpecError`); faces outside the catalogue or
 * unfit for their role fall back; every move is a menu choice or its
 * default; numbers are snapped into range; text meets WCAG AA. Idempotent.
 */
export function normalizeLookSpec(raw: unknown, fallbackName = "Your style"): LookSpec {
  if (!raw || typeof raw !== "object") throw new InvalidLookSpecError("no style")
  const r = raw as Record<string, unknown>
  const f = obj(r.faces)

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

  // Colours: from the site's anchors (Claude), or the stored palettes.
  const palettes =
    r.colors && typeof r.colors === "object"
      ? derivePalettes(obj(r.colors))
      : { light: recheckPalette(r.light, "light"), dark: recheckPalette(r.dark, "dark") }

  // The first version stored the backdrop as a plain kind.
  const bd = typeof r.backdrop === "string" ? { kind: r.backdrop, intensity: "medium" } : obj(r.backdrop)
  const av = obj(r.avatar)
  const id = obj(r.idCard)
  const en = obj(r.endorsement)

  return {
    version: 2,
    name: clean(r.name, 32) || fallbackName,
    description: clean(r.description, 120),
    signature: (Array.isArray(r.signature) ? r.signature : [])
      .map((s) => clean(s, 60))
      .filter(Boolean)
      .slice(0, 4),
    faces,
    headlineWeight: oneWeight ? 400 : snapWeight(r.headlineWeight, 600),
    headlineStrongWeight: oneWeight ? 400 : snapWeight(r.headlineStrongWeight, 700),
    radius: Math.min(16, Math.max(0, Math.round(radiusRaw))),
    shadows: pick("shadows", r.shadows, "soft"),
    backdrop: { kind: pick("backdrop", bd.kind, "none"), intensity: pick("intensity", bd.intensity, "medium") },
    avatar: {
      shape: pick("avatarShape", av.shape, "circle"),
      ring: pick("avatarRing", av.ring, "hairline"),
      fill: pick("avatarFill", av.fill, "tint"),
      initials: pick("avatarInitials", av.initials, "ui"),
      image: pick("avatarImage", av.image, "natural"),
    },
    idCard: {
      surface: pick("idSurface", id.surface, "plain"),
      edge: pick("idEdge", id.edge, "hairline"),
      pattern: pick("idPattern", id.pattern, "none"),
      title: pick("idTitle", id.title, "plain"),
      mark: pick("idMark", id.mark, "none"),
    },
    endorsement: {
      frame: pick("endorsementFrame", en.frame, "row"),
      who: pick("endorsementWho", en.who, "plain"),
      note: pick("endorsementNote", en.note, "plain"),
      mark: pick("endorsementMark", en.mark, "none"),
    },
    light: palettes.light,
    dark: palettes.dark,
  }
}

// ------------------------------------------------------------------ tokens

const GRAIN = (rgbChannel: 0 | 1, alpha: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 ${rgbChannel} 0 0 0 0 ${rgbChannel} 0 0 0 0 ${rgbChannel} 0 0 0 ${Math.round(alpha * 1000) / 1000} 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E")`

function shadowTokens(kind: LookSpec["shadows"], mode: Mode, text: Rgb) {
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

const INTENSITY = { subtle: 0.6, medium: 1, bold: 1.6 } as const

type Colours = Record<PaletteKey, Rgb>

function backdropTokens(spec: LookSpec, mode: Mode, p: Colours) {
  const k = INTENSITY[spec.backdrop.intensity]
  const dark = mode === "dark"
  const a = (x: number) => Math.min(0.6, x * k)
  const { text, accent, secondary } = p
  switch (spec.backdrop.kind) {
    case "dots":
      return { image: `radial-gradient(${rgba(text, a(dark ? 0.09 : 0.07))} 1px, transparent 1.2px)`, size: "12px 12px" }
    case "grid": {
      const line = rgba(text, a(dark ? 0.06 : 0.05))
      return {
        image: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        size: "40px 40px",
      }
    }
    case "lines":
      return {
        image: `repeating-linear-gradient(135deg, ${rgba(text, a(dark ? 0.05 : 0.04))} 0 1px, transparent 1px 14px)`,
        size: "auto",
      }
    case "glow":
      return {
        image: `radial-gradient(120% 70% at 50% -20%, ${rgba(accent, a(dark ? 0.22 : 0.16))}, transparent 70%)`,
        size: "auto",
      }
    case "mesh":
      return {
        image: [
          `radial-gradient(55% 45% at 6% 0%, ${rgba(accent, a(dark ? 0.26 : 0.2))}, transparent 70%)`,
          `radial-gradient(45% 40% at 94% 4%, ${rgba(secondary, a(dark ? 0.24 : 0.18))}, transparent 70%)`,
          `radial-gradient(60% 50% at 50% 110%, ${rgba(accent, a(dark ? 0.1 : 0.07))}, transparent 70%)`,
        ].join(", "),
        size: "auto",
      }
    case "band":
      return {
        image: `linear-gradient(172deg, ${rgba(accent, a(dark ? 0.32 : 0.26))} 0%, ${rgba(secondary, a(dark ? 0.24 : 0.2))} 16%, transparent 34%)`,
        size: "auto",
      }
    case "wash":
      return {
        image: `linear-gradient(180deg, ${rgba(accent, a(dark ? 0.2 : 0.14))} 0%, ${rgba(secondary, a(dark ? 0.08 : 0.06))} 38%, transparent 70%)`,
        size: "auto",
      }
    case "grain":
      return { image: dark ? GRAIN(1, a(0.06)) : GRAIN(0, a(0.08)), size: "auto" }
    default:
      return { image: "none", size: "auto" }
  }
}

/** The ID card's own surface and, on a strong one, the ink that reads on it. */
function idCardTokens(spec: LookSpec, mode: Mode, p: Colours): Record<string, string> {
  const dark = mode === "dark"
  const out: Record<string, string> = {
    "--look-id-pattern": rgba(p.text, dark ? 0.1 : 0.07),
    "--look-id-mark": toHex(p.accent),
    "--look-id-grain": dark ? GRAIN(1, 0.07) : GRAIN(0, 0.09),
    "--look-id-line": toHex(p.border),
  }
  let fg: Rgb | null = null
  switch (spec.idCard.surface) {
    case "tint":
      out["--look-id-surface"] = toHex(mix(p.elevated, p.accent, dark ? 0.14 : 0.08))
      break
    case "paper":
      out["--look-id-surface"] = toHex(p.sunken)
      break
    case "brand":
      out["--look-id-surface"] = toHex(p.accent)
      fg = textOn([p.accent])
      break
    case "gradient": {
      // White or ink, whichever reads better across both ends; the ends
      // move in lightness (hue kept) until it reads.
      fg = textOn([p.accent, p.secondary], 0)
      const a = ensureContrast(p.accent, [fg], 4.5)
      const b = ensureContrast(p.secondary, [fg], 4.5)
      out["--look-id-surface"] = `linear-gradient(135deg, ${toHex(a)} 0%, ${toHex(b)} 100%)`
      break
    }
    case "ink":
      out["--look-id-surface"] = toHex(p.text)
      fg = textOn([p.text])
      break
    default:
      out["--look-id-surface"] = toHex(p.elevated)
  }
  if (fg) {
    out["--look-id-fg"] = toHex(fg)
    out["--look-id-fg-2"] = rgba(fg, 0.88)
    out["--look-id-fg-3"] = rgba(fg, 0.74)
    out["--look-id-line"] = rgba(fg, 0.24)
    out["--look-id-well"] = rgba(fg, 0.14)
    out["--look-id-pattern"] = rgba(fg, 0.14)
    out["--look-id-mark"] = toHex(fg)
    out["--look-id-grain"] = luminance(fg) > 0.5 ? GRAIN(1, 0.08) : GRAIN(0, 0.09)
  }
  return out
}

function modeTokens(spec: LookSpec, mode: Mode): Record<string, string> {
  const pal = spec[mode]
  const p = Object.fromEntries(PALETTE_KEYS.map((k) => [k, parseHex(pal[k]) as Rgb])) as Colours
  const dark = mode === "dark"
  // Control borders (checkboxes, fields) need 3:1 against the canvas.
  const control = ensureContrast(towardLightness(p.canvas, p.text, dark ? 0.35 : 0.45), [p.canvas], 3)
  // The avatar fallback's fill: a faint brand tint the text stays legible on.
  const tint = mix(p.sunken, p.accent, 0.16)
  const shadows = shadowTokens(spec.shadows, mode, p.text)
  const backdrop = backdropTokens(spec, mode, p)
  return {
    "--bg-canvas": toHex(p.canvas),
    "--bg-sunken": toHex(p.sunken),
    "--bg-raised": toHex(mix(p.canvas, p.elevated, 0.5)),
    "--bg-elevated": toHex(p.elevated),
    "--bg-selected": toHex(mix(p.canvas, p.text, 0.07)),
    "--fg-primary": toHex(p.text),
    "--fg-secondary": toHex(p.textSecondary),
    "--fg-muted": toHex(p.textMuted),
    "--border-subtle": rgba(p.text, 0.06),
    "--border-default": toHex(p.border),
    "--border-hover": toHex(mix(p.border, p.text, 0.18)),
    "--border-control": toHex(control),
    "--overlay-weak": rgba(p.text, 0.04),
    "--overlay-medium": rgba(p.text, 0.08),
    "--btn-primary-bg": toHex(p.button),
    "--btn-primary-bg-hover": toHex(mix(p.button, p.buttonText, 0.12)),
    "--btn-primary-fg": toHex(p.buttonText),
    "--color-accent": toHex(p.accent),
    "--color-accent-hover": toHex(mix(p.accent, p.text, 0.2)),
    "--selection-bg": toHex(p.button),
    "--selection-fg": toHex(p.buttonText),
    "--color-surface-container-high": toHex(contrast(p.text, tint) >= 4.5 ? tint : p.sunken),
    "--shadow-sm": shadows.sm,
    "--shadow-md": shadows.md,
    "--shadow-lg": shadows.lg,
    "--look-backdrop": backdrop.image,
    "--look-backdrop-size": backdrop.size,
    // The signature pieces' own colours, outside the app's tokens so a
    // piece that re-scopes those (a brand ID card) still reaches them.
    "--look-accent": toHex(p.accent),
    "--look-secondary": toHex(p.secondary),
    "--look-on-brand": toHex(textOn([p.accent])),
    "--look-on-gradient": toHex(textOn([p.accent, p.secondary])),
    "--look-ink": toHex(p.text),
    "--look-page": toHex(p.canvas),
    "--look-tint": rgba(p.accent, dark ? 0.14 : 0.08),
    "--look-marker": rgba(p.accent, dark ? 0.3 : 0.2),
    "--look-line-strong": rgba(p.text, 0.4),
    ...idCardTokens(spec, mode, p),
  }
}

/** The tokens a made style sets: faces, weights and corners for both modes,
 *  then colours, shadows, backdrop and the pieces' colours per mode. */
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

// --------------------------------------------------------- signature pieces

type Decl = Record<string, string>
type Rules = [selector: string, declarations: Decl][]
type Scope = (piece: "avatar" | "id" | "endorsement", attrs?: string, rest?: string) => string

/** Selectors for one piece of one style, on the page (never inside another
 *  style's preview tile) and in its own preview tile, as looks.css does. */
function scoped(id: string): Scope {
  return (piece, attrs = "", rest = "") =>
    [
      `html[data-look="${id}"] [data-centerpiece="${piece}"]${attrs}:not([data-look-preview] *)${rest}`,
      `[data-look-preview="${id}"] [data-centerpiece="${piece}"]${attrs}${rest}`,
    ].join(",\n")
}

const AVATAR_RADIUS = { circle: "50%", rounded: "24%", squircle: "34%", square: "var(--radius)" } as const

function avatarRules(spec: LookSpec, s: Scope): Rules {
  const a = spec.avatar
  const rules: Rules = []
  const person = '[data-shape="circle"]'
  if (a.shape !== "circle") {
    const r = AVATAR_RADIUS[a.shape]
    rules.push([s("avatar", person), { "border-radius": r }])
    rules.push([s("avatar", person, " :is(img, span, div)"), { "border-radius": r }])
  }
  // The placeholder's ring is an inline gradient behind a padding; a ring
  // choice replaces it (hence !important), then draws its own.
  const ringOff = { background: "transparent !important", padding: "0 !important" }
  switch (a.ring) {
    case "none":
      rules.push([s("avatar", "[data-fallback]"), ringOff])
      break
    case "hairline":
      rules.push([s("avatar", "[data-fallback]"), { background: "var(--border-default) !important", padding: "1px !important" }])
      break
    case "brand":
      rules.push([s("avatar", "[data-fallback]"), ringOff])
      rules.push([s("avatar"), { "box-shadow": "0 0 0 2px var(--look-page), 0 0 0 3.5px var(--look-accent)" }])
      break
    case "double":
      rules.push([s("avatar", "[data-fallback]"), ringOff])
      rules.push([
        s("avatar"),
        { "box-shadow": "0 0 0 1.5px var(--look-ink), 0 0 0 3.5px var(--look-page), 0 0 0 4.5px var(--look-ink)" },
      ])
      break
    case "offset":
      rules.push([s("avatar", "[data-fallback]"), ringOff])
      rules.push([s("avatar"), { "box-shadow": "2px 2px 0 var(--look-ink)", border: "1.5px solid var(--look-ink)" }])
      break
  }
  const inner = s("avatar", "[data-fallback]", " > :first-child")
  switch (a.fill) {
    case "brand":
      rules.push([inner, { background: "var(--look-accent)", color: "var(--look-on-brand)" }])
      break
    case "gradient":
      rules.push([
        inner,
        { background: "linear-gradient(135deg, var(--look-accent), var(--look-secondary))", color: "var(--look-on-gradient)" },
      ])
      break
    case "ink":
      rules.push([inner, { background: "var(--look-ink)", color: "var(--look-page)" }])
      break
    case "outline":
      rules.push([inner, { background: "transparent", "box-shadow": "inset 0 0 0 1.5px var(--look-accent)", color: "var(--look-accent)" }])
      break
  }
  if (a.initials !== "ui") {
    rules.push([inner, { "font-family": a.initials === "headline" ? "var(--font-headline)" : "var(--font-mono)" }])
  }
  if (a.image !== "natural") {
    rules.push([s("avatar", "", " img"), { filter: a.image === "grayscale" ? "grayscale(1)" : "grayscale(1) contrast(1.25)" }])
  }
  return rules
}

const PATTERNS = {
  dots: "radial-gradient(var(--look-id-pattern) 1px, transparent 1.3px) 0 0 / 10px 10px",
  grid: "linear-gradient(var(--look-id-pattern) 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(90deg, var(--look-id-pattern) 1px, transparent 1px) 0 0 / 16px 16px",
  lines: "repeating-linear-gradient(135deg, var(--look-id-pattern) 0 1px, transparent 1px 9px)",
  rings: "repeating-radial-gradient(circle at 100% 0%, var(--look-id-pattern) 0 1px, transparent 1px 8px)",
  grain: "var(--look-id-grain)",
} as const

function idRules(spec: LookSpec, s: Scope): Rules {
  const c = spec.idCard
  const rules: Rules = []
  const card: Decl = { position: "relative", isolation: "isolate", overflow: "hidden" }
  const pattern = c.pattern === "none" ? (c.surface === "paper" ? PATTERNS.grain : null) : PATTERNS[c.pattern]
  if (c.surface !== "plain" || pattern) {
    card.background = pattern ? `${pattern}, var(--look-id-surface)` : "var(--look-id-surface)"
  }
  if (c.surface === "brand" || c.surface === "gradient" || c.surface === "ink") {
    // On a strong surface the card's own text, wells and lines follow the
    // ink that reads on it (as Wallet's pass does).
    Object.assign(card, {
      "--fg-primary": "var(--look-id-fg)",
      "--fg-secondary": "var(--look-id-fg-2)",
      "--fg-muted": "var(--look-id-fg-3)",
      "--bg-sunken": "var(--look-id-well)",
      "--border-subtle": "var(--look-id-line)",
      "--border-default": "var(--look-id-line)",
      "--border-hover": "var(--look-id-line)",
      "--overlay-weak": "var(--look-id-well)",
      "--overlay-medium": "var(--look-id-line)",
      "--focus-ring": "var(--look-id-fg)",
      "--color-accent": "var(--look-id-fg)",
      color: "var(--fg-secondary)",
      "border-color": "transparent",
    })
  }
  switch (c.edge) {
    case "none":
      card["border-color"] = "transparent"
      break
    case "bar-top":
      card["border-top"] = "4px solid var(--look-accent)"
      break
    case "bar-left":
      card["border-left"] = "4px solid var(--look-accent)"
      break
    case "double":
      card.border = "3px double var(--look-line-strong)"
      break
    case "offset":
      card.border = "1.5px solid var(--look-ink)"
      card["box-shadow"] = "5px 5px 0 var(--look-ink)"
      break
    case "dashed":
      card["border-style"] = "dashed"
      card["border-color"] = "var(--look-line-strong)"
      break
  }
  rules.push([s("id"), card])

  const title = s("id", "", ' :is(h2, [data-part="title"])')
  if (c.title === "caps") {
    rules.push([
      title,
      {
        "font-family": "var(--font-label)",
        "font-size": "0.75rem",
        "font-weight": "600",
        "letter-spacing": "0.1em",
        "text-transform": "uppercase",
      },
    ])
  } else if (c.title === "display") {
    rules.push([
      title,
      {
        "font-family": "var(--font-headline)",
        "font-size": "1.375rem",
        "font-weight": "var(--weight-headline-strong)",
        "letter-spacing": "-0.01em",
      },
    ])
  }

  if (c.mark !== "none") {
    // Room for the mark beside the title and its line.
    rules.push([s("id", "", ' :is(h2, [data-part="title"], h2 + p, [data-part="desc"])'), { "padding-right": "40px" }])
    const at: Decl = { content: '""', position: "absolute", top: "14px", right: "14px", "z-index": "1", "pointer-events": "none" }
    const marks: Record<Exclude<LookSpec["idCard"]["mark"], "none">, Decl> = {
      dot: { ...at, width: "10px", height: "10px", "border-radius": "50%", background: "var(--look-id-mark)" },
      seal: {
        ...at,
        top: "10px",
        right: "10px",
        width: "34px",
        height: "34px",
        "border-radius": "50%",
        border: "2px solid var(--look-id-mark)",
        "box-shadow": "inset 0 0 0 3px transparent, inset 0 0 0 4px var(--look-id-mark)",
        opacity: "0.85",
      },
      chip: {
        ...at,
        width: "30px",
        height: "22px",
        "border-radius": "5px",
        background: "linear-gradient(135deg, var(--look-accent), var(--look-secondary))",
        "box-shadow": "inset 0 0 0 1px var(--look-id-line)",
      },
      check: {
        ...at,
        content: '"\\2713"',
        top: "12px",
        right: "12px",
        width: "22px",
        height: "22px",
        "border-radius": "50%",
        background: "var(--look-id-mark)",
        color: "var(--look-page)",
        font: "700 13px/22px var(--font-inter)",
        "text-align": "center",
      },
    }
    rules.push([s("id", "", "::after"), marks[c.mark]])
  }
  return rules
}

function endorsementRules(spec: LookSpec, s: Scope): Rules {
  const e = spec.endorsement
  const rules: Rules = []
  const next = (decl: Decl) => rules.push([s("endorsement", "", ' + [data-centerpiece="endorsement"]'), decl])
  switch (e.frame) {
    case "card":
      rules.push([
        s("endorsement"),
        {
          border: "1px solid var(--border-default)",
          "border-radius": "var(--radius)",
          background: "var(--bg-elevated)",
          "padding-inline": "12px",
        },
      ])
      next({ "margin-top": "8px" })
      break
    case "rule":
      rules.push([s("endorsement"), { "border-left": "3px solid var(--look-accent)", "padding-left": "12px" }])
      break
    case "tint":
      rules.push([
        s("endorsement"),
        {
          background: "var(--look-tint)",
          "border-color": "transparent",
          "border-radius": "var(--radius)",
          "padding-inline": "12px",
        },
      ])
      next({ "margin-top": "6px" })
      break
  }
  const who = s("endorsement", "", ' [data-part="who"]')
  if (e.who === "caps") {
    rules.push([
      who,
      { "font-family": "var(--font-label)", "font-size": "0.75rem", "letter-spacing": "0.08em", "text-transform": "uppercase" },
    ])
  } else if (e.who === "headline") {
    rules.push([who, { "font-family": "var(--font-headline)", "font-weight": "var(--weight-headline)", "font-size": "1rem" }])
  }
  const note = s("endorsement", "", ' [data-part="note"]')
  switch (e.note) {
    case "quote":
      rules.push([note, { "font-family": "var(--font-headline)", "font-style": "italic" }])
      rules.push([s("endorsement", "", ' [data-part="note"]::before'), { content: '"\\201C"' }])
      rules.push([s("endorsement", "", ' [data-part="note"]::after'), { content: '"\\201D"' }])
      break
    case "marker":
      rules.push([
        note,
        { background: "var(--look-marker)", padding: "2px 6px", "border-radius": "var(--radius)", width: "fit-content", "max-width": "100%" },
      ])
      break
    case "rule":
      rules.push([note, { "border-left": "2px solid var(--look-accent)", "padding-left": "10px" }])
      break
  }
  switch (e.mark) {
    case "check":
      rules.push([
        s("endorsement", "", ' [data-part="who"]::before'),
        { content: '"\\2713"', color: "var(--look-accent)", "font-weight": "700", "margin-right": "6px" },
      ])
      break
    case "dot":
      rules.push([
        s("endorsement", "", ' [data-part="who"]::before'),
        {
          content: '""',
          display: "inline-block",
          width: "6px",
          height: "6px",
          "border-radius": "50%",
          background: "var(--look-accent)",
          "margin-right": "6px",
          "vertical-align": "2px",
        },
      ])
      break
    case "stamp":
      rules.push([
        s("endorsement", "", ' [data-part="who"]::after'),
        {
          content: '"Endorsed"',
          display: "inline-block",
          "margin-left": "8px",
          padding: "1px 7px",
          border: "1.5px solid var(--look-accent)",
          "border-radius": "999px",
          font: "500 10px/1.3 var(--font-label)",
          "letter-spacing": "0.08em",
          "text-transform": "uppercase",
          color: "var(--look-accent)",
          transform: "rotate(-5deg)",
          "vertical-align": "1px",
        },
      ])
      break
  }
  return rules
}

function rule(selectors: string[] | string, decl: Decl): string {
  const body = Object.entries(decl)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")
  return `${Array.isArray(selectors) ? selectors.join(",\n") : selectors} {\n${body}\n}`
}

/**
 * The CSS for one made style, in looks.css's shape: tokens on the page
 * (`:root[data-look=id]`) and on its preview tile (`[data-look-preview=id]`),
 * light and dark, then its three signature pieces. `id` must be a `custom-`
 * id (isCustomLookId).
 */
export function buildCustomLookCss(id: string, spec: LookSpec): string {
  if (!/^custom-[a-z0-9]{8}$/.test(id)) throw new InvalidLookSpecError(`bad style id ${id}`)
  const t = lookTokens(spec)
  const s = scoped(id)
  const pieces = [...avatarRules(spec, s), ...idRules(spec, s), ...endorsementRules(spec, s)]
  return [
    rule([`:root[data-look="${id}"]`, `[data-look-preview="${id}"]`], t.modeless),
    rule(
      [`:root[data-look="${id}"]:not([data-theme="dark"])`, `html:not([data-theme="dark"]) [data-look-preview="${id}"]`],
      t.light,
    ),
    rule([`:root[data-look="${id}"][data-theme="dark"]`, `html[data-theme="dark"] [data-look-preview="${id}"]`], t.dark),
    ...pieces.filter(([, d]) => Object.keys(d).length > 0).map(([sel, d]) => rule(sel, d)),
  ].join("\n\n")
}
