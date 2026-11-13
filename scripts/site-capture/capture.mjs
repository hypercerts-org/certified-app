// Captures what a website looks like, for making a style from it
// (Settings -> Appearance; src/lib/look/site-capture.ts runs this).
//
//   node capture.mjs <url> <out.json>
//
// Writes one JSON file: screenshots (desktop first screen, desktop one
// screen down, phone), the logo, the share image, computed styles of real
// elements, and the colours covering most of the screens.
//
// The page is someone else's website, with its own scripts. In production
// this runs in a throwaway Vercel Sandbox VM: no secrets inside, destroyed
// afterwards, and the VM's network policy refuses private address ranges
// for every connection Chromium makes (redirects and DNS rebinding
// included). In here, as a second layer (and the only one when a developer
// runs it locally): every request is checked against the same public-address
// rule, only GET and HEAD, no media or sockets, a cap on requests and bytes,
// a fresh context with no stored state, and a hard deadline. Playwright's
// route handler sees a redirect's first hop only, which is why the VM's
// network policy is the guarantee and this is not.

import { lookup } from "node:dns/promises"
import { writeFile } from "node:fs/promises"
import { isIP } from "node:net"

const DEADLINE_MS = 15_000
const MAX_REQUESTS = 300
const MAX_BYTES = 25_000_000
const BLOCKED_TYPES = new Set(["media", "websocket", "eventsource", "manifest", "texttrack", "other"])
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36 CertifiedStyleReader/1.0"
const PROPERTIES = [
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-transform",
  "color",
  "background-color",
  "background-image",
  "border-top",
  "border-radius",
  "box-shadow",
]

/** True for an address no website should make us fetch from: anything but
 *  public unicast (loopback, private, link-local, carrier-grade NAT,
 *  benchmarking, multicast, reserved; for IPv6 anything outside 2000::/3,
 *  plus 6to4, Teredo and documentation). Mirrors isPublicAddress in
 *  src/lib/security/ssrf.ts. */
export function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    )
  }
  if (isIP(address) !== 6) return true
  const v6 = address.toLowerCase()
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateAddress(mapped[1])
  if (!/^[23][0-9a-f]{0,3}:/.test(v6)) return true
  return /^(2002:|2001:0?:|2001:db8:|3fff:)/.test(v6)
}

const hostChecks = new Map()
async function hostIsPublic(host) {
  if (!hostChecks.has(host)) {
    hostChecks.set(
      host,
      (async () => {
        if (isIP(host)) return !isPrivateAddress(host)
        try {
          const all = await lookup(host, { all: true })
          return all.length > 0 && all.every((a) => !isPrivateAddress(a.address))
        } catch {
          return false
        }
      })(),
    )
  }
  return hostChecks.get(host)
}

const hex2 = (n) => Math.round(n).toString(16).padStart(2, "0")

