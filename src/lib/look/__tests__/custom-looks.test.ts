import { describe, it, expect, beforeEach } from "vitest"
import { normalizeLookSpec } from "../custom-look-spec"
import {
  MAX_CUSTOM_LOOKS,
  addCustomLook,
  maskKey,
  parseCustomLooks,
  removeCustomLook,
  replaceCustomLook,
  restorePreviousLook,
} from "../custom-looks"
import {
  CUSTOM_LOOKS_CSS_STORAGE_KEY,
  CUSTOM_LOOKS_STORAGE_KEY,
  CUSTOM_LOOKS_STYLE_ID,
  LOOK_INIT_SCRIPT,
  LOOK_STORAGE_KEY,
  applyLook,
  currentLook,
  isCustomLookId,
} from "../looks"

const p = {
  canvas: "#FFFFFF", sunken: "#F2F2F2", elevated: "#FFFFFF", text: "#111111", textSecondary: "#444444",
  textMuted: "#666666", border: "#E0E0E0", accent: "#C70000", button: "#052962", buttonText: "#FFFFFF",
}
const d = {
  canvas: "#121212", sunken: "#0A0A0A", elevated: "#1E1E1E", text: "#F5F5F5", textSecondary: "#CCCCCC",
  textMuted: "#A0A0A0", border: "#333333", accent: "#FF6B6B", button: "#F5F5F5", buttonText: "#121212",
}
/** A stored style in the first version's shape (two palettes), which the
 *  store still reads. */
const spec = (name = "Guardian") =>
  normalizeLookSpec({
    name,
    description: "Guardian red and navy with an editorial serif.",
    faces: { ui: "inter", headline: "noto-serif", mono: "system-mono", numeral: "noto-serif", label: "inter" },
    headlineWeight: 700,
    headlineStrongWeight: 700,
    radius: 0,
    shadows: "none",
    backdrop: "none",
    light: p,
    dark: d,
  })

const styleEl = () => document.getElementById(CUSTOM_LOOKS_STYLE_ID)

beforeEach(() => {
  document.documentElement.removeAttribute("data-look")
  styleEl()?.remove()
  window.localStorage.clear()
})

describe("made styles", () => {
  it("keeps a new style, puts its CSS on the page and switches to it", () => {
    const look = addCustomLook(spec(), "theguardian.com")
    expect(isCustomLookId(look.id)).toBe(true)
    expect(currentLook()).toBe(look.id)
    expect(document.documentElement.getAttribute("data-look")).toBe(look.id)
    expect(window.localStorage.getItem(LOOK_STORAGE_KEY)).toBe(look.id)
    expect(styleEl()?.textContent).toContain(`:root[data-look="${look.id}"]`)
    expect(parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))).toEqual([look])
  })

  it("restores a made style before paint, CSS first", () => {
    const look = addCustomLook(spec(), "theguardian.com")
    styleEl()?.remove()
    document.documentElement.removeAttribute("data-look")

    new Function(LOOK_INIT_SCRIPT)()
    expect(document.documentElement.getAttribute("data-look")).toBe(look.id)
    expect(styleEl()?.textContent).toBe(window.localStorage.getItem(CUSTOM_LOOKS_CSS_STORAGE_KEY))
  })

  it("won't set a made style whose CSS is gone, or a malformed id", () => {
    window.localStorage.setItem(LOOK_STORAGE_KEY, "custom-ab12cd34")
    new Function(LOOK_INIT_SCRIPT)()
    expect(document.documentElement.hasAttribute("data-look")).toBe(false)

    window.localStorage.setItem(CUSTOM_LOOKS_CSS_STORAGE_KEY, '/* "custom-AB12CD34" */')
    window.localStorage.setItem(LOOK_STORAGE_KEY, "custom-AB12CD34")
    new Function(LOOK_INIT_SCRIPT)()
    expect(document.documentElement.hasAttribute("data-look")).toBe(false)
  })

  it("removing the style in use goes back to Neutral", () => {
    const first = addCustomLook(spec("One"), "one.example")
    const second = addCustomLook(spec("Two"), "two.example")
    removeCustomLook(second.id)
    expect(currentLook()).toBe("neutral")
    expect(parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY)).map((l) => l.id)).toEqual([first.id])

    applyLook(first.id)
    removeCustomLook(first.id)
    expect(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(CUSTOM_LOOKS_CSS_STORAGE_KEY)).toBeNull()
    expect(styleEl()).toBeNull()
  })

  it("makes a new version in place, and can go back to the previous one", () => {
    const first = addCustomLook(spec("One"), "theguardian.com", "https://www.theguardian.com/uk")
    expect(first.url).toBe("https://www.theguardian.com/uk")
    expect(first.version).toBe(1)

    const next = replaceCustomLook(first.id, spec("Two"))!
    expect(next.id).toBe(first.id)
    expect(next.version).toBe(2)
    expect(next.spec.name).toBe("Two")
    expect(next.previous?.name).toBe("One")
    expect(currentLook()).toBe(first.id)
    // One tile, its CSS rebuilt.
    const stored = parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))
    expect(stored).toHaveLength(1)
    expect(stored[0].url).toBe("https://www.theguardian.com/uk")

    const back = restorePreviousLook(first.id)!
    expect(back.spec.name).toBe("One")
    expect(back.previous?.name).toBe("Two")
    expect(replaceCustomLook("custom-zzzzzzzz", spec())).toBeNull()
  })

  it("gives an older stored style its site address and version 1", () => {
    const raw = JSON.stringify([{ id: "custom-ab12cd34", source: "a.example", createdAt: "", spec: spec() }])
    const [look] = parseCustomLooks(raw)
    expect(look.url).toBe("https://a.example/")
    expect(look.version).toBe(1)
    expect(look.previous).toBeUndefined()
  })

  it(`keeps at most ${MAX_CUSTOM_LOOKS}, newest first`, () => {
    const made = Array.from({ length: MAX_CUSTOM_LOOKS + 2 }, (_, i) => addCustomLook(spec(`S${i}`), "x.example"))
    const kept = parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))
    expect(kept).toHaveLength(MAX_CUSTOM_LOOKS)
    expect(kept[0].id).toBe(made.at(-1)?.id)
  })

  it("drops stored entries that don't check out", () => {
    const good = { id: "custom-ab12cd34", source: "a.example", createdAt: "", spec: spec() }
    const raw = JSON.stringify([
      good,
      { ...good, id: 'custom-x"]{}' },
      { ...good, id: "custom-zz99zz99", spec: { ...spec(), light: { ...p, canvas: "url(x)" } } },
      "nonsense",
    ])
    expect(parseCustomLooks(raw).map((l) => l.id)).toEqual(["custom-ab12cd34"])
    expect(parseCustomLooks("{not json")).toEqual([])
  })
})

describe("maskKey", () => {
  it("shows only enough to recognise the key", () => {
    expect(maskKey("sk-ant-api03-abcdefghijklmnop-wxyz")).toBe("sk-ant-…wxyz")
    expect(maskKey("short")).toBe("…")
  })
})
