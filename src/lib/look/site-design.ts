/**
 * Reads a website's design out of its HTML and CSS: the digest Claude turns
 * into a style (generate-look.ts). Pure (no fetching; the route does that),
 * so it is tested on fixed input.
 *
 * What it keeps, ranked and capped so the digest stays a few thousand
 * tokens: the colours used for backgrounds, text and borders (light and
 * dark schemes apart), the declarations on html / body / :root, CSS custom
 * properties that look like design tokens, font families, corner radii,
 * shadows, weights, the theme-color meta, and the class names in the HTML
 * that carry design (bg-*, text-*, rounded-* …). `var(--x)` is resolved, so
 * token-based CSS still shows its colours.
 *
 * Everything here is the website's own text, untrusted: the prompt tells
 * Claude it is data, and nothing from it reaches the app's CSS
 * (custom-look-spec.ts rebuilds every value).
 */

export interface Counted {
  value: string
  count: number
}

export interface ColourUse extends Counted {
  /** Where it was used: background, text, border, other. */
  uses: { bg: number; text: number; border: number; other: number }
}

export interface SiteDesign {
  url: string
  title: string | null
  siteName: string | null
  themeColors: { color: string; media: string | null }[]
  colorScheme: string | null
  /** True if the CSS has a dark scheme (media query or a .dark-style class). */
  hasDarkScheme: boolean
  /** Families from Google Fonts links and @font-face rules. */
  webFonts: string[]
  fontFamilies: Counted[]
  pageDeclarations: { selector: string; property: string; value: string; dark: boolean }[]
  colours: { light: ColourUse[]; dark: ColourUse[] }
  customProperties: { name: string; value: string; dark: boolean }[]
  radii: Counted[]
  shadows: Counted[]
  weights: Counted[]
  classNames: Counted[]
  stylesheets: { read: number; failed: number }
}

export interface HtmlParts {
  title: string | null
  siteName: string | null
  themeColors: { color: string; media: string | null }[]
  colorScheme: string | null
  /** Absolute URLs of linked stylesheets, in page order. */
  stylesheetUrls: string[]
  googleFonts: string[]
  inlineCss: string[]
  /** `style=""` attribute contents. */
  styleAttributes: string[]
  classNames: Counted[]
}

// ------------------------------------------------------------------ HTML

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  for (let m = re.exec(tag); m; m = re.exec(tag)) {
    const name = m[1].toLowerCase()
    if (!(name in out)) out[name] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "")
  }
  return out
}

function short(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Family names from a Google Fonts CSS URL (css and css2 APIs). */
export function googleFontFamilies(href: string): string[] {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return []
  }
  if (url.hostname !== "fonts.googleapis.com") return []
  return url.searchParams
    .getAll("family")
    .flatMap((f) => f.split("|"))
    .map((f) => f.split(":")[0].replace(/\+/g, " ").trim())
    .filter(Boolean)
}

/** Design-bearing utility classes (Tailwind and similar). */
const DESIGN_CLASS = /^(?:[a-z0-9-]+:)*-?(?:bg|text|border|rounded|font|shadow|ring|from|via|to|fill|stroke|accent|outline|divide|decoration)(?:-|$)/

export function parseHtml(html: string, baseUrl: string): HtmlParts {
  const head = html.slice(0, 600_000)
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  const parts: HtmlParts = {
    title: title ? short(decodeEntities(title), 120) : null,
    siteName: null,
    themeColors: [],
    colorScheme: null,
    stylesheetUrls: [],
    googleFonts: [],
    inlineCss: [],
    styleAttributes: [],
    classNames: [],
  }

  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0])
    const name = (a.name ?? a.property ?? "").toLowerCase()
    const content = a.content?.trim()
    if (!content) continue
    if (name === "theme-color" && parts.themeColors.length < 4) {
      parts.themeColors.push({ color: short(content, 60), media: a.media ? short(a.media, 80) : null })
    } else if (name === "og:site_name" && !parts.siteName) {
      parts.siteName = short(content, 80)
    } else if (name === "color-scheme" && !parts.colorScheme) {
      parts.colorScheme = short(content, 40)
    }
  }

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attributes(m[0])
    const rel = (a.rel ?? "").toLowerCase().split(/\s+/)
    const isSheet = rel.includes("stylesheet") || (rel.includes("preload") && a.as === "style")
    if (!isSheet || rel.includes("alternate") || !a.href) continue
    let abs: string
    try {
      abs = new URL(a.href, baseUrl).toString()
    } catch {
      continue
    }
    const families = googleFontFamilies(abs)
    if (families.length) {
      parts.googleFonts.push(...families)
      continue
    }
    if (!/^https?:/.test(abs) || parts.stylesheetUrls.includes(abs)) continue
    parts.stylesheetUrls.push(abs)
  }

  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) parts.inlineCss.push(m[1])

  const classCounts = new Map<string, number>()
  const attrRe = /\s(style|class)\s*=\s*("([^"]*)"|'([^']*)')/gi
  for (let m = attrRe.exec(html); m; m = attrRe.exec(html)) {
    const value = decodeEntities(m[3] ?? m[4] ?? "")
    if (m[1].toLowerCase() === "style") {
      if (parts.styleAttributes.length < 400) parts.styleAttributes.push(value)
      continue
    }
    for (const cls of value.split(/\s+/)) {
      if (cls && cls.length <= 60 && DESIGN_CLASS.test(cls)) {
        classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1)
      }
    }
  }
  parts.classNames = top(classCounts, 60)
  parts.googleFonts = [...new Set(parts.googleFonts)].slice(0, 8)
  return parts
}

