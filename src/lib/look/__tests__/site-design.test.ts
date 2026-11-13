import { describe, it, expect } from "vitest"
import { digestSite, googleFontFamilies, imageName, normalizeSiteUrl, parseCss, parseHtml } from "../site-design"

const HTML = `<!doctype html><html><head>
<title>Example &amp; Co</title>
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="Example">
<link rel="stylesheet" href="/static/app.css">
<link rel="alternate stylesheet" href="/print.css">
<link rel="preload" as="style" href="https://cdn.example.com/b.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=DM+Serif+Display&display=swap">
<style>:root{--brand:#533AFD;--radius-card:12px}</style>
</head><body class="bg-zinc-950 text-white antialiased">
<a class="rounded-xl bg-violet-600 hover:bg-violet-500 px-4" style="color: #FAFAFA">Go</a>
<div class="md:text-lg rounded-xl grid"></div>
<img src="/img/guilloche/guilloche_01.svg?v=2" alt="" class="absolute">
<img src="/img/Team.JPG" alt="Our team">
<img src="data:image/png;base64,AAAA" aria-hidden="true">
</body></html>`

describe("parseHtml", () => {
  const parts = parseHtml(HTML, "https://example.com/en/")

  it("finds the title, site name and theme colours", () => {
    expect(parts.title).toBe("Example & Co")
    expect(parts.siteName).toBe("Example")
    expect(parts.themeColors).toEqual([{ color: "#0a0a0a", media: "(prefers-color-scheme: dark)" }])
  })

  it("collects stylesheets as absolute URLs, Google Fonts as families", () => {
    expect(parts.stylesheetUrls).toEqual(["https://example.com/static/app.css", "https://cdn.example.com/b.css"])
    expect(parts.googleFonts).toEqual(["Inter", "DM Serif Display"])
    expect(parts.inlineCss).toHaveLength(1)
    expect(parts.styleAttributes).toEqual(["color: #FAFAFA"])
  })

  it("counts the design-bearing class names only", () => {
    const names = parts.classNames.map((c) => c.value)
    expect(names).toContain("bg-zinc-950")
    expect(names).toContain("hover:bg-violet-500")
    expect(names).toContain("md:text-lg")
    expect(names).not.toContain("antialiased")
    expect(names).not.toContain("grid")
    expect(parts.classNames.find((c) => c.value === "rounded-xl")?.count).toBe(2)
  })
})

describe("decorative images", () => {
  it("names the images a page marks as decoration, not its content pictures", () => {
    expect(parseHtml(HTML, "https://example.com/").decorativeImages).toEqual([{ value: "guilloche_01.svg", count: 1 }])
  })

  it("adds CSS background and mask images to the digest", () => {
    const parts = parseHtml(HTML, "https://example.com/")
    const design = digestSite("https://example.com/", parts, [
      `.hero{background:url("/a/noise.png") repeat, #fff} .x{mask-image:url(dots.svg)} .y{background-image:url(data:image/svg+xml,abc)}`,
    ], { read: 1, failed: 0 })
    expect(design.decorativeImages.map((c) => c.value).sort()).toEqual(["dots.svg", "guilloche_01.svg", "noise.png"])
  })

  it("keeps only plain file names", () => {
    expect(imageName("url('https://cdn.example.com/x/Grain-Texture.WEBP?w=2')")).toBe("grain-texture.webp")
    expect(imageName("/fonts/inter.woff2")).toBeNull()
    expect(imageName("data:image/svg+xml;utf8,<svg/>")).toBeNull()
  })
})

describe("googleFontFamilies", () => {
  it("reads both API versions and ignores other hosts", () => {
    expect(googleFontFamilies("https://fonts.googleapis.com/css?family=Roboto:400,700|Lora")).toEqual(["Roboto", "Lora"])
    expect(googleFontFamilies("https://evil.example/css2?family=Inter")).toEqual([])
  })
})

