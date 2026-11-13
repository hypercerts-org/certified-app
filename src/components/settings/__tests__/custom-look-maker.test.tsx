import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { normalizeLookSpec } from "@/lib/look/custom-look-spec"
import { CLAUDE_KEY_STORAGE_KEY, addCustomLook, parseCustomLooks } from "@/lib/look/custom-looks"
import { CUSTOM_LOOKS_STORAGE_KEY } from "@/lib/look/looks"

const generate = vi.fn()
vi.mock("@/lib/look/generate-look", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/look/generate-look")>()),
  generateLookSpec: (...args: unknown[]) => generate(...args),
}))

const { default: CustomLookMaker } = await import("../custom-look-maker")

const palette = {
  canvas: "#FFFFFF", sunken: "#F2F2F2", elevated: "#FFFFFF", text: "#111111", textSecondary: "#444444",
  textMuted: "#666666", border: "#E0E0E0", accent: "#C70000", button: "#052962", buttonText: "#FFFFFF",
}
const dark = { ...palette, canvas: "#121212", sunken: "#0A0A0A", elevated: "#1E1E1E", text: "#F5F5F5", textSecondary: "#CCCCCC", textMuted: "#A0A0A0", border: "#333333", button: "#F5F5F5", buttonText: "#121212" }
const spec = (name: string) => normalizeLookSpec({ name, light: palette, dark })

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

describe("CustomLookMaker: a new version of a made style", () => {
  it("asks what to change, sends the previous version and the request, and offers the way back", async () => {
    const look = addCustomLook(spec("Guardian"), "theguardian.com", "https://www.theguardian.com/")
    generate.mockResolvedValue(spec("Guardian, darker"))
    render(<CustomLookMaker />)

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

  it("can't make a new version without a key", () => {
    window.localStorage.removeItem(CLAUDE_KEY_STORAGE_KEY)
    addCustomLook(spec("Guardian"), "theguardian.com")
    render(<CustomLookMaker />)
    expect(screen.getByRole("button", { name: "New version of Guardian" })).toBeDisabled()
  })
})
