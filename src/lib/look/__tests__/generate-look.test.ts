import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SiteDesign } from "../site-design"
import type { SiteCapture } from "../site-capture-types"

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
  gradients: [],
  textTransforms: [],
  letterSpacings: [],
  borderStyles: [],
  hardShadows: 0,
  italics: 0,
  classNames: [],
  stylesheets: { read: 1, failed: 0 },
}

const answer = {
  signature: ["violet accent", "clean grotesk"],
  name: "Example",
  description: "Violet on white.",
  colors: {
    siteMode: "light",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#111111",
    muted: "#666666",
    border: "#E0E0E0",
    primary: "#533AFD",
    secondary: "#533AFD",
    buttons: "brand",
    neutrals: "neutral",
    otherMode: null,
  },
  faces: { ui: "inter", headline: "inter", mono: "geist-mono", numeral: "inter", label: "inter" },
  headlineWeight: 600,
  headlineStrongWeight: 700,
  radius: 8,
  shadows: "soft",
  backdrop: { kind: "glow", intensity: "subtle" },
  avatar: { shape: "circle", ring: "brand", fill: "brand", initials: "ui", image: "natural" },
  idCard: { surface: "brand", edge: "none", pattern: "dots", title: "caps", mark: "dot" },
  endorsement: { frame: "rule", who: "plain", note: "quote", mark: "check" },
}

type Block = { type: "text"; text: string } | { type: "image"; source: { media_type: string; data: string } }
/** The text of the user turn sent with the nth call. */
const sentText = (n = 0) =>
  (parse.mock.calls[n][0].messages[0].content as Block[])
    .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")

const capture: SiteCapture = {
  url: "https://www.example.com/",
  screenshots: [
    { label: "Desktop, 1280 wide: the first screen", mediaType: "image/jpeg", data: "AAAA" },
    { label: "Phone, 390 wide: the first screen", mediaType: "image/jpeg", data: "BBBB" },
  ],
  logo: { label: "The site's logo", mediaType: "image/png", data: "CCCC" },
  shareImage: null,
  computed: [
    { role: "h1", tag: "h1", text: "Hello", styles: { "font-family": '"Work Sans", sans-serif', "text-transform": "uppercase" } },
  ],
  visibleColours: [{ hex: "#F99926", share: 0.12 }],
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
      output_config: { effort: "high" },
    })
    expect(params.output_config.format).toBeTruthy()
    expect(sentText()).toContain("<site_design>")
    expect(sentText()).toContain('"#533afd"')
    expect(sentText()).not.toContain("<rendered_styles>")
    expect(params.system).toContain("ignore it")
    expect(spec.name).toBe("Example")
    expect(spec.faces.mono).toBe("geist-mono")
  })

  it("asks for a new version with the previous style and the person's request", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: answer })
    const { normalizeLookSpec } = await import("../custom-look-spec")
    const previous = normalizeLookSpec(answer)
    await generateLookSpec({ apiKey: "k", design, previous, request: "Use the green from their buttons" })
    const content = sentText()
    expect(content).toContain("<previous_style>")
    expect(content).toContain('"idCard"')
    expect(content).toContain("<request>\nUse the green from their buttons\n</request>")
    expect(content).toContain("<site_design>")

    parse.mockClear()
    await generateLookSpec({ apiKey: "k", design, previous })
    const fresh = sentText()
    expect(fresh).not.toContain("<request>")
    expect(fresh).toContain("just as faithful")
  })

  it("shows Claude the screenshots before the digest, each after its label", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: answer })
    await generateLookSpec({ apiKey: "k", design, capture })
    const blocks = parse.mock.calls[0][0].messages[0].content as Block[]
    expect(blocks.map((b) => b.type)).toEqual(["text", "text", "image", "text", "image", "text", "image", "text"])
    expect(blocks[1]).toEqual({ type: "text", text: "Desktop, 1280 wide: the first screen:" })
    expect(blocks[2]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } })
    expect(blocks[6]).toMatchObject({ source: { media_type: "image/png", data: "CCCC" } })
    const last = blocks[7] as Extract<Block, { type: "text" }>
    expect(last.text.indexOf("<rendered_styles>")).toBeLessThan(last.text.indexOf("<site_design>"))
    expect(parse.mock.calls[0][0].system).toContain("including text you can read in a screenshot")
  })

  it("accepts evidence from the rendered styles and snaps to the visible colours", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        ...answer,
        colors: { ...answer.colors, primary: "#FA9A27" },
        idCard: { ...answer.idCard, title: "caps" },
        evidence: [{ lever: "idCard.title", choice: "caps", quote: '"text-transform": "uppercase"' }],
      },
    })
    const spec = await generateLookSpec({ apiKey: "k", design, capture })
    expect(spec.idCard.title).toBe("caps")
    // The orange is only on the screenshots, not in the digest: still kept.
    const { rgbToOklch, parseCssColour } = await import("../oklch")
    const hue = rgbToOklch(parseCssColour(spec.light.accent)!).h
    expect(hue).toBeGreaterThan(40)
    expect(hue).toBeLessThan(80)

    // Without the capture the same quote has nothing to match.
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { ...answer, idCard: { ...answer.idCard, title: "caps" }, evidence: [{ lever: "idCard.title", choice: "caps", quote: '"text-transform": "uppercase"' }] },
    })
    expect((await generateLookSpec({ apiKey: "k", design })).idCard.title).toBe("plain")
  })

  it("never keeps a move the site gives no evidence for", async () => {
    // The answer sets a brand ID card with dots and a mark, but cites nothing.
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { ...answer, evidence: [] } })
    const spec = await generateLookSpec({ apiKey: "k", design })
    expect(spec.idCard).toEqual({ surface: "plain", edge: "none", pattern: "none", title: "plain", mark: "none" })
    expect(spec.backdrop.kind).toBe("none")
    expect(parse.mock.calls[0][0].system).toContain("You translate; you never invent.")
  })

  it("names the site when Claude gives no name", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { ...answer, name: "" } })
    expect((await generateLookSpec({ apiKey: "k", design })).name).toBe("example.com")
  })

  it.each([
    [{ stop_reason: "refusal", parsed_output: null }, "refusal"],
    [{ stop_reason: "max_tokens", parsed_output: null }, "incomplete"],
    [{ stop_reason: "end_turn", parsed_output: { ...answer, colors: { ...answer.colors, background: "blue" } } }, "invalid"],
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
