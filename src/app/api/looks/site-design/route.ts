import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { guardedFetch } from "@/lib/security/ssrf"
import { logSafe } from "@/lib/utils/log-safe"
import { digestSite, normalizeSiteUrl, parseHtml, type SiteDesign } from "@/lib/look/site-design"

/**
 * `GET /api/looks/site-design?url=<site>` — the design digest of a website,
 * for making a style from it (Settings → Appearance; src/lib/look/).
 *
 * Reads the page and up to MAX_SHEETS of its stylesheets (bundlers split a
 * site's CSS into dozens of small files, and the tokens can be in any of
 * them), server side
 * because a browser can't read another site's HTML and CSS (CORS), and
 * returns only the digest (colours, faces, radii …), never the pages.
 * The person's Claude API key is not involved: the browser sends the
 * digest to Claude itself.
 *
 * Every fetch goes through `guardedFetch` (public addresses only, each
 * redirect hop checked), with a time and size cap. Signed-in only and
 * rate-limited, so it is not an open page reader.
 */

export interface SiteDesignResponse {
  design?: SiteDesign
  error?: string
}

// Making a style is a deliberate act; 20 reads per 10 minutes is plenty.
const LIMITER = makeLimiter("site-design", 20, 600)

const UA = "Mozilla/5.0 (compatible; CertifiedStyleReader/1.0; +https://certified.app)"
const MAX_HTML_BYTES = 2_000_000
const MAX_SHEET_BYTES = 1_500_000
const MAX_SHEETS = 40
const MAX_CSS_BYTES = 8_000_000
const SHEET_CONCURRENCY = 8
const PAGE_TIMEOUT_MS = 10_000
const SHEET_TIMEOUT_MS = 8_000

class TooLargeError extends Error {}

/** The body as text, stopping at `max` bytes (a page may be cut there, a
 *  stylesheet is dropped). */
async function readCapped(res: Response, max: number, cut: boolean): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      if (!cut) throw new TooLargeError()
      chunks.push(value.slice(0, value.byteLength - (size - max)))
      break
    }
    chunks.push(value)
  }
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

function fail(error: string, status: number) {
  return NextResponse.json<SiteDesignResponse>({ error }, { status })
}

export async function GET(request: NextRequest) {
  const did = await getSessionDid()
  if (!did) return fail("Sign in to make a style.", 401)

  const denied = await enforceRateLimit(LIMITER, did, "Too many websites in a short time. Try again in a few minutes.")
  if (denied) return denied

  const url = normalizeSiteUrl(request.nextUrl.searchParams.get("url"))
  if (!url) return fail("That doesn't look like a website address.", 400)

  let page: Response
  try {
    page = await guardedFetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (err) {
    logSafe("[site-design] page fetch failed", err)
    return fail("Couldn't reach that website.", 502)
  }
  if (!page.ok) {
    await page.body?.cancel()
    return fail(`The website answered with an error (${page.status}).`, 502)
  }
  const type = page.headers.get("content-type") ?? ""
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
    await page.body?.cancel()
    return fail("That address isn't a web page.", 422)
  }

  let html: string
  try {
    html = await readCapped(page, MAX_HTML_BYTES, true)
  } catch (err) {
    logSafe("[site-design] page read failed", err)
    return fail("Couldn't read that website.", 502)
  }

  // Relative stylesheet links resolve against where the page ended up.
  const finalUrl = page.url || url.toString()
  const parts = parseHtml(html, finalUrl)

  const fetchSheet = async (href: string) => {
    const res = await guardedFetch(href, {
      headers: { "user-agent": UA, accept: "text/css,*/*;q=0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(SHEET_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw new Error(`stylesheet ${res.status}`)
    }
    return readCapped(res, MAX_SHEET_BYTES, false)
  }

  // A few at a time, in page order, until the byte budget is spent.
  const hrefs = parts.stylesheetUrls.slice(0, MAX_SHEETS)
  const css: string[] = []
  let cssBytes = 0
  let failed = 0
  for (let i = 0; i < hrefs.length && cssBytes < MAX_CSS_BYTES; i += SHEET_CONCURRENCY) {
    const batch = await Promise.allSettled(hrefs.slice(i, i + SHEET_CONCURRENCY).map(fetchSheet))
    for (const result of batch) {
      if (result.status === "rejected") failed++
      else if (cssBytes + result.value.length <= MAX_CSS_BYTES) {
        css.push(result.value)
        cssBytes += result.value.length
      }
    }
  }
  const stats = { read: css.length, failed }

  const design = digestSite(finalUrl, parts, css, stats)
  const empty =
    design.colours.light.length + design.colours.dark.length + design.customProperties.length === 0
  if (empty) {
    return fail(
      "Couldn't find any colours on that page. Some sites only draw their page with JavaScript; try another address.",
      422,
    )
  }

  return NextResponse.json<SiteDesignResponse>(
    { design },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