function toLinear(v) {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** OKLab, for telling whether two colours look alike. */
function oklab([r, g, b]) {
  const R = toLinear(r)
  const G = toLinear(g)
  const B = toLinear(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/**
 * The dominant colours in RGBA pixels (as a canvas gives them): bucketed at
 * 4 bits a channel, then buckets that look alike merged, so a gradient or
 * anti-aliasing counts as one colour. Up to `max`, each with its share.
 */
export function dominantColours(pixels, max = 12) {
  const buckets = new Map()
  let total = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++
    e.r += r
    e.g += g
    e.b += b
    buckets.set(key, e)
    total++
  }
  if (!total) return []
  const ranked = [...buckets.values()]
    .map((e) => {
      const rgb = [e.r / e.n, e.g / e.n, e.b / e.n]
      return { n: e.n, rgb, lab: oklab(rgb) }
    })
    .sort((a, b) => b.n - a.n)
  const merged = []
  for (const bucket of ranked) {
    const home = merged.find((m) => Math.hypot(m.lab[0] - bucket.lab[0], m.lab[1] - bucket.lab[1], m.lab[2] - bucket.lab[2]) < 0.05)
    if (home) home.n += bucket.n
    else merged.push({ ...bucket })
  }
  return merged
    .sort((a, b) => b.n - a.n)
    .filter((m) => m.n / total >= 0.004)
    .slice(0, max)
    .map((m) => ({
      hex: `#${hex2(m.rgb[0])}${hex2(m.rgb[1])}${hex2(m.rgb[2])}`.toUpperCase(),
      share: Math.round((m.n / total) * 1000) / 1000,
    }))
}

/** Bot checks and block pages some sites show a headless browser instead
 *  of the site. A capture of one would describe the check, not the site, so
 *  it fails instead (nothing is clicked or solved). */
const BOT_CHECK =
  /(additional security check|security check is required|checking your browser|verify you are (a )?human|are you a robot|attention required|just a moment\.\.\.|access denied|request unsuccessful|enable javascript and cookies to continue|ddos protection by|captcha)/i

export function looksLikeBotCheck(title, text) {
  return BOT_CHECK.test(`${title}\n${String(text).slice(0, 3000)}`)
}

/** Hides the usual consent banners so they don't cover the screenshots
 *  (nothing is accepted or clicked). */
const HIDE_OVERLAYS = `
  #onetrust-consent-sdk, #onetrust-banner-sdk, #CybotCookiebotDialog, .cc-window, .cookie-banner,
  [id*="cookie" i][class*="banner" i], [class*="cookie-consent" i], [class*="cookieconsent" i],
  [id*="consent" i][role="dialog"], [aria-label*="cookie" i][role="dialog"], .qc-cmp2-container,
  #usercentrics-root, .osano-cm-window { display: none !important; }
`

/** Runs in the page: hides fixed or sticky boxes that talk about cookies or
 *  consent (banners the selectors above don't know), modal consent dialogs,
 *  and, once one was found, the full-screen layer that dims the page behind
 *  it. Nothing is clicked or accepted. Run again before each screenshot,
 *  since banners often arrive late. */
function hideConsentBoxes() {
  const consent = (el) => /cookie|consent|gdpr/i.test((el.textContent || "").slice(0, 4000))
  let hidden = 0
  const hide = (el) => {
    el.style.setProperty("display", "none", "important")
    hidden++
  }
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    if (!consent(dialog)) continue
    dialog.close?.()
    hide(dialog)
  }
  const layers = []
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el)
    if (cs.position !== "fixed" && cs.position !== "sticky") continue
    if (el.closest("header, nav")) continue
    if (consent(el)) hide(el)
    else layers.push(el)
  }
  if (hidden) {
    for (const el of layers) {
      const r = el.getBoundingClientRect()
      const covers = r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9
      if (covers && !(el.textContent || "").trim()) hide(el)
    }
    document.documentElement.style.setProperty("overflow", "auto", "important")
    document.body.style.setProperty("overflow", "auto", "important")
  }
  return hidden
}

/** Runs in the page: the computed look of its real elements. */
function readComputed(properties) {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"
  }
  const sample = (el, role) => {
    const cs = getComputedStyle(el)
    const styles = {}
    for (const p of properties) {
      const v = cs.getPropertyValue(p)
      if (!v || v === "none" || v === "normal" || v === "0px" || v === "rgba(0, 0, 0, 0)" || /^0px /.test(v)) continue
      styles[p] = v.slice(0, 200)
    }
    const text = role === "body" ? "" : (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)
    return { role, tag: el.tagName.toLowerCase(), text, styles }
  }
  const out = [sample(document.body, "body")]
  const first = (selector, role) => {
    const el = Array.from(document.querySelectorAll(selector)).find(visible)
    if (el) out.push(sample(el, role))
  }
  first("h1", "h1")
  first("h2", "h2")
  first("h3", "h3")
  first("header, [role=banner]", "header")
  first("nav", "nav")
  first("footer, [role=contentinfo]", "footer")
  first("main p, article p, p", "paragraph")
  first("main a:not(nav a), a:not(nav a)", "link")
  // Buttons with a fill or a border first (the calls to action), then the
  // rest; up to four.
  const drawn = (el) => {
    const cs = getComputedStyle(el)
    const fill = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent"
    return fill || parseFloat(cs.borderTopWidth) > 0 ? 1 : 0
  }
  const buttons = Array.from(document.querySelectorAll("button, a[class*=btn i], a[class*=button i], [role=button], input[type=submit]"))
    .filter(visible)
    .map((el, i) => ({ el, i, drawn: drawn(el) }))
    .sort((a, b) => b.drawn - a.drawn || a.i - b.i)
    .slice(0, 4)
  for (const b of buttons) out.push(sample(b.el, "button"))
  first("input:not([type=hidden]):not([type=submit]), textarea", "input")
  const cards = Array.from(document.querySelectorAll("article, section, li, div"))
    .filter((el) => {
      if (!visible(el)) return false
      const r = el.getBoundingClientRect()
      if (r.width < 120 || r.height < 60 || r.width > window.innerWidth * 0.9) return false
      const cs = getComputedStyle(el)
      return parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none" || cs.backgroundImage !== "none"
    })
    .slice(0, 4)
  for (const c of cards) out.push(sample(c, "card"))
  return out
}