describe("parseCss", () => {
  it("follows nesting and tells the dark scheme apart", () => {
    const decls = parseCss(`
      /* a comment { with braces } */
      @import url("x.css");
      :root { --bg: #fff; color: #111 !important }
      @media (prefers-color-scheme: dark) { :root { --bg: #000 } }
      .dark .card { background: #222 }
      .text-dark { color: #333 }
      .btn { content: "}"; &:hover { color: red } }
      @font-face { font-family: "Brand Sans"; src: url(a.woff2) }
    `)
    const find = (property: string, value: string) => decls.find((d) => d.property === property && d.value === value)
    expect(find("--bg", "#fff")).toMatchObject({ selector: ":root", dark: false })
    expect(find("color", "#111")).toBeTruthy()
    expect(find("--bg", "#000")).toMatchObject({ dark: true, atRule: "@media (prefers-color-scheme: dark)" })
    expect(find("background", "#222")?.dark).toBe(true)
    // A utility called "text-dark" is not a dark scheme.
    expect(find("color", "#333")?.dark).toBe(false)
    expect(find("content", '"}"')).toBeTruthy()
    expect(find("color", "red")?.selector).toBe("&:hover")
    expect(find("font-family", '"Brand Sans"')?.atRule).toBe("@font-face")
  })
})

describe("digestSite", () => {
  const css = `
    :root { --brand: #533AFD; --ink: #061b31; --font-ui: "Söhne", sans-serif }
    @media (prefers-color-scheme: dark) { :root { --ink: #f2f5f9 } }
    html { font-family: var(--font-ui) }
    body { background-color: #F6F9FC; color: var(--ink) }
    .btn { background: var(--brand); border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.1) }
    .card { border: 1px solid #E5EDF5; border-radius: 6px; background: url(bg.png) #fff }
    @font-face { font-family: "Söhne"; src: url(s.woff2) }
    @media (prefers-color-scheme: dark) { body { background-color: #0A1626 } }
  `
  const d = digestSite("https://example.com/", parseHtml(HTML, "https://example.com/"), [css], { read: 1, failed: 0 })

  it("resolves var() and records where colours are used", () => {
    const brand = d.colours.light.find((c) => c.value === "#533afd")
    expect(brand?.uses.bg).toBeGreaterThan(0)
    expect(d.colours.light.find((c) => c.value === "#061b31")?.uses.text).toBe(1)
    expect(d.colours.dark.find((c) => c.value === "#0a1626")?.uses.bg).toBe(1)
    // From a style="" attribute.
    expect(d.colours.light.find((c) => c.value === "#fafafa")).toBeTruthy()
    // Not from inside url().
    expect(d.colours.light.find((c) => c.value === "#ffffff")?.uses.bg).toBe(1)
  })

  it("keeps the page-level declarations, faces, radii and shadows", () => {
    expect(d.pageDeclarations).toContainEqual({ selector: "body", property: "background-color", value: "#F6F9FC", dark: false })
    expect(d.pageDeclarations).toContainEqual({ selector: "html", property: "font-family", value: '"Söhne", sans-serif', dark: false })
    expect(d.webFonts).toEqual(expect.arrayContaining(["Inter", "DM Serif Display", "Söhne"]))
    expect(d.radii[0]).toEqual({ value: "6px", count: 2 })
    expect(d.shadows).toHaveLength(1)
    expect(d.hasDarkScheme).toBe(true)
    expect(d.customProperties.map((v) => v.name)).toEqual(expect.arrayContaining(["--brand", "--ink", "--radius-card"]))
  })
})

describe("normalizeSiteUrl", () => {
  it("adds https and accepts ordinary addresses", () => {
    expect(normalizeSiteUrl("example.com")?.toString()).toBe("https://example.com/")
    expect(normalizeSiteUrl(" https://www.example.com/about#team ")?.toString()).toBe("https://www.example.com/about")
    expect(normalizeSiteUrl("http://example.com:443/")?.hostname).toBe("example.com")
  })

  it("refuses anything that isn't a public web address", () => {
    for (const bad of [
      "",
      "localhost",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://example.com",
      "https://user:pw@example.com",
      "https://example.com:8080",
      "printer.local",
      "https://metadata.google.internal",
      "exa mple.com",
      null,
    ]) {
      expect(normalizeSiteUrl(bad), String(bad)).toBeNull()
    }
  })
})
