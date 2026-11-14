import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { normalizeLookSpec } from "@/lib/look/custom-look-spec"
import { CLAUDE_KEY_STORAGE_KEY, addCustomLook, parseCustomLooks, replaceCustomLook } from "@/lib/look/custom-looks"
import { CUSTOM_LOOKS_STORAGE_KEY } from "@/lib/look/looks"

const generate = vi.fn()
vi.mock("@/lib/look/generate-look", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/look/generate-look")>()),
  generateLookSpec: (...args: unknown[]) => generate(...args),
}))

const { default: CustomLookMaker } = await import("../custom-look-maker")
const { default: LookPicker } = await import("../look-picker")
const { LookRunProvider } = await import("../look-run")

/** Settings → Appearance: the gallery above the maker, sharing one run. */
const renderAppearance = () =>
  render(
    <LookRunProvider>
      <LookPicker />
      <CustomLookMaker />
    </LookRunProvider>,
  )

const palette = {
  canvas: "#FFFFFF", sunken: "#F2F2F2", elevated: "#FFFFFF", text: "#111111", textSecondary: "#444444",
  textMuted: "#666666", border: "#E0E0E0", accent: "#C70000", button: "#052962", buttonText: "#FFFFFF",
}
const dark = { ...palette, canvas: "#121212", sunken: "#0A0A0A", elevated: "#1E1E1E", text: "#F5F5F5", textSecondary: "#CCCCCC", textMuted: "#A0A0A0", border: "#333333", button: "#F5F5F5", buttonText: "#121212" }
const spec = (name: string, notes: string[] = []) => normalizeLookSpec({ name, notes, light: palette, dark })
/** What generateLookSpec resolves to: the style and what the app took back. */
const made = (name: string, notes: string[] = [], caveats: string[] = []) => ({ spec: spec(name, notes), caveats })

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(CLAUDE_KEY_STORAGE_KEY, "sk-ant-api03-test-key-abcd")
  generate.mockReset()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ design: { url: "https://www.theguardian.com/" } }), { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute("data-look")
})

describe("Made styles in the gallery: a new version", () => {
  it("asks what to change, sends the previous version and the request, and offers the way back", async () => {
    const look = addCustomLook(spec("Guardian"), "theguardian.com", "https://www.theguardian.com/")
    generate.mockResolvedValue(made("Guardian, darker"))
    renderAppearance()

    fireEvent.click(screen.getByRole("button", { name: "New version of Guardian" }))
    // jsdom's <dialog> isn't "open" to the accessibility tree; query inside it.
    const field = screen.getByLabelText("What should change? (optional)", { selector: "textarea" })
    fireEvent.change(field, { target: { value: "Make the ID card darker" } })
    fireEvent.click(screen.getByRole("button", { name: "Make new version", hidden: true }))

    await waitFor(() => expect(generate).toHaveBeenCalled())
    const args = generate.mock.calls[0][0]
    expect(args.request).toBe("Make the ID card darker")
    expect(args.previous.name).toBe("Guardian")
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain(encodeURIComponent("https://www.theguardian.com/"))

    await screen.findByText(/Made version 2 of/)
    const stored = parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))
    expect(stored[0].id).toBe(look.id)
    expect(stored[0].spec.name).toBe("Guardian, darker")

    fireEvent.click(screen.getByRole("button", { name: "Back to the previous version" }))
    expect(parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))[0].spec.name).toBe("Guardian")
  })

  it("makes the style from the screenshots when the site refuses the CSS read", async () => {
    const look = addCustomLook(spec("Guardian"), "theguardian.com", "https://www.theguardian.com/")
    generate.mockResolvedValue(made("Guardian, from screenshots"))
    const capture = {
      url: "https://www.theguardian.com/",
      screenshots: [{ label: "Desktop", mediaType: "image/jpeg", data: "AAAA" }],
      logo: null,
      shareImage: null,
      computed: [],
      visibleColours: [{ hex: "#052962", share: 0.4 }],
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.startsWith("/api/looks/site-capture")
          ? new Response(JSON.stringify({ capture }), { status: 200 })
          : new Response(JSON.stringify({ error: "The website answered with an error (403)." }), { status: 502 }),
      ),
    )
    renderAppearance()
    fireEvent.click(screen.getByRole("button", { name: "New version of Guardian" }))
    fireEvent.click(screen.getByRole("button", { name: "Make new version", hidden: true }))

    await waitFor(() => expect(generate).toHaveBeenCalled())
    const args = generate.mock.calls[0][0]
    expect(args.capture.visibleColours[0].hex).toBe("#052962")
    expect(args.design.url).toBe("https://www.theguardian.com/")
    expect(args.design.colours.light).toEqual([])
    await screen.findByText(/Made version 2 of/)
    expect(parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))[0].id).toBe(look.id)
  })

  it("can't make a new version without a key", () => {
    window.localStorage.removeItem(CLAUDE_KEY_STORAGE_KEY)
    addCustomLook(spec("Guardian"), "theguardian.com")
    renderAppearance()
    expect(screen.getByRole("button", { name: "New version of Guardian" })).toBeDisabled()
  })
})