/** Runs in the page (at the top): the large images the site lays behind
 *  its content, decorative <img>s (alt="", aria-hidden) and CSS background
 *  images, within the first two screens and covering at least a fifth of a
 *  screen. Largest first, up to three. */
function findSurfaceImages() {
  const vw = innerWidth
  const vh = innerHeight
  const found = []
  const seen = new Set()
  const consider = (el, src) => {
    if (!src || seen.has(src) || !/^https?:/.test(src)) return
    const r = el.getBoundingClientRect()
    const top = r.top + scrollY
    if (top > vh * 2 || r.width < vw * 0.5 || r.height < 200) return
    const shown = Math.max(0, Math.min(r.bottom + scrollY, vh * 2) - Math.max(top, 0))
    const covers = (Math.min(r.width, vw) * shown) / (vw * vh)
    if (covers < 0.2) return
    seen.add(src)
    found.push({
      src,
      covers: Math.min(2, Math.round(covers * 100) / 100),
      where: top < vh * 0.5 ? "behind the first screen" : "further down the first two screens",
    })
  }
  for (const img of document.images) {
    const decorative =
      img.getAttribute("alt") === "" || img.getAttribute("aria-hidden") === "true" || img.getAttribute("role") === "presentation"
    if (decorative) consider(img, img.currentSrc || img.src)
  }
  for (const el of document.querySelectorAll("body *")) {
    const bg = getComputedStyle(el).backgroundImage
    const m = bg && bg !== "none" ? /url\(["']?([^"')]+)["']?\)/.exec(bg) : null
    if (m) {
      try {
        consider(el, new URL(m[1], document.baseURI).href)
      } catch {
        // not a URL
      }
    }
  }
  return found.sort((a, b) => b.covers - a.covers).slice(0, 3)
}

/** The largest site image a capture hands on, as base64 characters. */
const MAX_SITE_IMAGE_CHARS = 90_000

/** A site image re-drawn as a JPEG (on white, for transparent ones), at
 *  most 640 wide and 640 tall, smaller until it fits the size cap. Drawn by
 *  the browser and screenshotted, so a cross-origin image works. */
async function renderSiteImage(context, src) {
  const page = await context.newPage()
  try {
    for (const [width, quality] of [
      [640, 72],
      [480, 62],
      [360, 55],
    ]) {
      await page.setViewportSize({ width, height: width })
      const ok = await page.evaluate(
        async ([url, w]) => {
          document.body.innerHTML = ""
          document.body.style.cssText = "margin:0;background:#fff"
          const img = document.createElement("img")
          img.style.cssText = `display:block;width:${w}px;max-height:${w}px;object-fit:cover;object-position:center`
          document.body.appendChild(img)
          img.src = url
          try {
            await img.decode()
            return img.naturalWidth > 0
          } catch {
            return false
          }
        },
        [src, width],
      )
      if (!ok) return null
      const jpeg = await page.locator("img").screenshot({ type: "jpeg", quality, timeout: 2000 })
      const data = b64(jpeg)
      if (data.length <= MAX_SITE_IMAGE_CHARS) return data
    }
    return null
  } catch {
    return null
  } finally {
    await page.close().catch(() => {})
  }
}

/** A JPEG's average colour and how busy it is: 0 for a flat or calm
 *  texture, 1 for a busy photograph (the spread of its lightness). */