// ------------------------------------------------------------------- CSS

interface Declaration {
  /** The innermost style rule's selector ("" inside @font-face etc.). */
  selector: string
  atRule: string | null
  property: string
  value: string
  dark: boolean
}

const DARK_PRELUDE = /prefers-color-scheme\s*:\s*dark/i
const DARK_SELECTOR =
  /(?:^|[\s,>+~(])(?:html|:root|body)?(?:\.dark(?:-mode|-theme)?|\.theme-dark|\[data-[a-z-]*(?:theme|mode|scheme)[a-z-]*=["']?dark["']?\])(?=$|[\s,>+~):.[])/i

/** Every declaration in a stylesheet, with the rule and scheme it sits in.
 *  A forgiving scanner, not a full CSS parser: comments and strings are
 *  skipped, nesting is followed by braces. */
export function parseCss(css: string): Declaration[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const out: Declaration[] = []
  const stack: string[] = []
  let buf = ""
  let quote: string | null = null

  const context = () => {
    const selector = [...stack].reverse().find((p) => !p.startsWith("@")) ?? ""
    const atRule = [...stack].reverse().find((p) => p.startsWith("@")) ?? null
    const dark = stack.some((p) => (p.startsWith("@") ? DARK_PRELUDE.test(p) : DARK_SELECTOR.test(p)))
    return { selector, atRule, dark }
  }
  const flush = () => {
    const decl = buf.trim()
    buf = ""
    if (!decl || stack.length === 0) return
    const colon = decl.indexOf(":")
    if (colon <= 0) return
    const property = decl.slice(0, colon).trim().toLowerCase()
    if (!/^(--[\w-]+|-?[a-z][a-z-]*)$/.test(property)) return
    const value = decl
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, "")
      .trim()
    if (value) out.push({ ...context(), property, value })
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      buf += ch
      if (ch === "\\") buf += text[++i] ?? ""
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
    } else if (ch === "{") {
      stack.push(buf.trim().replace(/\s+/g, " "))
      buf = ""
    } else if (ch === "}") {
      flush()
      stack.pop()
    } else if (ch === ";") {
      // A statement at-rule (@import …;) at the top level is not a declaration.
      if (stack.length === 0) buf = ""
      else flush()
    } else {
      buf += ch
    }
  }
  return out
}

// ---------------------------------------------------------------- digest

const COLOUR_RE =
  /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^()]*\)/gi

function normalizeColour(c: string): string {
  const s = c.toLowerCase().replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")")
  const m = /^#([0-9a-f]{3,4})$/.exec(s)
  return m ? `#${m[1].replace(/./g, (x) => x + x)}` : s
}

function top(counts: Map<string, number>, n: number): Counted[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }))
}

function colourRole(property: string): keyof ColourUse["uses"] | null {
  if (property.startsWith("--")) return null
  if (property.startsWith("background")) return "bg"
  if (property === "color") return "text"
  if (property.startsWith("border") || property.startsWith("outline")) return "border"
  if (/shadow/.test(property)) return null
  return "other"
}

const TOKEN_NAME =
  /colou?r|bg|background|fg|foreground|text|surface|canvas|primary|secondary|accent|brand|muted|border|ring|radius|rounded|font|shadow|card|popover|link|button|btn|heading|base|neutral|gray|grey/i

function isPageSelector(selector: string): boolean {
  return selector
    .split(",")
    .some((s) => /^(html|body|:root|:host|html body)(\[[^\]]*\]|\.[\w-]+)*$/i.test(s.trim()))
}

/**
 * The digest of a page: `html` plus the text of its stylesheets (in page
 * order, inline <style> included by the caller or not; this adds them).
 */