describe("Made styles in the gallery", () => {
  it("are tiles marked as made in this browser, with no separate list in the maker", () => {
    addCustomLook(spec("Guardian"), "theguardian.com", "https://www.theguardian.com/")
    const { container } = renderAppearance()
    const tile = screen.getByRole("radio", { name: "Guardian" })
    expect(tile).toHaveAccessibleDescription(/Made in this browser/)
    expect(container.querySelectorAll("ul")).toHaveLength(0)
  })

  it("pick between their versions once there are two", () => {
    const look = addCustomLook(spec("Guardian"), "theguardian.com", "https://www.theguardian.com/")
    renderAppearance()
    expect(screen.queryByRole("combobox", { name: "Version of Guardian" })).toBeNull()

    act(() => {
      replaceCustomLook(look.id, spec("Guardian, darker"), "Darker")
    })
    const picker = screen.getByRole("combobox", { name: "Version of Guardian, darker" })
    expect(picker).toHaveValue("2")
    expect(Array.from((picker as HTMLSelectElement).options, (o) => o.text)).toEqual(["Version 2", "Version 1"])

    fireEvent.change(picker, { target: { value: "1" } })
    expect(screen.getByRole("radio", { name: "Guardian" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("combobox", { name: "Version of Guardian" })).toHaveValue("1")
    expect(document.documentElement.getAttribute("data-look")).toBe(look.id)
  })

  it("can be removed from the gallery, and the style goes back to Neutral if it was on", () => {
    const look = addCustomLook(spec("Guardian"), "theguardian.com", "https://www.theguardian.com/")
    renderAppearance()
    expect(document.documentElement.getAttribute("data-look")).toBe(look.id)
    fireEvent.click(screen.getByRole("button", { name: "Remove Guardian" }))
    expect(screen.queryByRole("radio", { name: "Guardian" })).toBeNull()
    expect(parseCustomLooks(window.localStorage.getItem(CUSTOM_LOOKS_STORAGE_KEY))).toEqual([])
    expect(document.documentElement.hasAttribute("data-look")).toBe(false)
  })

  it("hold the maker's form while a new version is being made", async () => {
    addCustomLook(spec("Guardian"), "theguardian.com", "https://www.theguardian.com/")
    let finish: (value: unknown) => void = () => {}
    generate.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    renderAppearance()
    fireEvent.click(screen.getByRole("button", { name: "New version of Guardian" }))
    fireEvent.click(screen.getByRole("button", { name: "Make new version", hidden: true }))

    await screen.findByText(/is making a new version of “Guardian”/)
    expect(screen.getByRole("button", { name: "Make style" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Making style" })).toBeNull()
    finish(made("Guardian, darker"))
    await screen.findByText(/Made version 2 of/)
    expect(screen.getByRole("button", { name: "Make style" })).toBeEnabled()
  })
})

describe("After a style is made", () => {
  it("says so, shows Claude's notes and what the app took back, and asks what to change", async () => {
    generate.mockResolvedValue(
      made(
        "Guardian",
        ["I used their deep blue for the buttons.", "Names are in their serif headline face."],
        ["Certified left these plain, as it couldn't find them on the website: the ID card's pattern."],
      ),
    )
    renderAppearance()
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "theguardian.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Make style" }))

    await screen.findByText(/Made “Guardian” from theguardian.com and switched to it/)
    const notes = screen.getAllByRole("listitem").map((li) => li.textContent)
    expect(notes).toEqual(["I used their deep blue for the buttons.", "Names are in their serif headline face."])
    expect(screen.getByText(/left these plain/)).toBeInTheDocument()

    // A new version straight from the result, with the person's words.
    generate.mockResolvedValue(made("Guardian, darker", ["I made the ID card their darkest blue, as you asked."]))
    fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "A darker ID card" } })
    fireEvent.click(screen.getByRole("button", { name: "Make new version" }))
    await screen.findByText(/Made version 2 of “Guardian, darker”/)
    expect(generate.mock.calls[1][0].request).toBe("A darker ID card")
    expect(generate.mock.calls[1][0].previous.name).toBe("Guardian")
    expect(screen.getByRole("listitem")).toHaveTextContent("I made the ID card their darkest blue, as you asked.")
  })

  it("shows no notes for a style Claude said nothing about", async () => {
    generate.mockResolvedValue(made("Guardian"))
    renderAppearance()
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "theguardian.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Make style" }))
    await screen.findByText(/Made “Guardian”/)
    expect(screen.queryByRole("list", { name: undefined })).toBeNull()
    expect(screen.getByRole("button", { name: "Make new version" })).toBeEnabled()
  })
})