export function imageStats(pixels) {
  let n = 0
  let r = 0
  let g = 0
  let b = 0
  const lum = []
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    r += pixels[i]
    g += pixels[i + 1]
    b += pixels[i + 2]
    lum.push((0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255)
    n++
  }
  if (!n) return { average: "#808080", busy: 0.5 }
  const mean = lum.reduce((a, v) => a + v, 0) / n
  const sd = Math.sqrt(lum.reduce((a, v) => a + (v - mean) ** 2, 0) / n)
  return {
    average: `#${hex2(r / n)}${hex2(g / n)}${hex2(b / n)}`.toUpperCase(),
    busy: Math.round(Math.min(1, sd * 3.5) * 100) / 100,
  }
}

const LOGO_SELECTORS = [
  'header a[href="/"] img',
  'header a[href="/"] svg',
  'a[href="/"] img',
  'a[href="/"] svg',
  '[class*="logo" i] img',
  '[class*="logo" i] svg',
  'img[alt*="logo" i]',
  "header img",
  "header svg",
]

async function captureLogo(page) {
  for (const selector of LOGO_SELECTORS) {
    const loc = page.locator(selector).first()
    try {
      if (!(await loc.isVisible({ timeout: 300 }))) continue
      const box = await loc.boundingBox()
      if (!box || box.width < 24 || box.height < 12 || box.width > 600 || box.height > 300) continue
      return await loc.screenshot({ type: "png", omitBackground: true, timeout: 1500 })
    } catch {
      continue
    }
  }
  return null
}

async function captureShareImage(context, src) {
  const page = await context.newPage()
  try {
    await page.setViewportSize({ width: 1200, height: 630 })
    const ok = await page.evaluate(async (url) => {
      document.body.style.margin = "0"
      const img = document.createElement("img")
      img.style.cssText = "display:block;width:1200px;height:auto"
      document.body.appendChild(img)
      img.src = url
      try {
        await img.decode()
        return true
      } catch {
        return false
      }
    }, src)
    if (!ok) return null
    return await page.locator("img").screenshot({ type: "jpeg", quality: 72, timeout: 2000 })
  } catch {
    return null
  } finally {
    await page.close().catch(() => {})
  }
}

async function samplePixels(context, images) {
  const page = await context.newPage()
  try {
    return await page.evaluate(async (sources) => {
      const all = []
      for (const src of sources) {
        const img = new Image()
        img.src = src
        await img.decode()
        const w = 120
        const h = Math.max(1, Math.round((img.height * w) / img.width))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        ctx.drawImage(img, 0, 0, w, h)
        all.push(Array.from(ctx.getImageData(0, 0, w, h).data))
      }
      return all
    }, images).then((parts) => parts.flat())
  } finally {
    await page.close().catch(() => {})
  }
}

const b64 = (buf) => Buffer.from(buf).toString("base64")

