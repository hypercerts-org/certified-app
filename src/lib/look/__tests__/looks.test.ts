import { describe, it, expect, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  LOOKS,
  LOOK_INIT_SCRIPT,
  LOOK_STORAGE_KEY,
  applyLook,
  currentLook,
  isLookId,
} from "../looks"

const css = (file: string) => readFileSync(join(process.cwd(), "src/app/styles", file), "utf8")
const LOOKS_CSS = css("looks.css")
const TOKENS_CSS = css("tokens.css")

/** The declarations of the first rule whose selector list starts with
 *  `selector` (blocks in these files have no nested braces). */
function block(source: string, selector: string): Record<string, string> {
  const at = source.indexOf(selector)
  if (at === -1) throw new Error(`no rule for ${selector}`)
  const open = source.indexOf("{", at)
  const close = source.indexOf("}", open)
  const body = source.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "")
  const out: Record<string, string> = {}
  for (const decl of body.split(";")) {
    const m = decl.match(/^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+?)\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** Tokens every style sets for itself (and Neutral's preview resets). */
const MODE_TOKENS = [
  "--font-inter",
  "--font-headline",
  "--font-mono",
  "--font-numeral",
  "--font-label",
  "--weight-headline-strong",
  "--weight-headline",
  "--radius",
]
const COLOUR_TOKENS = [
  "--bg-canvas",
  "--bg-sunken",
  "--bg-raised",
  "--bg-elevated",
  "--bg-selected",
  "--fg-primary",
  "--fg-secondary",
  "--fg-muted",
  "--border-subtle",
  "--border-default",
  "--border-hover",
  "--border-control",
  "--overlay-weak",
  "--overlay-medium",
  "--btn-primary-bg",
  "--btn-primary-bg-hover",
  "--btn-primary-fg",
  "--color-accent",
  "--selection-bg",
  "--selection-fg",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
]

beforeEach(() => {
  document.documentElement.removeAttribute("data-look")
  window.localStorage.clear()
})

describe("looks", () => {
  it("knows its styles, Neutral first", () => {
    expect(LOOKS[0].id).toBe("neutral")
    expect(isLookId("linen")).toBe(true)
    expect(isLookId("own")).toBe(false)
    expect(isLookId(null)).toBe(false)
  })

  it("applies a style to <html> and remembers it; Neutral clears both", () => {
    applyLook("stamp")
    expect(document.documentElement.getAttribute("data-look")).toBe("stamp")
    expect(window.localStorage.getItem(LOOK_STORAGE_KEY)).toBe("stamp")
    expect(currentLook()).toBe("stamp")

    applyLook("neutral")
    expect(document.documentElement.hasAttribute("data-look")).toBe(false)
    expect(window.localStorage.getItem(LOOK_STORAGE_KEY)).toBeNull()
    expect(currentLook()).toBe("neutral")
  })

  it("restores a remembered style before paint, and ignores anything unknown", () => {
    window.localStorage.setItem(LOOK_STORAGE_KEY, "glass")
    new Function(LOOK_INIT_SCRIPT)()
    expect(document.documentElement.getAttribute("data-look")).toBe("glass")

    document.documentElement.removeAttribute("data-look")
    for (const value of ["neutral", "evil\" onload=", "own"]) {
      window.localStorage.setItem(LOOK_STORAGE_KEY, value)
      new Function(LOOK_INIT_SCRIPT)()
      expect(document.documentElement.hasAttribute("data-look")).toBe(false)
    }
  })
})

describe("looks.css", () => {
  for (const { id } of LOOKS.filter((l) => l.id !== "neutral")) {
    it(`${id}: sets its faces, weights and corners, and every colour in light and dark`, () => {
      const modeless = block(LOOKS_CSS, `:root[data-look="${id}"],\n[data-look-preview="${id}"]`)
      for (const token of MODE_TOKENS) expect(modeless, token).toHaveProperty(token)

      const light = block(LOOKS_CSS, `:root[data-look="${id}"]:not([data-theme="dark"]),`)
      const dark = block(LOOKS_CSS, `:root[data-look="${id}"][data-theme="dark"],`)
      for (const token of COLOUR_TOKENS) {
        expect(light, `${id} light ${token}`).toHaveProperty(token)
        expect(dark, `${id} dark ${token}`).toHaveProperty(token)
      }
      // A preview must not inherit the active style's backdrop.
      const backdrop = "--look-backdrop" in modeless || ("--look-backdrop" in light && "--look-backdrop" in dark)
      expect(backdrop, `${id} --look-backdrop`).toBe(true)
    })
  }

  for (const { id } of LOOKS.filter((l) => l.id !== "neutral")) {
    it(`${id}: redraws all three centerpieces (avatar, ID card, endorsement)`, () => {
      for (const piece of ["avatar", "id", "endorsement"]) {
        // On the page (skipping previews) and in its own preview.
        expect(LOOKS_CSS, `${id} ${piece}`).toContain(
          `html[data-look="${id}"] [data-centerpiece="${piece}"]:not([data-look-preview] *)`,
        )
        expect(LOOKS_CSS, `${id} ${piece} preview`).toContain(
          `[data-look-preview="${id}"] [data-centerpiece="${piece}"]`,
        )
      }
    })
  }

  it("keeps every floating layer opaque in every style, light and dark", () => {
    // Menus, sheets, toasts and the walkthrough card paint --bg-floating
    // (tokens.css: --bg-elevated unless a style sets it). Text over text is
    // unreadable, so whichever applies must be a solid colour.
    expect(TOKENS_CSS).toMatch(/--bg-floating: var\(--bg-elevated\)/)
    for (const { id } of LOOKS.filter((l) => l.id !== "neutral")) {
      for (const mode of ["light", "dark"] as const) {
        const sel =
          mode === "light"
            ? `:root[data-look="${id}"]:not([data-theme="dark"]),`
            : `:root[data-look="${id}"][data-theme="dark"],`
        const b = block(LOOKS_CSS, sel)
        const surface = b["--bg-floating"] ?? b["--bg-elevated"]
        expect(surface, `${id} ${mode} floating surface`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it("keeps Neutral's preview equal to tokens.css", () => {
    const root = block(TOKENS_CSS, ":root {")
    const rootDark = block(TOKENS_CSS, ':root[data-theme="dark"] {')
    const light = block(LOOKS_CSS, 'html:not([data-theme="dark"]) [data-look-preview="neutral"] {')
    const dark = block(LOOKS_CSS, 'html[data-theme="dark"] [data-look-preview="neutral"] {')
    for (const [token, value] of Object.entries(light)) {
      if (token === "--btn-primary-bg" || token === "--btn-primary-fg") continue // var() aliases in tokens.css
      expect(value, `light ${token}`).toBe(root[token])
    }
    for (const [token, value] of Object.entries(dark)) {
      expect(value, `dark ${token}`).toBe(rootDark[token])
    }
    expect(block(LOOKS_CSS, '[data-look-preview="neutral"] {')["--radius"]).toBe(root["--radius"])
  })
})