export function digestSite(
  url: string,
  html: HtmlParts,
  stylesheets: string[],
  stats: { read: number; failed: number },
): SiteDesign {
  const decls: Declaration[] = []
  for (const sheet of [...stylesheets, ...html.inlineCss]) decls.push(...parseCss(sheet))
  for (const attr of html.styleAttributes) {
    for (const d of parseCss(`[style]{${attr}}`)) decls.push(d)
  }

  // Custom properties, light and dark, for var() resolution.
  const vars = { light: new Map<string, string>(), dark: new Map<string, string>() }
  for (const d of decls) {
    if (!d.property.startsWith("--")) continue
    const scheme = d.dark ? vars.dark : vars.light
    if (!scheme.has(d.property) || isPageSelector(d.selector)) scheme.set(d.property, d.value)
  }
  const resolve = (value: string, dark: boolean, depth = 0): string => {
    if (depth > 4 || !value.includes("var(")) return value
    return resolve(
      value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (all, name, fallback) => {
        const v = (dark ? vars.dark.get(name) : undefined) ?? vars.light.get(name) ?? fallback
        return v === undefined ? all : v
      }),
      dark,
      depth + 1,
    )
  }

  const colourMaps = { light: new Map<string, ColourUse>(), dark: new Map<string, ColourUse>() }
  const families = new Map<string, number>()
  const radii = new Map<string, number>()
  const shadows = new Map<string, number>()
  const weights = new Map<string, number>()
  const fontFaces = new Set<string>()
  const pageDeclarations: SiteDesign["pageDeclarations"] = []
  let hasDarkScheme = false

  for (const d of decls) {
    if (d.dark) hasDarkScheme = true
    if (d.atRule?.toLowerCase().startsWith("@font-face")) {
      if (d.property === "font-family") fontFaces.add(d.value.replace(/["']/g, "").trim())
      continue
    }
    if (d.property.startsWith("--")) continue
    const value = resolve(d.value, d.dark)

    if (
      isPageSelector(d.selector) &&
      /^(background(-color)?|color|font-family|color-scheme)$/.test(d.property) &&
      pageDeclarations.length < 40
    ) {
      pageDeclarations.push({ selector: short(d.selector, 60), property: d.property, value: short(value, 120), dark: d.dark })
    }

    const use = colourRole(d.property)
    if (use) {
      const map = d.dark ? colourMaps.dark : colourMaps.light
      for (const raw of value.replace(/url\([^)]*\)/gi, "").match(COLOUR_RE) ?? []) {
        const c = normalizeColour(raw)
        const entry = map.get(c) ?? { value: c, count: 0, uses: { bg: 0, text: 0, border: 0, other: 0 } }
        entry.count++
        entry.uses[use]++
        map.set(c, entry)
      }
    }
    if (d.property === "font-family") {
      const v = short(value.replace(/["']/g, ""), 120)
      families.set(v, (families.get(v) ?? 0) + 1)
    } else if (/^border(-[a-z]+)*-radius$/.test(d.property)) {
      const v = short(value, 40)
      radii.set(v, (radii.get(v) ?? 0) + 1)
    } else if (d.property === "box-shadow" && value !== "none") {
      const v = short(value, 160)
      shadows.set(v, (shadows.get(v) ?? 0) + 1)
    } else if (d.property === "font-weight") {
      const v = short(value, 20)
      weights.set(v, (weights.get(v) ?? 0) + 1)
    }
  }

  // Token-like custom properties, the page-level ones first.
  const customProperties: SiteDesign["customProperties"] = []
  const seen = new Set<string>()
  const candidates = decls
    .filter((d) => d.property.startsWith("--") && !d.atRule?.toLowerCase().startsWith("@font-face"))
    .sort((a, b) => Number(isPageSelector(b.selector)) - Number(isPageSelector(a.selector)))
  for (const d of candidates) {
    const key = `${d.property}|${d.dark}`
    if (seen.has(key)) continue
    const value = resolve(d.value, d.dark)
    const meaningful = COLOUR_RE.test(value) || TOKEN_NAME.test(d.property)
    COLOUR_RE.lastIndex = 0
    if (!meaningful || value.length > 160) continue
    seen.add(key)
    customProperties.push({ name: short(d.property, 60), value: short(value, 100), dark: d.dark })
    if (customProperties.length >= 140) break
  }

  const rank = (m: Map<string, ColourUse>, n: number) =>
    [...m.values()].sort((a, b) => b.count - a.count).slice(0, n)

  return {
    url,
    title: html.title,
    siteName: html.siteName,
    themeColors: html.themeColors,
    colorScheme: html.colorScheme,
    hasDarkScheme,
    webFonts: [...new Set([...html.googleFonts, ...fontFaces])].slice(0, 12),
    fontFamilies: top(families, 15),
    pageDeclarations,
    colours: { light: rank(colourMaps.light, 40), dark: rank(colourMaps.dark, 24) },
    customProperties,
    radii: top(radii, 12),
    shadows: top(shadows, 8),
    weights: top(weights, 10),
    classNames: html.classNames,
    stylesheets: stats,
  }
}

// ------------------------------------------------------------------- URL

/**
 * The URL to read for what a person typed: "example.com" becomes
 * https://example.com/. Only http(s) on the default ports, with a dotted
 * host and no credentials; null otherwise. (Private and local addresses
 * are refused at connect time by guardedFetch.)
 */
export function normalizeSiteUrl(input: string | null | undefined): URL | null {
  const raw = (input ?? "").trim()
  if (!raw || raw.length > 2048 || /\s/.test(raw)) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password) return null
  if (url.port && url.port !== "80" && url.port !== "443") return null
  const host = url.hostname
  if (!host.includes(".") || host.endsWith(".") || host.endsWith(".local") || host.endsWith(".internal")) {
    return null
  }
  url.hash = ""
  return url
}