export async function capture(url, { chromium, executablePath } = {}) {
  const started = Date.now()
  const left = () => Math.max(500, DEADLINE_MS - (Date.now() - started))
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-sync",
      "--no-pings",
      "--mute-audio",
      "--hide-scrollbars",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      userAgent: UA,
      locale: "en-US",
      serviceWorkers: "block",
      acceptDownloads: false,
    })
    const budget = { requests: 0, bytes: 0 }
    await context.route("**/*", async (route) => {
      const request = route.request()
      let target
      try {
        target = new URL(request.url())
      } catch {
        return route.abort("blockedbyclient")
      }
      if (target.protocol === "data:" || target.protocol === "blob:") return route.continue()
      const allowed =
        (target.protocol === "https:" || target.protocol === "http:") &&
        (request.method() === "GET" || request.method() === "HEAD") &&
        !BLOCKED_TYPES.has(request.resourceType()) &&
        budget.requests < MAX_REQUESTS &&
        budget.bytes < MAX_BYTES &&
        Date.now() - started < DEADLINE_MS &&
        (await hostIsPublic(target.hostname))
      if (!allowed) return route.abort("blockedbyclient")
      budget.requests++
      return route.continue()
    })
    context.on("response", async (response) => {
      const length = Number(response.headers()["content-length"] ?? 0)
      if (Number.isFinite(length)) budget.bytes += length
    })

    const page = await context.newPage()
    page.setDefaultTimeout(5_000)
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(10_000, left()) })
    await page.waitForLoadState("load", { timeout: Math.min(5_000, left()) }).catch(() => {})
    await page.waitForLoadState("networkidle", { timeout: Math.min(2_500, left()) }).catch(() => {})
    const shown = await page
      .evaluate(() => ({ title: document.title, text: document.body?.innerText ?? "" }))
      .catch(() => ({ title: "", text: "" }))
    if (looksLikeBotCheck(shown.title, shown.text)) {
      throw new Error("the site showed a bot check instead of its page")
    }
    await page.addStyleTag({ content: HIDE_OVERLAYS }).catch(() => {})
    const tidy = () => page.evaluate(hideConsentBoxes).catch(() => 0)
    await tidy()
    await Promise.race([page.evaluate(() => document.fonts.ready.then(() => true)), page.waitForTimeout(1_500)]).catch(() => {})

    await tidy()
    const desktopTop = await page.screenshot({ type: "jpeg", quality: 72 })
    const surfaceCandidates = await page.evaluate(findSurfaceImages).catch(() => [])
    const computed = await page.evaluate(readComputed, PROPERTIES).catch(() => [])
    const logo = await captureLogo(page)
    const shareUrl = await page
      .evaluate(() => {
        const meta = document.querySelector('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]')
        return meta ? new URL(meta.getAttribute("content") || "", document.baseURI).toString() : null
      })
      .catch(() => null)

    await page.evaluate(() => window.scrollTo(0, window.innerHeight)).catch(() => {})
    await page.waitForTimeout(500)
    await tidy()
    const desktopScrolled = await page.screenshot({ type: "jpeg", quality: 72 })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
    await page.waitForTimeout(700)
    await tidy()
    const phone = await page.screenshot({ type: "jpeg", quality: 72 })

    const shareImage = shareUrl && /^https?:/.test(shareUrl) && left() > 2_000 ? await captureShareImage(context, shareUrl) : null
    const surfaceImages = []
    for (const candidate of surfaceCandidates) {
      if (left() < 2_500) break
      const data = await renderSiteImage(context, candidate.src)
      if (!data) continue
      const stats = imageStats(await samplePixels(context, [`data:image/jpeg;base64,${data}`]).catch(() => []))
      const id = `site-image-${surfaceImages.length + 1}`
      surfaceImages.push({
        id,
        label: `${id}: an image the site lays ${candidate.where}, covering ${Math.round(Math.min(1, candidate.covers) * 100)}% of a screen`,
        mediaType: "image/jpeg",
        data,
        where: candidate.where,
        covers: candidate.covers,
        ...stats,
      })
    }
    const pixels = await samplePixels(context, [
      `data:image/jpeg;base64,${b64(desktopTop)}`,
      `data:image/jpeg;base64,${b64(phone)}`,
    ]).catch(() => [])

    return {
      url: page.url(),
      screenshots: [
        { label: "Desktop, 1280 wide: the first screen", mediaType: "image/jpeg", data: b64(desktopTop) },
        { label: "Desktop, 1280 wide: one screen further down", mediaType: "image/jpeg", data: b64(desktopScrolled) },
        { label: "Phone, 390 wide: the first screen", mediaType: "image/jpeg", data: b64(phone) },
      ],
      logo: logo ? { label: "The site's logo", mediaType: "image/png", data: b64(logo) } : null,
      shareImage: shareImage ? { label: "The site's share image (og:image)", mediaType: "image/jpeg", data: b64(shareImage) } : null,
      computed,
      visibleColours: dominantColours(pixels),
      surfaceImages,
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

// Run as a script: node capture.mjs <url> <out.json>
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [url, out] = process.argv.slice(2)
  if (!url || !out) {
    console.error("usage: node capture.mjs <url> <out.json>")
    process.exit(2)
  }
  const { chromium } = await import("playwright-core")
  const hardStop = setTimeout(() => {
    console.error("capture: out of time")
    process.exit(3)
  }, DEADLINE_MS + 10_000)
  try {
    const result = await capture(url, { chromium, executablePath: process.env.CHROME_PATH || undefined })
    await writeFile(out, JSON.stringify(result))
    clearTimeout(hardStop)
    process.exit(0)
  } catch (err) {
    console.error(`capture: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
