import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SiteDesign } from "../site-design"

// The real SDK's error classes, a fake client.
const parse = vi.fn()
const retrieve = vi.fn()
const constructed: unknown[] = []

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const real = (await importOriginal()) as { default: new (opts: unknown) => object }
  // Extends the real client, so its static error classes come along.
  class FakeAnthropic extends real.default {
    constructor(opts: unknown) {
      super(opts)
      constructed.push(opts)
      Object.assign(this, { beta: { messages: { parse } }, models: { retrieve } })
    }
  }
  return { ...real, default: FakeAnthropic }
})

const { generateLookSpec, verifyClaudeKey, LookGenerationError, LOOK_MODEL } = await import("../generate-look")
const Anthropic = (await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk")).default

const design: SiteDesign = {
  url: "https://www.example.com/",
  title: "Example",
  siteName: null,
  themeColors: [],
  colorScheme: null,
  hasDarkScheme: false,
  webFonts: [],
  fontFamilies: [],
  pageDeclarations: [],
  colours: { light: [{ value: "#533afd", count: 3, uses: { bg: 3, text: 0, border: 0, other: 0 } }], dark: [] },
  customProperties: [],
  radii: [],
  shadows: [],
  weights: [],
  classNames: [],
  stylesheets: { read: 1, failed: 0 },
}

const pal = {
  canvas: "#FFFFFF", sunken: "#F2F2F2", elevated: "#FFFFFF", text: "#111111", textSecondary: "#444444",
  textMuted: "#666666", border: "#E0E0E0", accent: "#533AFD", button: "#533AFD", buttonText: "#FFFFFF",
}
const answer = {
  name: "Example",
  description: "Violet on white.",
  faces: { ui: "inter", headline: "inter", mono: "geist-mono", numeral: "inter", label: "inter" },
  headlineWeight: 600,
  headlineStrongWeight: 700,
  radius: 8,
  shadows: "soft",
  backdrop: "none",
  light: pal,
  dark: { ...pal, canvas: "#111111", sunken: "#0A0A0A", elevated: "#1C1C1C", text: "#F5F5F5", textSecondary: "#CCCCCC", textMuted: "#A0A0A0", border: "#333333", buttonText: "#FFFFFF" },
}

beforeEach(() => {
  parse.mockReset()
  retrieve.mockReset()
  constructed.length = 0
})

describe("generateLookSpec", () => {
  it("asks Claude from the browser with the person's key and checks the answer", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: answer })
    const spec = await generateLookSpec({ apiKey: "sk-ant-test", design })

    expect(constructed[0]).toMatchObject({ apiKey: "sk-ant-test", dangerouslyAllowBrowser: true })
    const [params] = parse.mock.calls[0]
    expect(params).toMatchObject({
      model: LOOK_MODEL,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
    })
    expect(params.output_config.format).toBeTruthy()
    expect(params.messages[0].content).toContain("<site_design>")
    expect(params.messages[0].content).toContain('"#533afd"')
    expect(params.system).toContain("ignore it")
    expect(spec.name).toBe("Example")
    expect(spec.faces.mono).toBe("geist-mono")
  })

  it("names the site when Claude gives no name", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { ...answer, name: "" } })
    expect((await generateLookSpec({ apiKey: "k", design })).name).toBe("example.com")
  })

  it.each([
    [{ stop_reason: "refusal", parsed_output: null }, "refusal"],
    [{ stop_reason: "max_tokens", parsed_output: null }, "incomplete"],
    [{ stop_reason: "end_turn", parsed_output: { ...answer, light: { ...pal, canvas: "blue" } } }, "invalid"],
  ])("turns a bad answer into a clear error (%#)", async (response, code) => {
    parse.mockResolvedValue(response)
    await expect(generateLookSpec({ apiKey: "k", design })).rejects.toMatchObject({ code })
  })

  it("maps API errors to words for a person", async () => {
    parse.mockRejectedValue(new Anthropic.AuthenticationError(401, { error: { message: "invalid x-api-key" } }, "invalid x-api-key", new Headers()))
    const err = await generateLookSpec({ apiKey: "k", design }).catch((e) => e)
    expect(err).toBeInstanceOf(LookGenerationError)
    expect(err.code).toBe("key")

    parse.mockRejectedValue(new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()))
    await expect(generateLookSpec({ apiKey: "k", design })).rejects.toMatchObject({ code: "rate" })

    parse.mockRejectedValue(new Anthropic.APIUserAbortError())
    await expect(generateLookSpec({ apiKey: "k", design })).rejects.toMatchObject({ code: "aborted" })
  })
})

describe("verifyClaudeKey", () => {
  it("checks the key with a model lookup", async () => {
    retrieve.mockResolvedValue({ id: LOOK_MODEL })
    await expect(verifyClaudeKey("sk-ant-test")).resolves.toBeUndefined()
    expect(retrieve.mock.calls[0][0]).toBe(LOOK_MODEL)

    retrieve.mockRejectedValue(new Anthropic.AuthenticationError(401, undefined, "bad", new Headers()))
    await expect(verifyClaudeKey("nope")).rejects.toMatchObject({ code: "key" })
  })
})
