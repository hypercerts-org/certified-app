import { describe, it, expect, beforeEach, vi } from "vitest"
import { normalizeLookSpec } from "../custom-look-spec"
import {
  MAX_CUSTOM_LOOKS,
  MAX_LOOK_VERSIONS,
  addCustomLook,
  maskKey,
  parseCustomLooks,
  removeCustomLook,
  deleteLookVersion,
  replaceCustomLook,
  showLookVersion,
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

  it("makes new versions in place and keeps every one to go back to", () => {
    const first = addCustomLook(spec("One"), "theguardian.com", "https://www.theguardian.com/uk")
    expect(first.url).toBe("https://www.theguardian.com/uk")
    expect(first.version).toBe(1)

    const next = replaceCustomLook(first.id, spec("Two"), "Darker")!
    expect(next.id).toBe(first.id)
    expect(next.version).toBe(2)
    expect(next.spec.name).toBe("Two")
    expect(currentLook()).toBe(first.id)
    replaceCustomLook(first.id, spec("Three"))
    // One tile, its CSS rebuilt, three versions kept with what was asked.
    const stored = parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))
    expect(stored).toHaveLength(1)
    expect(stored[0].url).toBe("https://www.theguardian.com/uk")
    expect(stored[0].versions.map((v) => [v.version, v.spec.name, v.request])).toEqual([
      [1, "One", ""],
      [2, "Two", "Darker"],
      [3, "Three", ""],
    ])

    // Any version back on show; a new one is numbered after the highest.
    const back = showLookVersion(first.id, 1)!
    expect(back.version).toBe(1)
    expect(back.spec.name).toBe("One")
    expect(parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))[0].spec.name).toBe("One")
    expect(window.localStorage.getItem(CUSTOM_LOOKS_CSS_STORAGE_KEY)).toContain(first.id)
    expect(replaceCustomLook(first.id, spec("Four"))!.version).toBe(4)

    expect(showLookVersion(first.id, 9)).toBeNull()
    expect(replaceCustomLook("custom-zzzzzzzz", spec())).toBeNull()
  })

  it("deletes one version: the one before goes on show, and the last one takes the style with it", () => {
    const look = addCustomLook(spec("One"), "x.example")
    replaceCustomLook(look.id, spec("Two"))
    replaceCustomLook(look.id, spec("Three"))
    showLookVersion(look.id, 2)
    // Not the one on show: it stays on show.
    expect(deleteLookVersion(look.id, 3)!.spec.name).toBe("Two")
    // The one on show: the one before it.
    const left = deleteLookVersion(look.id, 2)!
    expect(left.version).toBe(1)
    expect(left.versions.map((v) => v.version)).toEqual([1])
    expect(window.localStorage.getItem(CUSTOM_LOOKS_CSS_STORAGE_KEY)).toContain(look.id)
    expect(deleteLookVersion(look.id, 9)).toBeNull()
    // The last one removes the style.
    expect(deleteLookVersion(look.id, 1)).toBeNull()
    expect(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY)).toBeNull()
    expect(currentLook()).not.toBe(look.id)
  })

  it(`keeps at most ${MAX_LOOK_VERSIONS} versions of a style`, () => {
    const look = addCustomLook(spec("V1"), "x.example")
    for (let i = 2; i <= MAX_LOOK_VERSIONS + 3; i++) replaceCustomLook(look.id, spec(`V${i}`))
    const [kept] = parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))
    expect(kept.versions).toHaveLength(MAX_LOOK_VERSIONS)
    expect(kept.versions[0].version).toBe(4)
    expect(kept.version).toBe(MAX_LOOK_VERSIONS + 3)
  })

  it("stores a site image once for all the versions that use it", () => {
    const image = `data:image/webp;base64,${"A".repeat(5000)}`
    const onImage = () => ({ ...spec(), assets: { idImage: { data: image, average: "#0B91C2", busy: 0.1 } } })
    const look = addCustomLook(onImage(), "vivaconagua.org")
    replaceCustomLook(look.id, onImage())
    replaceCustomLook(look.id, onImage())
    const raw = window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY)!
    expect(raw.split(image).length - 1).toBe(1)
    const [kept] = parseCustomLooks(raw)
    expect(kept.versions.map((v) => v.spec.assets?.idImage?.data)).toEqual([image, image, image])
  })

  it("lets old versions go, oldest first, when the browser's storage is full", () => {
    const look = addCustomLook(spec("V1"), "x.example")
    replaceCustomLook(look.id, spec("V2"))
    const storage = window.localStorage
    const setItem = storage.setItem.bind(storage)
    // Full while the style still holds more than two versions.
    const full = vi.spyOn(storage, "setItem").mockImplementation((key: string, value: string) => {
      if (key === CUSTOM_LOOKS_STORAGE_KEY && (JSON.parse(value) as { versions: unknown[] }[])[0].versions.length > 2) {
        throw new DOMException("full", "QuotaExceededError")
      }
      setItem(key, value)
    })
    replaceCustomLook(look.id, spec("V3"))
    full.mockRestore()
    const [kept] = parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))
    expect(kept.versions.map((v) => v.spec.name)).toEqual(["V2", "V3"])
    expect(kept.spec.name).toBe("V3")
  })

  it("reads a style stored before versions were kept: the one on show and the one before", () => {
    const raw = JSON.stringify([
      { id: "custom-ab12cd34", source: "a.example", createdAt: "", version: 3, spec: spec("Three"), previous: spec("Two") },
    ])
    const [look] = parseCustomLooks(raw)
    expect(look.version).toBe(3)
    expect(look.spec.name).toBe("Three")
    expect(look.versions.map((v) => [v.version, v.spec.name])).toEqual([
      [2, "Two"],
      [3, "Three"],
    ])
  })

  it("gives an older stored style its site address and version 1", () => {
    const raw = JSON.stringify([{ id: "custom-ab12cd34", source: "a.example", createdAt: "", spec: spec() }])
    const [look] = parseCustomLooks(raw)
    expect(look.url).toBe("https://a.example/")
    expect(look.version).toBe(1)
    expect(look.versions).toHaveLength(1)
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
